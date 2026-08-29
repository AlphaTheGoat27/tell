from game.hand_reader import best_five, draw_outs, format_cards


def test_best_five_two_pair():
    # 7c 9c on 9h 7d 4h -> two pair (nines and sevens), kicker 4
    result = best_five(["7c", "9c"], ["9h", "7d", "4h"])
    assert result["class"] == "Two Pair"
    assert sorted(result["ranks"].items()) == [("4", 1), ("7", 2), ("9", 2)]


def test_best_five_does_not_invent_a_third_nine():
    # Regression for the "9, 9, 9, 7, 7" bug: only two nines are in play,
    # so the best hand must be two pair, never three of a kind.
    result = best_five(["7c", "9c"], ["9h", "7d", "4h"])
    assert result["ranks"]["9"] == 2
    assert result["class"] != "Three of a Kind"
    assert len(result["cards"]) == 5


def test_best_five_straight_beats_two_pair():
    # 8c 9c on 7h Td Jh -> a straight (7-8-9-10-J)
    result = best_five(["8c", "9c"], ["7h", "Td", "Jh"])
    assert result["class"] == "Straight"


def test_best_five_flush():
    result = best_five(["Ac", "Kc"], ["2c", "7c", "9c"])
    assert result["class"] == "Flush"


def test_draw_outs_flush_draw_is_nine():
    # Ac Kc on 2c 7c 9h: nine clubs complete the flush.
    outs = draw_outs(["Ac", "Kc"], ["2c", "7c", "9h"])
    clubs = [c for c in outs if c.endswith("c")]
    assert len(clubs) == 9


def test_draw_outs_no_outs_for_made_two_pair():
    # Two pair with no draw should not report a huge outs count.
    outs = draw_outs(["7c", "9c"], ["9h", "7d", "4h"])
    assert len(outs) <= 6


def test_format_cards_uses_suit_symbols():
    assert format_cards(["7c", "9c"]) == "7\u2663 9\u2663"
