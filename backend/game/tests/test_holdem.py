from game.holdem import PracticeHand


def test_showdown_reveals_every_hand_and_a_winner():
    game = PracticeHand.deal(3)
    for _ in range(4):
        game.act("check")

    public = game.public()
    assert public["complete"]
    assert not public["needs_prediction"]
    assert len(public["showdown_hands"]) == 3
    # "You win with ..." when hero wins, "<Bot> wins with ..." otherwise.
    assert "win" in public["result"] and "with" in public["result"]


def test_hero_can_act_through_all_streets():
    game = PracticeHand.deal(2)
    game.act("check")
    public = game.public()
    assert not public["needs_prediction"]
    assert public["available_actions"]
    assert public["street"] == "flop"

    for _ in range(3):
        game.act("check")
    public = game.public()
    assert public["complete"]
    assert not public["needs_prediction"]


def test_fold_reveals_bot_cards_for_the_prediction():
    game = PracticeHand.deal(3)
    game.act("fold")
    public = game.public()
    assert public["needs_prediction"]
    assert public["hero_folded"]
    assert len(public["showdown_hands"]) == 3
    assert not public["complete"]

    game.bot_round(predicted_winner=1)
    public = game.public()
    assert public["complete"]
    assert public["winner"] is not None
