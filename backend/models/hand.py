"""
The structured Hand schema (PRD Section 6.3). This is what messy input gets
mutated INTO -- the regex parser and, later, the LLM-based free-form parser
both produce one of these. Everything downstream (leak detection, mastery
map updates, Firestore storage) works off this shape, not raw text.
"""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional


class Street(str, Enum):
    PREFLOP = "preflop"
    FLOP = "flop"
    TURN = "turn"
    RIVER = "river"


class ActionType(str, Enum):
    FOLD = "fold"
    CHECK = "check"
    CALL = "call"
    BET = "bet"
    RAISE = "raise"
    POST = "post"  # blinds


class LeakTag(str, Enum):
    BAD_RIVER_CALL = "bad_river_call"
    OVERWIDE_PREFLOP_OPEN = "overwide_preflop_open"
    MISSED_VALUE_BET = "missed_value_bet"
    CHASING_BELOW_ODDS = "chasing_below_odds"
    MISREAD_POSITION = "misread_position"


@dataclass
class Action:
    street: Street
    actor: str  # "hero" or a villain label, e.g. "villain_1"
    action_type: ActionType
    amount: Optional[float] = None  # None for check/fold


@dataclass
class DecisionPoint:
    """
    One hero decision (almost always a call, since that's where pot odds
    matter most) with the math engine's numbers attached once computed.
    """
    street: Street
    pot_before: float  # pot size BEFORE hero's call, including villain's bet
    call_amount: float
    required_equity: Optional[float] = None
    computed_equity: Optional[float] = None
    action_taken: ActionType = ActionType.CALL
    leak_tag: Optional[LeakTag] = None


@dataclass
class Hand:
    id: str
    user_id: str
    raw_text: str
    hero_cards: list[str] = field(default_factory=list)
    board: list[str] = field(default_factory=list)
    actions: list[Action] = field(default_factory=list)
    decision_points: list[DecisionPoint] = field(default_factory=list)
    leak_tags: list[LeakTag] = field(default_factory=list)
    num_opponents: int = 1  # table size setting; drives the seat layout, not yet the equity math
    parsed_at: Optional[str] = None
    embedding: Optional[list[float]] = None  # filled in once Firestore vector step is wired
    # "analyzed" = pasted hand history, "played" = practice table session.
    source: str = "analyzed"
    result: str = ""  # e.g. "You win with Two Pair." (played hands)
    winner: Optional[int] = None  # seat index, played hands only
    player_names: list[str] = field(default_factory=list)
    hero_folded: bool = False
    hero_fold_street: Optional[str] = None
    # Player label -> revealed cards (showdown or all-face-up after a fold).
    showdown: dict = field(default_factory=dict)

    def to_firestore_dict(self) -> dict:
        """Firestore-ready plain dict. Enums become their string values."""
        return _enums_to_values(asdict(self))

    @staticmethod
    def from_firestore_dict(data: dict) -> "Hand":
        actions = [
            Action(
                street=Street(a["street"]),
                actor=a["actor"],
                action_type=ActionType(a["action_type"]),
                amount=a.get("amount"),
            )
            for a in data.get("actions", [])
        ]
        decision_points = [
            DecisionPoint(
                street=Street(dp["street"]),
                pot_before=dp["pot_before"],
                call_amount=dp["call_amount"],
                required_equity=dp.get("required_equity"),
                computed_equity=dp.get("computed_equity"),
                action_taken=ActionType(dp.get("action_taken", "call")),
                leak_tag=LeakTag(dp["leak_tag"]) if dp.get("leak_tag") else None,
            )
            for dp in data.get("decision_points", [])
        ]
        return Hand(
            id=data["id"],
            user_id=data["user_id"],
            raw_text=data.get("raw_text", ""),
            hero_cards=data.get("hero_cards", []),
            board=data.get("board", []),
            actions=actions,
            decision_points=decision_points,
            leak_tags=[LeakTag(t) for t in data.get("leak_tags", [])],
            num_opponents=data.get("num_opponents", 1),
            parsed_at=data.get("parsed_at"),
            embedding=data.get("embedding"),
            source=data.get("source", "analyzed"),
            result=data.get("result", ""),
            winner=data.get("winner"),
            player_names=data.get("player_names", []),
            hero_folded=data.get("hero_folded", False),
            hero_fold_street=data.get("hero_fold_street"),
            showdown=data.get("showdown", {}),
        )


def _enums_to_values(obj):
    if isinstance(obj, dict):
        return {k: _enums_to_values(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_enums_to_values(v) for v in obj]
    if isinstance(obj, Enum):
        return obj.value
    return obj