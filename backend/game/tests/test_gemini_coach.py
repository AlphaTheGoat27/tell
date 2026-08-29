import os

import pytest

import game.gemini_coach as gemini_coach
from game.gemini_coach import assess_guess, collect_facts
from game.holdem import PracticeHand, PracticeGames


def make_game(hole, board, street, pot=1.5):
    game = PracticeHand(players=2)
    game.hands = [hole, ["2d", "3s"]]
    game.board = board
    game.street = street
    game.pot = pot
    return game


def test_assess_guess_rejects_impossible_trips():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    result = assess_guess(game, "9, 9, 9, 7, 7")
    assert result["topic"] == "best_hand"
    assert result["correct"] is False
    assert "Two Pair" in result["truth"]
    assert "only 2" in result["note"]


def test_assess_guess_affirms_correct_answer():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    result = assess_guess(game, "9 9 7 7 4")
    assert result["correct"] is True


def test_assess_guess_class_names():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    assert assess_guess(game, "two pair")["correct"] is True
    assert assess_guess(game, "trips")["correct"] is False


def test_assess_guess_partial_answer_is_incomplete():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    result = assess_guess(game, "9 9 7")
    assert result["correct"] is None


def test_assess_guess_ignores_preflop():
    game = make_game(["7c", "9c"], [], "preflop")
    assert assess_guess(game, "9 9 9") is None
    assert assess_guess(game, "two pair") is None


def test_collect_facts_grounds_the_numbers():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    facts = collect_facts(game)
    assert facts["hand_class"] == "Two Pair"
    assert "40.0%" in facts["pot_odds"]
    assert facts["outs"].startswith("4 outs")
    assert facts["board"]


def test_collect_facts_preflop_tier():
    game = make_game(["3s", "8h"], [], "preflop")
    facts = collect_facts(game)
    assert facts["preflop_tier"] == "weak"


def test_collect_facts_showdown_explains_winner():
    game = make_game(["6h", "4d"], ["Ac", "7d", "9s", "Qs", "9d"], "showdown")
    game.hands[1] = ["Ad", "Ks"]
    game.complete = True
    game.winner = 1
    game.result = "Casey wins with Two Pair."
    facts = collect_facts(game)
    assert "showdown_hands" in facts
    assert "winner_explanation" in facts
    assert "Alex" in facts["winner_explanation"]
    assert "Two Pair" in facts["winner_explanation"]


def test_collect_facts_after_fold_describes_prediction_state():
    game = make_game(["6h", "4d"], ["Ac", "7d", "9s", "Qs", "9d"], "showdown")
    game.hero_folded = True
    game.hero_fold_street = "preflop"
    game.needs_prediction = True
    facts = collect_facts(game)
    assert "situation" in facts and "folded" in facts["situation"]
    assert "showdown_hands" in facts
    assert "best_five" not in facts


def test_system_prompt_carries_truth_and_verdict():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    assessment = assess_guess(game, "9, 9, 9, 7, 7")
    prompt = gemini_coach._system_prompt(collect_facts(game), assessment)
    assert "GROUND TRUTH" in prompt
    assert "WRONG" in prompt
    assert "Two Pair" in prompt


def test_chat_falls_back_to_deterministic_coach(monkeypatch):
    monkeypatch.setattr(gemini_coach, "_unavailable", True)
    monkeypatch.setattr(gemini_coach, "_client", None)
    games = PracticeGames()
    public = games.create(2)
    game = games.games[public["id"]]
    game.hands[0] = ["7c", "9c"]
    game.board = ["9h", "7d", "4h"]
    game.street = "flop"
    result = games.chat(public["id"], "9, 9, 9, 7, 7")
    assert result.get("engine") != "gemini"
    assert result["correct"] is False
    assert "Two Pair" in result["reply"]


@pytest.mark.skipif(
    not os.environ.get("TELL_LIVE_GEMINI"),
    reason="set TELL_LIVE_GEMINI=1 to run the live Gemini check",
)
def test_live_gemini_reply_is_grounded():
    monkeypatch_state = (gemini_coach._unavailable, gemini_coach._client)
    gemini_coach._unavailable = False
    gemini_coach._client = None
    try:
        game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
        result = gemini_coach.gemini_reply(game, "9, 9, 9, 7, 7")
        assert result["engine"] == "gemini"
        assert result["correct"] is False
        reply = result["reply"].lower()
        assert len(reply) > 20
        assert any(word in reply for word in ("not", "wrong", "incorrect", "no,"))
    finally:
        gemini_coach._unavailable, gemini_coach._client = monkeypatch_state
