"""
Turns a flat action list into hero decision points with pot-odds math
attached, and tags leaks where the numbers say a call was wrong.

Scope note (deliberately narrow for MVP): this only evaluates CALL
decisions. "Should hero have bet/raised instead of checking" (missed_value_bet)
and "was this preflop open too wide" (overwide_preflop_open) need different
logic -- comparing against RangeChart data or a showdown reveal -- and are a
Phase 2 addition. Pot-odds-on-a-call is the cleanest fully-automatable check,
so that's what ships first.

computed_equity is only ever filled in when we actually know (or the user's
Socratic-session answer tells us) what villain was holding -- either from a
showdown reveal in the parsed hand, or from an explicit villain_hand passed
in by the calling code. Without that, required_equity is still shown, but
computed_equity and the leak tag are left as None: the product asks the user
what they thought villain had before it can judge the call, it doesn't guess.
"""

from models.hand import Action, ActionType, DecisionPoint, LeakTag, Street
from math_engine.equity import calculate_equity
from math_engine.pot_odds import calculate_pot_odds


def compute_decision_points(actions: list[Action]) -> list[DecisionPoint]:
    """Walks the action list, tracking pot size, and records one DecisionPoint
    per hero CALL with pot_before/call_amount already computed."""
    decision_points: list[DecisionPoint] = []
    pot = 0.0
    street_contributions: dict[str, float] = {}
    current_street: Street | None = None

    for action in actions:
        if action.street != current_street:
            current_street = action.street
            street_contributions = {}

        if action.action_type in (ActionType.POST, ActionType.BET):
            amt = action.amount or 0.0
            pot += amt
            street_contributions[action.actor] = street_contributions.get(action.actor, 0.0) + amt

        elif action.action_type == ActionType.RAISE:
            # amount holds the "to" total for this actor on this street
            new_total = action.amount or 0.0
            already_in = street_contributions.get(action.actor, 0.0)
            pot += max(new_total - already_in, 0.0)
            street_contributions[action.actor] = new_total

        elif action.action_type == ActionType.CALL:
            call_amt = action.amount or 0.0
            if action.actor == "hero":
                decision_points.append(
                    DecisionPoint(
                        street=action.street,
                        pot_before=pot,
                        call_amount=call_amt,
                        action_taken=ActionType.CALL,
                    )
                )
            pot += call_amt
            street_contributions[action.actor] = street_contributions.get(action.actor, 0.0) + call_amt

        # CHECK and FOLD never change the pot

    return decision_points


def evaluate_decision_point(
    dp: DecisionPoint,
    hero_cards: list[str],
    board_at_street: list[str],
    villain_hand: list[str] | None = None,
) -> DecisionPoint:
    """
    Fills in required_equity always, and computed_equity + leak_tag only
    when villain_hand is known. Returns a NEW DecisionPoint (doesn't mutate).
    """
    pot_odds = calculate_pot_odds(dp.pot_before, dp.call_amount)

    computed_equity = None
    leak_tag = None

    if villain_hand is not None:
        equity = calculate_equity(
            hero_hand=hero_cards,
            board=board_at_street,
            villain_hand=villain_hand,
            iterations=20_000,
        )
        computed_equity = equity.win + (equity.tie / 2)  # ties split the pot

        if computed_equity < pot_odds.required_equity:
            leak_tag = LeakTag.CHASING_BELOW_ODDS

    return DecisionPoint(
        street=dp.street,
        pot_before=dp.pot_before,
        call_amount=dp.call_amount,
        required_equity=pot_odds.required_equity,
        computed_equity=computed_equity,
        action_taken=dp.action_taken,
        leak_tag=leak_tag,
    )
