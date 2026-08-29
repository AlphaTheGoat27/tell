"""Deterministic chat coach for practice hands.

The coach answers questions (hand strength, pot odds, outs) and checks the
learner's answers to its own quizzes (best five-card hand) using only the
math in hand_reader / math_engine — never a language model.
"""

import re
from collections import Counter

from game.hand_reader import (
    available_ranks,
    best_five,
    draw_labels,
    draw_outs,
    format_cards,
    rank_locations,
    readable_rank,
)
from game.holdem import _preflop_read
from math_engine.pot_odds import calculate_pot_odds

RANK_WORDS = {
    "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8",
    "9": "9", "10": "T", "t": "T", "j": "J", "q": "Q", "k": "K", "a": "A",
    "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
    "seven": "7", "eight": "8", "nine": "9", "ten": "T",
    "jack": "J", "queen": "Q", "king": "K", "ace": "A",
}

# Single uppercase letters only (so the article "a" never reads as an Ace).
TOKEN_RE = re.compile(
    r"\b(?:10s?|[2-9]s?|[TJQKA]|(?i:(?:two|three|four|five|six|seven|eight|nine|ten|jack|queen|king|ace)s?))\b"
)

CLASS_WORDS = [
    (r"straight flush", "Straight Flush"),
    (r"four of a kind|quads", "Four of a Kind"),
    (r"full house|boat", "Full House"),
    (r"flush", "Flush"),
    (r"straight", "Straight"),
    (r"three of a kind|trips|set", "Three of a Kind"),
    (r"two pair", "Two Pair"),
    (r"one pair|a pair|pair", "Pair"),
    (r"high card|no pair", "High Card"),
]


def extract_rank_tokens(text: str) -> list[str]:
    tokens = []
    for match in TOKEN_RE.finditer(text):
        token = match.group(0).lower()
        if token not in RANK_WORDS and token.endswith("s"):
            token = token[:-1]
        if token in RANK_WORDS:
            tokens.append(RANK_WORDS[token])
    return tokens


def mentioned_classes(lower_text: str) -> list[str]:
    found: list[str] = []
    text = lower_text
    for pattern, name in CLASS_WORDS:
        if re.search(pattern, text):
            found.append(name)
            text = re.sub(pattern, " ", text)
    return found


def _reply(text: str, topic: str, correct: bool | None = None) -> dict:
    return {"reply": text, "topic": topic, "correct": correct}


def _preflop_tip(hole: list[str]) -> tuple[str, str]:
    tier, tip = _preflop_read(hole)
    plain = " ".join(hole)
    return tip.replace(plain, format_cards(hole), 1), tier


def _best_hand_line(best: dict) -> str:
    return f"{format_cards(best['cards'])} — {best['class']}"


def _grade_card_list(game, tokens: list[str]) -> dict:
    hole = game.hands[0]
    board = game.board
    best = best_five(hole, board)
    if len(tokens) < 5:
        return _reply(
            f"That's only {len(tokens)} card{'s' if len(tokens) != 1 else ''} — your best hand uses exactly five of the seven available (your two plus the board). Give me all five.",
            "best_hand",
        )
    guess = Counter(tokens[:5])
    if guess == best["ranks"]:
        return _reply(
            f"Correct — {_best_hand_line(best)}. That's your best five-card hand.",
            "best_hand",
            correct=True,
        )
    available = available_ranks(hole, board)
    problems = []
    for rank, count in guess.items():
        have = available.get(rank, 0)
        name = readable_rank(rank)
        if have == 0:
            problems.append(f"there is no {name} in your hand or on the board")
        elif count > have:
            where = rank_locations(hole, board, rank)
            problems.append(
                f"you counted {count} {name}s, but only {have} {'is' if have == 1 else 'are'} in play ({where})"
            )
    if problems:
        detail = " ".join(p[0].upper() + p[1:] + "." for p in problems)
        return _reply(
            f"Not quite. {detail} The best five-card hand is {_best_hand_line(best)}.",
            "best_hand",
            correct=False,
        )
    return _reply(
        f"Not quite — there is a stronger five-card combo: {_best_hand_line(best)}.",
        "best_hand",
        correct=False,
    )


def _grade_class(game, mentioned: list[str]) -> dict:
    hole = game.hands[0]
    board = game.board
    best = best_five(hole, board)
    if best["class"] in mentioned:
        return _reply(
            f"Right — {_best_hand_line(best)}.",
            "best_hand",
            correct=True,
        )
    said = " or ".join(mentioned)
    return _reply(
        f"Not quite. You said {said}, but the best you can make is {_best_hand_line(best)}.",
        "best_hand",
        correct=False,
    )


def _answer_outs(game) -> dict:
    hole = game.hands[0]
    board = game.board
    if game.hero_folded:
        return _reply(
            "You folded, so no more cards are coming to you. Pick the bot you think wins with the buttons.",
            "outs",
        )
    if not board:
        tip, tier = _preflop_tip(hole)
        return _reply(
            f"Outs matter once the flop is out. Preflop, focus on your starting hand: {tip} ({tier}).",
            "outs",
        )
    if len(board) == 5:
        best = best_five(hole, board)
        return _reply(f"No cards to come — your hand is made: {_best_hand_line(best)}.", "outs")
    outs = draw_outs(hole, board)
    draws = draw_labels(hole, board)
    rule = 4 if len(board) == 3 else 2
    approx = min(len(outs) * rule, 100)
    streets_left = "by the river" if len(board) == 3 else "on the river"
    draw_line = f" You hold {' and '.join(draws)}." if draws else ""
    cards_shown = format_cards(outs[:12])
    return _reply(
        f"{len(outs)} unseen cards improve your hand right now: {cards_shown}.{draw_line} "
        f"Rule of {rule}: that's roughly {approx}% to improve {streets_left}.",
        "outs",
    )


def _answer_pot_odds(game) -> dict:
    call_amount = 1.0
    odds = calculate_pot_odds(game.pot, call_amount)
    return _reply(
        f"The pot is ${game.pot:.2f} and a call costs ${call_amount:.2f}. "
        f"Required equity = call ÷ (pot + call) = {odds.required_equity_pct} (about {odds.ratio}). "
        f"If your chance of winning is better than {odds.required_equity_pct}, the call pays off long-term.",
        "pot_odds",
    )


def _answer_strength(game) -> dict:
    hole = game.hands[0]
    board = game.board
    if game.hero_folded:
        return _reply(
            "You folded this hand — nothing left to build. Pick the winner with the buttons.",
            "strength",
        )
    if not board:
        tip, tier = _preflop_tip(hole)
        return _reply(f"{tip}. That makes it a {tier} hand.", "strength")
    best = best_five(hole, board)
    draws = draw_labels(hole, board)
    draw_line = f" You also hold {' and '.join(draws)}." if draws else ""
    equity_line = ""
    try:
        from math_engine.equity import calculate_equity

        equity = calculate_equity(hole, board, iterations=2000)
        equity_line = f" Versus a random hand you win about {equity.win_pct}."
    except Exception:
        pass
    return _reply(
        f"You're currently showing {best['class'].lower()}: {format_cards(best['cards'])}.{draw_line}{equity_line}",
        "strength",
    )


def _answer_why(game) -> dict:
    hole = game.hands[0]
    board = game.board
    if not board:
        tip, _tier = _preflop_tip(hole)
        return _reply(
            f"Preflop you only know your two cards, so judge connectedness, suits, and high cards: {tip}",
            "why",
        )
    best = best_five(hole, board)
    return _reply(
        "You build the best five-card hand from any five of your seven cards — your two plus the board. "
        f"Here that's {_best_hand_line(best)}. Try swapping cards in and out: if any five-card combo beats it, that's your real hand.",
        "why",
    )


def coach_reply(game, message: str) -> dict:
    """Return {reply, topic, correct, street} for a user chat message."""
    result = _route(game, message)
    result["street"] = game.street
    return result


def _route(game, message: str) -> dict:
    text = (message or "").strip()
    lower = text.lower()

    if game.complete:
        return _reply(
            f"This hand is over — {game.result or 'no result recorded'} Deal another to keep playing.",
            "result",
        )

    if re.search(r"\bouts?\b", lower) or "improve" in lower:
        return _answer_outs(game)
    if "pot odds" in lower or re.search(r"\bodds\b", lower) or "equity" in lower:
        return _answer_pot_odds(game)
    if re.search(r"\bstrength\b|\bstrong\b|what do i have|how good", lower):
        return _answer_strength(game)
    if re.search(r"\bwhy\b|\bexplain\b|\bhow come\b", lower):
        return _answer_why(game)

    tokens = extract_rank_tokens(text)
    if game.board:
        if len(tokens) >= 3:
            return _grade_card_list(game, tokens)
        mentioned = mentioned_classes(lower)
        if mentioned:
            return _grade_class(game, mentioned)
        if len(tokens) in (1, 2):
            return _reply(
                "Name all five cards of your best hand — e.g. type them like 9 9 7 7 4.",
                "best_hand",
            )
    else:
        if tokens or mentioned_classes(lower):
            return _reply(
                "No board cards yet — your best hand is just your two hole cards. Wait for the flop, then I'll quiz you on the five-card hand.",
                "best_hand",
            )

    if game.board:
        return _reply(
            "Type your best five cards and I'll check them (like 9 9 7 7 4), or ask me about hand strength, pot odds, or outs.",
            "fallback",
        )
    tip, _tier = _preflop_tip(game.hands[0]) if game.hands else ("check your cards", "weak")
    return _reply(
        f"Preflop: {tip}. Ask me 'how strong is my hand?' or take an action with the buttons.",
        "fallback",
    )
