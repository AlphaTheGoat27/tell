import pytest

from models.hand import Action, ActionType, Street
from leak_detection.leak_detector import compute_decision_points, evaluate_decision_point
from parsers.structured_parser import looks_like_structured_export, parse_structured_hand


SAMPLE_HAND = """Hand #123: Hold'em No Limit ($0.50/$1.00)
Seat 1: Hero ($100.00 in chips)
Seat 2: Villain1 ($95.50 in chips)
Hero: posts small blind $0.50
Villain1: posts big blind $1.00
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
Hero: raises $2.50 to $3.00
Villain1: calls $2.00
*** FLOP *** [Kh 7c 2s]
Villain1: checks
Hero: bets $4.50
Villain1: calls $4.50
*** TURN *** [Kh 7c 2s 5d]
Villain1: checks
Hero: bets $10.00
Villain1: calls $10.00
*** RIVER *** [Kh 7c 2s 5d 9h]
Villain1: bets $20.00
Hero: calls $20.00
*** SHOW DOWN ***
Villain1: shows [Qh Qd] (a pair of Queens)
Hero: shows [Ah Kd] (a pair of Kings)
"""


class TestPotTracking:
    def test_river_decision_point_matches_hand_math(self):
        """
        Manual math for this hand:
        preflop: 0.5 + 1.0 posted = 1.5; hero raises to 3.00 (+2.5) = 4.0;
                 villain calls $2.00 (matching to 3.00) = 6.0 at flop
        flop: hero bets 4.50 -> 10.5; villain calls 4.50 -> 15.0 at turn
        turn: hero bets 10.00 -> 25.0; villain calls 10.00 -> 35.0 at river
        river: villain bets 20.00 -> 55.0; hero calls 20.00
               => pot_before = 55.0, call_amount = 20.0
        """
        parsed = parse_structured_hand(SAMPLE_HAND)
        decision_points = compute_decision_points(parsed["actions"])

        assert len(decision_points) == 1  # hero only called once (the river)
        river_dp = decision_points[0]
        assert river_dp.street == Street.RIVER
        assert river_dp.pot_before == pytest.approx(55.0)
        assert river_dp.call_amount == pytest.approx(20.0)


class TestStructuredParser:
    def test_detects_structured_format(self):
        assert looks_like_structured_export(SAMPLE_HAND)
        assert not looks_like_structured_export("I had AK and raised, they called...")

    def test_extracts_hero_cards_and_board(self):
        parsed = parse_structured_hand(SAMPLE_HAND)
        assert parsed["hero_cards"] == ["Ah", "Kd"]
        assert parsed["board"] == ["Kh", "7c", "2s", "5d", "9h"]

    def test_extracts_showdown(self):
        parsed = parse_structured_hand(SAMPLE_HAND)
        assert parsed["showdown"]["hero"] == ["Ah", "Kd"]
        assert parsed["showdown"]["villain1"] == ["Qh", "Qd"]


class TestLeakDetection:
    def test_good_call_is_not_flagged(self):
        """Hero's river call: required ~26.7% equity, but hero's pair of
        Kings beats villain's pair of Queens on this fully-dealt board, so
        real equity is 100%. This was a good call -- no leak."""
        parsed = parse_structured_hand(SAMPLE_HAND)
        decision_points = compute_decision_points(parsed["actions"])
        river_dp = decision_points[0]

        result = evaluate_decision_point(
            river_dp,
            hero_cards=parsed["hero_cards"],
            board_at_street=parsed["board"],
            villain_hand=parsed["showdown"]["villain1"],
        )

        assert result.required_equity == pytest.approx(20 / 75, abs=0.001)
        assert result.computed_equity == pytest.approx(1.0, abs=0.01)
        assert result.leak_tag is None

    def test_bad_call_is_flagged(self):
        """Synthetic case: hero calls a small bet needing only 10% equity,
        but is drawing dead on a fully-dealt board (0% real equity) --
        this should be flagged even though the price looks cheap."""
        from models.hand import DecisionPoint

        dp = DecisionPoint(
            street=Street.RIVER,
            pot_before=90.0,
            call_amount=10.0,
            action_taken=ActionType.CALL,
        )
        # hero has zero pair, zero draw; villain has trip jacks -- hero is drawing dead
        result = evaluate_decision_point(
            dp,
            hero_cards=["3d", "5c"],
            board_at_street=["2h", "7c", "9d", "Jc", "4s"],
            villain_hand=["Jh", "Js"],  # trips jacks with the board's Jc
        )

        assert result.computed_equity == pytest.approx(0.0, abs=0.01)
        assert result.leak_tag.value == "chasing_below_odds"

    def test_no_villain_hand_means_no_verdict(self):
        """If we don't know what villain had, we show required_equity but
        don't guess at a leak tag -- that's the Socratic agent's job to ask about."""
        from models.hand import DecisionPoint

        dp = DecisionPoint(street=Street.RIVER, pot_before=55.0, call_amount=20.0)
        result = evaluate_decision_point(dp, hero_cards=["Ah", "Kd"], board_at_street=["Kh", "7c", "2s", "5d", "9h"])

        assert result.required_equity is not None
        assert result.computed_equity is None
        assert result.leak_tag is None
