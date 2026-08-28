from models.hand import Hand, Action, DecisionPoint, Street, ActionType, LeakTag


def test_round_trip_through_firestore_dict():
    original = Hand(
        id="hand_1",
        user_id="user_1",
        raw_text="some raw hand history",
        hero_cards=["Ah", "Kd"],
        board=["Kh", "7c", "2s", "5d", "9h"],
        actions=[
            Action(Street.PREFLOP, "hero", ActionType.RAISE, 3.0),
            Action(Street.PREFLOP, "villain_1", ActionType.CALL, 2.0),
        ],
        decision_points=[
            DecisionPoint(
                street=Street.RIVER,
                pot_before=55.0,
                call_amount=20.0,
                required_equity=0.2667,
                computed_equity=1.0,
                action_taken=ActionType.CALL,
                leak_tag=None,
            )
        ],
        leak_tags=[LeakTag.CHASING_BELOW_ODDS],
        parsed_at="2026-08-28T00:00:00Z",
    )

    as_dict = original.to_firestore_dict()

    # Firestore dicts should be plain JSON-safe types -- no enums leaking through
    assert as_dict["actions"][0]["street"] == "preflop"
    assert as_dict["actions"][0]["action_type"] == "raise"
    assert as_dict["leak_tags"] == ["chasing_below_odds"]

    restored = Hand.from_firestore_dict(as_dict)

    assert restored.id == original.id
    assert restored.hero_cards == original.hero_cards
    assert restored.actions[0].action_type == ActionType.RAISE
    assert restored.decision_points[0].call_amount == 20.0
    assert restored.leak_tags[0] == LeakTag.CHASING_BELOW_ODDS


def test_empty_hand_round_trips_cleanly():
    original = Hand(id="h2", user_id="u1", raw_text="")
    restored = Hand.from_firestore_dict(original.to_firestore_dict())
    assert restored.hero_cards == []
    assert restored.decision_points == []
