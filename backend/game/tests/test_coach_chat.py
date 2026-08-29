from game.coach_chat import coach_reply, extract_rank_tokens, mentioned_classes
from game.holdem import PracticeHand


def make_game(hole, board, street, pot=1.5):
    game = PracticeHand(players=2)
    game.hands = [hole, ["2d", "3s"]]
    game.board = board
    game.street = street
    game.pot = pot
    return game


def test_wrong_best_hand_answer_is_corrected():
    # The exact exchange from the study session: hero 7c 9c on 9h 7d 4h.
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    result = coach_reply(game, "9, 9, 9, 7, 7")
    assert result["topic"] == "best_hand"
    assert result["correct"] is False
    assert "Not quite" in result["reply"]
    # The correction must name the real hand (two pair, not trips).
    assert "Two Pair" in result["reply"]
    # And it must explain that only two nines exist.
    assert "2" in result["reply"] and "9" in result["reply"]


def test_correct_best_hand_answer_is_affirmed():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    result = coach_reply(game, "9 9 7 7 4")
    assert result["correct"] is True
    assert "Correct" in result["reply"]


def test_class_name_answers_are_graded():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    assert coach_reply(game, "two pair")["correct"] is True
    assert coach_reply(game, "trips")["correct"] is False


def test_outs_question_gives_a_small_sane_count():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    result = coach_reply(game, "what are my outs?")
    assert result["topic"] == "outs"
    # Made two pair: only the remaining nines and sevens fill up.
    assert "4 unseen cards" in result["reply"]
    assert "Rule of 4" in result["reply"]


def test_pot_odds_uses_the_math_engine():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop", pot=1.5)
    result = coach_reply(game, "pot odds?")
    assert result["topic"] == "pot_odds"
    # call 1 / (pot 1.5 + call 1) = 40.0%
    assert "40.0%" in result["reply"]


def test_strength_question_postflop():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h"], "flop")
    result = coach_reply(game, "how strong is my hand?")
    assert result["topic"] == "strength"
    assert "two pair" in result["reply"].lower()


def test_preflop_strength_uses_tier():
    game = make_game(["7c", "9c"], [], "preflop")
    result = coach_reply(game, "how strong is my hand?")
    assert result["topic"] == "strength"
    assert "playable" in result["reply"]


def test_complete_hand_reminds_to_deal_again():
    game = make_game(["7c", "9c"], ["9h", "7d", "4h", "2s", "3h"], "showdown")
    game.complete = True
    game.result = "You win with Two Pair."
    result = coach_reply(game, "what are my outs?")
    assert result["topic"] == "result"


def test_rank_tokens_and_class_parsing():
    assert extract_rank_tokens("9, 9, 9, 7, 7") == ["9", "9", "9", "7", "7"]
    assert extract_rank_tokens("K Q J 10 9") == ["K", "Q", "J", "T", "9"]
    assert extract_rank_tokens("I have a pair of aces") == ["A"]
    assert extract_rank_tokens("the pot is 10 dollars") == ["T"]
    assert mentioned_classes("i flopped two pair") == ["Two Pair"]
    assert mentioned_classes("maybe trips?") == ["Three of a Kind"]
