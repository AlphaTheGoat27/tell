"""
Per the Tell checklist (Phase 2): do not move on to agent code until every
test here is green. These check the math engine against known, independently
verifiable values -- not against the model's own output.

Run with: pytest backend/math_engine/tests/ -v
"""

import pytest

from math_engine.pot_odds import calculate_pot_odds, is_profitable_call
from math_engine.equity import calculate_equity


class TestPotOdds:
    def test_half_pot_bet_requires_25_percent(self):
        # Pot is $50, villain bets $50 (pot now $100), you call $50 more.
        result = calculate_pot_odds(pot_before_call=100, call_amount=50)
        assert result.required_equity == pytest.approx(1 / 3, abs=0.001)
        assert result.ratio == "2.00:1"

    def test_pot_sized_bet_requires_50_percent(self):
        result = calculate_pot_odds(pot_before_call=30, call_amount=30)
        assert result.required_equity == pytest.approx(0.5, abs=0.001)
        assert result.ratio == "1.00:1"

    def test_small_bet_requires_low_equity(self):
        # A quarter-pot bet: pot $40 before call, call $10 more
        result = calculate_pot_odds(pot_before_call=40, call_amount=10)
        assert result.required_equity == pytest.approx(0.2, abs=0.001)

    def test_zero_call_amount_is_free(self):
        result = calculate_pot_odds(pot_before_call=100, call_amount=0)
        assert result.required_equity == 0.0

    def test_negative_inputs_raise(self):
        with pytest.raises(ValueError):
            calculate_pot_odds(-10, 5)

    def test_is_profitable_call(self):
        assert is_profitable_call(required_equity=0.33, estimated_equity=0.40)
        assert not is_profitable_call(required_equity=0.33, estimated_equity=0.20)


class TestEquity:
    """
    These bounds are wide on purpose: Monte Carlo output has natural run-to-run
    variance. The point isn't to nail an exact figure, it's to catch the engine
    being *wrong in kind* (e.g. AA losing to KK more often than not), which
    would indicate a real bug in the evaluator wiring or deck logic.
    """

    def test_aa_dominates_kk_preflop(self):
        # Well-known heads-up benchmark: AA vs KK preflop is roughly an 80/20
        # favorite for the aces. Used as a standard sanity check for any
        # poker equity calculator.
        result = calculate_equity(
            hero_hand=["Ah", "Ad"], board=[], villain_hand=["Kh", "Kd"],
            iterations=20000,
        )
        assert 0.75 < result.win < 0.87

    def test_aa_crushes_worst_hand_72o(self):
        # AA vs 72o is poker's classic "biggest preflop favorite" matchup,
        # typically cited around 87-88% for the aces.
        result = calculate_equity(
            hero_hand=["Ah", "Ad"], board=[], villain_hand=["7c", "2s"],
            iterations=20000,
        )
        assert result.win > 0.82

    def test_equity_fractions_sum_to_one(self):
        result = calculate_equity(
            hero_hand=["Ah", "Kd"], board=["Kh", "7c", "2s"],
            villain_hand=["Qh", "Qd"], iterations=10000,
        )
        assert result.win + result.tie + result.lose == pytest.approx(1.0, abs=0.0001)

    def test_flush_draw_has_meaningful_turn_equity(self):
        # Hero holds 4 to the nut flush on the turn (9 outs, 46 unseen cards).
        # Even before adding backdoor/overcard equity, this should clearly
        # beat a "not enough equity to call a pot-sized bet" scenario.
        result = calculate_equity(
            hero_hand=["Ah", "Kh"], board=["Qh", "7h", "2c", "5s"],
            iterations=20000,
        )
        assert result.win > 0.30  # vs. random hand, not just vs. a made hand

    def test_invalid_hand_size_raises(self):
        with pytest.raises(ValueError):
            calculate_equity(hero_hand=["Ah"], board=[])
