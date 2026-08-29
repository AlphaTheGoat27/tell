"""Deterministic hand reading: best five cards, draws, and outs.

No LLM calls in this file — the chat coach must quote numbers that come
from here, never invent them.
"""

from collections import Counter
from itertools import combinations

from treys import Card, Evaluator

RANKS = "23456789TJQKA"
SUITS = "shdc"
SUIT_SYMBOLS = {"s": "\u2660", "h": "\u2665", "d": "\u2666", "c": "\u2663"}

_EVALUATOR = Evaluator()


def format_card(card: str) -> str:
    """'9c' -> '9♣', 'Ts' -> '10♠'."""
    rank = card[:-1].upper()
    if rank == "T":
        rank = "10"
    return rank + SUIT_SYMBOLS.get(card[-1].lower(), card[-1])


def format_cards(cards: list[str]) -> str:
    return " ".join(format_card(c) for c in cards)


def readable_rank(rank: str) -> str:
    return "10" if rank.upper() == "T" else rank.upper()


def best_five(hole: list[str], board: list[str]) -> dict:
    """Best five-card hand from hole + board (board must have 3-5 cards)."""
    if len(board) not in (3, 4, 5):
        raise ValueError("best_five needs a flop, turn, or river board")
    board_cards = [Card.new(c) for c in board]
    hand_cards = [Card.new(c) for c in hole]
    score = _EVALUATOR.evaluate(board_cards, hand_cards)
    rank_class = _EVALUATOR.get_rank_class(score)

    all_cards = hand_cards + board_cards
    best_subset = None
    best_subset_score = None
    for subset in combinations(all_cards, 5):
        # Evaluating exactly these five cards (3 as board, 2 as hand) gives
        # the subset's standalone hand value — treys picks the best five of five.
        subset_score = _EVALUATOR.evaluate(list(subset[:3]), list(subset[3:]))
        if best_subset_score is None or subset_score < best_subset_score:
            best_subset_score = subset_score
            best_subset = subset

    cards = [Card.int_to_str(c) for c in best_subset]
    return {
        "cards": cards,
        "ranks": Counter(c[:-1].upper() for c in cards),
        "class": _EVALUATOR.class_to_string(rank_class),
        "class_id": rank_class,
        "score": score,
    }


def available_ranks(hole: list[str], board: list[str]) -> Counter:
    """How many copies of each rank are in play (hole + board)."""
    return Counter(c[:-1].upper() for c in list(hole) + list(board))


def rank_locations(hole: list[str], board: list[str], rank: str) -> str:
    """Human description of where every copy of a rank sits."""
    in_hand = [format_card(c) for c in hole if c[:-1].upper() == rank]
    on_board = [format_card(c) for c in board if c[:-1].upper() == rank]
    parts = []
    if in_hand:
        parts.append("your " + " and ".join(in_hand))
    if on_board:
        parts.append("the board's " + " and ".join(on_board))
    return " and ".join(parts)


def improving_cards(hole: list[str], board: list[str]) -> list[str]:
    """Every unseen card that strictly improves the hero's current hand.

    Raw enumeration — includes kicker re-pairs, so it reads high. Prefer
    draw_outs() for coaching answers.
    """
    if len(board) not in (3, 4):
        return []
    board_cards = [Card.new(c) for c in board]
    hand_cards = [Card.new(c) for c in hole]
    base_score = _EVALUATOR.evaluate(board_cards, hand_cards)
    used = {c.lower() for c in list(hole) + list(board)}
    outs = []
    for rank in RANKS:
        for suit in SUITS:
            candidate = rank + suit
            if candidate in used:
                continue
            new_score = _EVALUATOR.evaluate(board_cards + [Card.new(candidate)], hand_cards)
            if new_score < base_score:
                outs.append(candidate)
    return outs


def draw_outs(hole: list[str], board: list[str]) -> list[str]:
    """Teaching outs: cards completing flush/straight draws, cards that
    fill up a made hand (trips or better), and overcards pairing into top pair."""
    if len(board) not in (3, 4):
        return []
    all_cards = list(hole) + list(board)
    used = {c.lower() for c in all_cards}
    outs: list[str] = []

    # Flush draw completions.
    for suit in SUITS:
        total = sum(1 for c in all_cards if c[-1].lower() == suit)
        in_hand = sum(1 for c in hole if c[-1].lower() == suit)
        if total == 4 and in_hand >= 1:
            for rank in RANKS:
                candidate = rank + suit
                if candidate.lower() not in used:
                    outs.append(candidate)

    # Straight draw completions.
    made = best_five(hole, board)
    if made["class_id"] > 5:
        values = {RANKS.index(c[:-1].upper()) + 2 for c in all_cards}
        if 14 in values:
            values.add(1)
        completion_values = set()
        for low in range(1, 11):
            window = set(range(low, low + 5))
            if len(window & values) == 4:
                completion_values.update(window - values)
        for value in completion_values:
            rank = RANKS[value - 2] if value >= 2 else "A"
            for suit in SUITS:
                candidate = rank + suit
                if candidate.lower() not in used:
                    outs.append(candidate)

    # Fill-up cards: hero holds the rank and it already appears 2+ times
    # in play, so one more copy makes trips / a full house / quads.
    in_play = Counter(c[:-1].upper() for c in all_cards)
    hero_ranks = {c[:-1].upper() for c in hole}
    for rank in hero_ranks:
        if in_play[rank] >= 2:
            for suit in SUITS:
                candidate = rank + suit
                if candidate.lower() not in used:
                    outs.append(candidate)

    # Overcards: hole ranks above the board's top rank pair into top pair.
    board_top = max(RANKS.index(c[:-1].upper()) for c in board)
    for card in hole:
        if RANKS.index(card[:-1].upper()) > board_top:
            for suit in SUITS:
                candidate = card[:-1] + suit
                if candidate.lower() not in used:
                    outs.append(candidate)

    seen = set()
    unique = []
    for card in outs:
        key = card.lower()
        if key not in seen:
            seen.add(key)
            unique.append(card)
    return unique


def draw_labels(hole: list[str], board: list[str]) -> list[str]:
    """Named draws the hero holds (flush draw, straight draws)."""
    if len(board) not in (3, 4):
        return []
    labels: list[str] = []
    made = best_five(hole, board)

    for suit in SUITS:
        total = sum(1 for c in list(hole) + list(board) if c[-1].lower() == suit)
        in_hand = sum(1 for c in hole if c[-1].lower() == suit)
        if total == 4 and in_hand >= 1:
            symbol = SUIT_SYMBOLS[suit]
            labels.append(f"{symbol} flush draw")

    # Straight draws only matter when no straight is already made.
    if made["class_id"] > 5:
        values = {RANKS.index(c[:-1].upper()) + 2 for c in list(hole) + list(board)}
        if 14 in values:
            values.add(1)
        completions = set()
        for low in range(1, 11):
            window = set(range(low, low + 5))
            present = window & values
            if len(present) == 4:
                completions.update(window - values)
        if len(completions) >= 2:
            labels.append("straight draw (two cards can complete it)")
        elif len(completions) == 1:
            labels.append("gutshot straight draw (one card completes it)")

    return labels


def outs_summary(hole: list[str], board: list[str]) -> dict:
    outs = draw_outs(hole, board)
    return {
        "outs": outs,
        "count": len(outs),
        "draws": draw_labels(hole, board),
        "street": "flop" if len(board) == 3 else "turn" if len(board) == 4 else "none",
    }
