"""
Deterministic parser for a common online-poker hand-history export style
(the PokerStars-family text format that many sites and tracking tools use
or replicate). No LLM call anywhere in this file -- if the input matches
this structure, we get perfect, instant, free parsing.

This is the FAST PATH. Free-form recaps ("I had AK, raised, got called,
flop came King high...") don't match this structure and fall through to
the LLM-based Analyst Agent instead (see backend/agent/analyst_agent.py).
Deciding which path to use is a simple structural check: does the text
contain the header/section markers this format always has?

Expected format (abbreviated example):

    Hand #123: Hold'em No Limit ($0.50/$1.00)
    Seat 1: Hero ($100.00 in chips)
    Seat 2: Villain1 ($95.50 in chips)
    Hero: posts small blind $0.50
    Villain1: posts big blind $1.00
    *** HOLE CARDS ***
    Dealt to Hero [Ah Kd]
    Hero: raises $2.00 to $3.00
    Villain1: calls $2.00
    *** FLOP *** [Kh 7c 2s]
    Villain1: checks
    Hero: bets $4.50
    Villain1: calls $4.50
    *** TURN *** [Kh 7c 2s 5d]
    ...
    *** RIVER *** [Kh 7c 2s 5d 9h]
    ...
    *** SHOW DOWN ***
    Villain1: shows [Qh Qd] (a pair of Queens)
    Hero: shows [Ah Kd] (a pair of Kings)
"""

import re

from models.hand import Action, ActionType, Street

_STREET_HEADER_RE = re.compile(r"\*\*\* (FLOP|TURN|RIVER) \*\*\*\s*\[([^\]]+)\]")
_HOLE_CARDS_RE = re.compile(r"Dealt to Hero \[([^\]]+)\]")
_ACTION_RE = re.compile(
    r"^(?P<actor>\S+):\s+"
    r"(?P<verb>posts small blind|posts big blind|folds|checks|calls|bets|raises)"
    r"(?:\s+\$?(?P<amt1>[\d.]+))?"
    r"(?:\s+to\s+\$?(?P<amt2>[\d.]+))?"
)
_SHOWDOWN_RE = re.compile(r"^(?P<actor>\S+):\s+shows \[([^\]]+)\]")

_VERB_TO_ACTION_TYPE = {
    "posts small blind": ActionType.POST,
    "posts big blind": ActionType.POST,
    "folds": ActionType.FOLD,
    "checks": ActionType.CHECK,
    "calls": ActionType.CALL,
    "bets": ActionType.BET,
    "raises": ActionType.RAISE,
}


def looks_like_structured_export(raw_text: str) -> bool:
    """Quick structural check used to route to this fast path vs. the LLM path."""
    return "*** HOLE CARDS ***" in raw_text and "Dealt to" in raw_text


def parse_structured_hand(raw_text: str) -> dict:
    """
    Returns a plain dict (not yet a Hand object -- the caller assigns id/user_id):
        {
            "hero_cards": [...],
            "board": [...],
            "actions": [Action, ...],
            "showdown": {"hero": [...], "villain_1": [...]}  # only if reached
        }
    """
    lines = raw_text.splitlines()

    hero_cards: list[str] = []
    board: list[str] = []
    actions: list[Action] = []
    showdown: dict[str, list[str]] = {}

    current_street = Street.PREFLOP

    for line in lines:
        line = line.strip()

        hole_match = _HOLE_CARDS_RE.search(line)
        if hole_match:
            hero_cards = hole_match.group(1).split()
            continue

        street_match = _STREET_HEADER_RE.search(line)
        if street_match:
            street_name, cards_str = street_match.groups()
            current_street = Street(street_name.lower())
            new_cards = cards_str.split()
            # each street header shows the FULL board so far; only append the new ones
            board = new_cards
            continue

        showdown_match = _SHOWDOWN_RE.match(line)
        if showdown_match:
            actor, cards_str = showdown_match.groups()
            actor_label = "hero" if actor.lower() == "hero" else actor.lower()
            showdown[actor_label] = cards_str.split()
            continue

        action_match = _ACTION_RE.match(line)
        if action_match:
            actor = action_match.group("actor")
            actor_label = "hero" if actor.lower() == "hero" else actor.lower()
            verb = action_match.group("verb")
            action_type = _VERB_TO_ACTION_TYPE[verb]

            # "raises $2.00 to $3.00" -> the TOTAL is amt2; "calls $2.00" -> amt1
            amt2 = action_match.group("amt2")
            amt1 = action_match.group("amt1")
            amount = float(amt2) if amt2 else (float(amt1) if amt1 else None)

            actions.append(Action(current_street, actor_label, action_type, amount))

    return {
        "hero_cards": hero_cards,
        "board": board,
        "actions": actions,
        "showdown": showdown,
    }
