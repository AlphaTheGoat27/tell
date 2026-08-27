"""
Hand equity via Monte Carlo simulation. No LLM calls anywhere in this file.

Uses the `treys` library for 7-card hand evaluation (pip install treys).
This gives Tell's Coach Agent a real win/tie/lose percentage to reveal
after the Socratic questioning step, instead of a model-generated guess.

NOTE on accuracy vs. speed: this MVP version always Monte Carlo samples.
For river-only spots (all 5 board cards known), you could swap this for
exact single-enumeration (no randomness needed at all, since there's only
one unknown card left in some cases) -- a good Phase 2 upgrade once the
MVP loop is working end to end.
"""

from dataclasses import dataclass

from treys import Card, Deck, Evaluator

_evaluator = Evaluator()


@dataclass
class EquityResult:
    win: float
    tie: float
    lose: float
    iterations: int

    @property
    def win_pct(self) -> str:
        return f"{self.win * 100:.1f}%"


def calculate_equity(
    hero_hand: list[str],
    board: list[str],
    villain_hand: list[str] | None = None,
    iterations: int = 20_000,
) -> EquityResult:
    """
    hero_hand:    2 cards, treys notation, e.g. ['Ah', 'Kd']
    board:        0, 3, 4, or 5 known board cards, e.g. ['Kh', '7c', '2s']
    villain_hand: 2 cards if known, or None to simulate vs. a uniformly
                  random hand (a range-weighted version is a Phase 2 upgrade:
                  sample villain hands from a stored range instead of the
                  full random deck)
    iterations:   Monte Carlo sample count. 20k is near-instant and gives
                  +/- ~0.5% precision, which is plenty for coaching purposes.

    Returns an EquityResult with win/tie/lose as fractions summing to 1.0.
    """
    if len(hero_hand) != 2:
        raise ValueError("hero_hand must have exactly 2 cards")
    if len(board) not in (0, 3, 4, 5):
        raise ValueError("board must have 0, 3, 4, or 5 cards")
    if villain_hand is not None and len(villain_hand) != 2:
        raise ValueError("villain_hand must have exactly 2 cards if provided")

    hero = [Card.new(c) for c in hero_hand]
    known_board = [Card.new(c) for c in board]
    fixed_villain = [Card.new(c) for c in villain_hand] if villain_hand else None

    wins = ties = losses = 0
    remaining_board_count = 5 - len(known_board)

    for _ in range(iterations):
        deck = Deck()
        for c in hero + known_board:
            deck.cards.remove(c)

        if fixed_villain:
            villain = fixed_villain
            for c in villain:
                deck.cards.remove(c)
        else:
            villain = deck.draw(2)

        full_board = known_board + deck.draw(remaining_board_count)

        hero_score = _evaluator.evaluate(full_board, hero)
        villain_score = _evaluator.evaluate(full_board, villain)

        # treys convention: LOWER score = STRONGER hand
        if hero_score < villain_score:
            wins += 1
        elif hero_score == villain_score:
            ties += 1
        else:
            losses += 1

    return EquityResult(
        win=wins / iterations,
        tie=ties / iterations,
        lose=losses / iterations,
        iterations=iterations,
    )
