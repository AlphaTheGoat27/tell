"""
Deterministic pot odds math. No LLM calls anywhere in this file, ever.

This module is the "single source of truth" referenced in the Tell PRD
(Section 7.2, rule #2): the Coach Agent must always read numbers from here,
never generate them.
"""

from dataclasses import dataclass


@dataclass
class PotOddsResult:
    required_equity: float  # 0.0-1.0, the win% you need to profitably call
    required_equity_pct: str  # human-readable, e.g. "33.3%"
    ratio: str  # traditional form, e.g. "2:1"


def calculate_pot_odds(pot_before_call: float, call_amount: float) -> PotOddsResult:
    """
    pot_before_call: size of the pot BEFORE you put in the call amount
                      (i.e. what's already in there, including villain's bet)
    call_amount:      how much more you need to put in to continue

    Formula: required_equity = call_amount / (pot_before_call + call_amount)

    Example: pot is $100 (after villain's $50 bet is already in it, so pot
    was $50 before their bet), you must call $50 more:
        pot_before_call = 100, call_amount = 50
        required_equity = 50 / (100 + 50) = 0.3333 -> need ~33.3% equity to call
    """
    if pot_before_call < 0 or call_amount < 0:
        raise ValueError("pot_before_call and call_amount must be non-negative")

    if call_amount == 0:
        return PotOddsResult(0.0, "0.0%", "N/A")

    required_equity = call_amount / (pot_before_call + call_amount)
    ratio = pot_before_call / call_amount

    return PotOddsResult(
        required_equity=required_equity,
        required_equity_pct=f"{required_equity * 100:.1f}%",
        ratio=f"{ratio:.2f}:1",
    )


def is_profitable_call(required_equity: float, estimated_equity: float) -> bool:
    """
    Straight comparison: is your estimated equity (from equity.py, or a
    villain-range estimate) above the bar required_equity sets?
    """
    return estimated_equity > required_equity
