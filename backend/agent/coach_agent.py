"""
Local Socratic coach seam. next_question() is the deterministic fallback
bank (used if ADK/Gemini is unavailable, or as a template the LLM can lean
on) -- but the real coaching value comes from agent.py's root_agent, which
uses Gemini to phrase these questions around the SPECIFIC hand in front of
it, while calling back into math_engine (via the tool functions below) for
any actual number instead of generating one itself.
"""

from math_engine.equity import calculate_equity
from math_engine.pot_odds import calculate_pot_odds


def next_question(level: int = 1) -> str:
    """Fallback/template question bank, keyed by hint-escalation level."""
    questions = {
        1: "What range of hands did you think your opponent could have?",
        2: "How does the pot size compare with the amount you had to call?",
        3: "What equity would a call need to break even here?",
        4: "Let's walk through the pot odds and equity step by step.",
    }
    return questions.get(level, questions[4])


def get_required_equity(pot_before_call: float, call_amount: float) -> str:
    """
    ADK tool function: the agent calls this instead of stating a pot-odds
    number itself. Returns a short string (tool outputs must be
    JSON/text-serializable) so the model can relay it, not invent it.
    """
    result = calculate_pot_odds(pot_before_call, call_amount)
    return (
        f"required_equity={result.required_equity_pct} "
        f"(pot_odds_ratio={result.ratio})"
    )


def get_hand_equity(hero_cards: list[str], board: list[str], villain_cards: list[str]) -> str:
    """
    ADK tool function: real Monte Carlo equity via the math engine. Only
    callable once the user has stated what they think villain had --
    the agent should ask that BEFORE calling this, never guess villain's
    hand on its own.
    """
    result = calculate_equity(hero_cards, board, villain_cards, iterations=20_000)
    return f"hero_win={result.win_pct} (win={result.win:.3f}, tie={result.tie:.3f}, lose={result.lose:.3f})"