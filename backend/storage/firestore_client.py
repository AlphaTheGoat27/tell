"""Firestore storage with a zero-config in-memory fallback for local demos.

Includes per-user action-tracking for Collaborative Partner track:
- UserActionRepository logs every choice a user makes (action chosen,
  option clicked, chat text, pot-odds quiz correctness) so the agent
  can adapt its tone / explanation style to match the patterns that
  historically landed for *this* specific user.
- WritingStyleRepository tracks which explanation style
  (math-first vs intuition-first) produced self-reported understanding
  so the coach can lean into whichever style the user actually learns
  from — surface-level adaptive behavior, not just canned responses.
"""

import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


class InMemoryStore:
    def __init__(self) -> None:
        self._collections: dict[str, dict[str, dict]] = {}

    def save(self, collection: str, document_id: str, data: dict) -> dict:
        self._collections.setdefault(collection, {})[document_id] = dict(data)
        return self._collections[collection][document_id]

    def get(self, collection: str, document_id: str) -> dict | None:
        return self._collections.get(collection, {}).get(document_id)

    def list(self, collection: str, limit: int | None = None) -> list[dict]:
        values = list(self._collections.get(collection, {}).values())
        return values[:limit] if limit else values


class FirestoreStore:
    """Tiny adapter so repositories work locally and on Cloud Run unchanged."""

    def __init__(self) -> None:
        from google.cloud import firestore

        self.client = firestore.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT") or None)

    def save(self, collection: str, document_id: str, data: dict) -> dict:
        self.client.collection(collection).document(document_id).set(data)
        return data

    def get(self, collection: str, document_id: str) -> dict | None:
        snapshot = self.client.collection(collection).document(document_id).get()
        return snapshot.to_dict() if snapshot.exists else None

    def list(self, collection: str, limit: int | None = None) -> list[dict]:
        query = self.client.collection(collection)
        if limit:
            query = query.limit(limit)
        return [snapshot.to_dict() for snapshot in query.stream()]


def create_store() -> InMemoryStore | FirestoreStore:
    """Use Firestore when Application Default Credentials are available.

    Local development stays runnable without credentials; Cloud Run automatically
    supplies them and therefore gets durable per-user memory.
    """
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        print(
            "[storage] GOOGLE_CLOUD_PROJECT is not set -> using InMemoryStore. "
            "Data will NOT appear in the Firestore console."
        )
        return InMemoryStore()
    try:
        store = FirestoreStore()
        print(f"[storage] Connected to real Firestore for project '{project}'.")
        return store
    except Exception as error:
        print(
            f"[storage] Failed to connect to Firestore for project '{project}': "
            f"{type(error).__name__}: {error}"
        )
        print("[storage] Falling back to InMemoryStore -- data will NOT persist.")
        return InMemoryStore()


ACTION_COLLECTION = "user_actions_v1"
WRITING_STYLE_COLLECTION = "writing_style_v1"


@dataclass
class UserAction:
    """Any single choice the user made, for pattern-matching / adaptation."""

    user_id: str
    action_type: str  # fold, check, call, raise, quiz_correct, quiz_wrong,
    # chat_text, option_click, hand_analyzed, drill_started
    context_street: str = ""
    context_hand: str = ""  # e.g. "As Kh"
    detail: str = ""  # free text / value attached
    option_label: str = ""  # if they picked a multiple-choice option
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    session_id: str = ""
    understood: Optional[bool] = None  # if True: user self-reported "I get it"

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "action_type": self.action_type,
            "context_street": self.context_street,
            "context_hand": self.context_hand,
            "detail": self.detail,
            "option_label": self.option_label,
            "timestamp": self.timestamp,
            "session_id": self.session_id,
            "understood": self.understood,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "UserAction":
        return cls(
            user_id=data["user_id"],
            action_type=data.get("action_type", ""),
            context_street=data.get("context_street", ""),
            context_hand=data.get("context_hand", ""),
            detail=data.get("detail", ""),
            option_label=data.get("option_label", ""),
            timestamp=data.get("timestamp", ""),
            session_id=data.get("session_id", ""),
            understood=data.get("understood"),
        )


@dataclass
class WritingStylePreference:
    """Which explanation style landed for a given concept, per user.

    The collaborative partner track asks the agent to *adapt to the user*,
    so we don't just store a single global "math vs intuition" flag —
    we roll it up by concept, because a user might want the numbers
    for pot odds but intuitive framing for range construction.
    """

    user_id: str
    concept: str  # e.g. "pot_odds", "preflop_ranges"
    math_first_wins: int = 0  # times a math-first explanation produced "understood"
    intuition_first_wins: int = 0  # times intuition-first produced "understood"
    last_updated: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def preferred_style(self) -> str:
        if self.math_first_wins == 0 and self.intuition_first_wins == 0:
            return "mixed"
        if self.math_first_wins > self.intuition_first_wins * 1.2:
            return "math_first"
        if self.intuition_first_wins > self.math_first_wins * 1.2:
            return "intuition_first"
        return "mixed"

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "concept": self.concept,
            "math_first_wins": self.math_first_wins,
            "intuition_first_wins": self.intuition_first_wins,
            "last_updated": self.last_updated,
            "preferred_style": self.preferred_style(),
        }


class UserActionRepository:
    """Logs ~every user decision. Used by the coach agent to adapt tone and
    reference *specific past decisions* instead of speaking generically."""

    COLLECTION = ACTION_COLLECTION

    def __init__(self, store: InMemoryStore | FirestoreStore) -> None:
        self.store = store

    def log(self, action: UserAction) -> None:
        doc_id = f"{action.user_id}__{action.timestamp}__{action.action_type}"
        self.store.save(self.COLLECTION, doc_id, action.to_dict())

    def recent(self, user_id: str, limit: int = 20) -> list[UserAction]:
        # InMemory stores all users mixed — filter on read.
        all_actions = self.store.list(self.COLLECTION)
        user_only = [d for d in all_actions if d.get("user_id") == user_id]
        user_only.sort(key=lambda d: d.get("timestamp", ""), reverse=True)
        return [UserAction.from_dict(d) for d in user_only[:limit]]

    def count_action(self, user_id: str, action_type: str) -> int:
        recent = self.recent(user_id, limit=200)
        return sum(1 for a in recent if a.action_type == action_type)

    def most_common_leak_hint(self, user_id: str) -> Optional[str]:
        """If they keep folding premium or chasing below odds, surface it."""
        recent = self.recent(user_id, limit=30)
        wrong_quiz = sum(1 for a in recent if a.action_type == "quiz_wrong")
        calls = sum(1 for a in recent if a.action_type == "call")
        folds = sum(1 for a in recent if a.action_type == "fold")
        if wrong_quiz >= 2:
            return "keeps miscalculating pot odds — lead with the formula in plain language before numbers"
        if calls >= max(folds * 1.5, 3):
            return "calls very wide — surface required equity before validating any call"
        if folds >= max(calls * 1.5, 4):
            return "folds too easily — confirm hand strength before agreeing with the fold"
        return None


class WritingStyleRepository:
    COLLECTION = WRITING_STYLE_COLLECTION

    def __init__(self, store: InMemoryStore | FirestoreStore) -> None:
        self.store = store

    @staticmethod
    def _doc_id(user_id: str, concept: str) -> str:
        return f"{user_id}__{concept}"

    def record_win(self, user_id: str, concept: str, style_used: str) -> WritingStylePreference:
        doc_id = self._doc_id(user_id, concept)
        existing = self.store.get(self.COLLECTION, doc_id)
        if existing:
            pref = WritingStylePreference(
                user_id=existing["user_id"],
                concept=existing["concept"],
                math_first_wins=int(existing.get("math_first_wins", 0)),
                intuition_first_wins=int(existing.get("intuition_first_wins", 0)),
            )
        else:
            pref = WritingStylePreference(user_id=user_id, concept=concept)
        if style_used == "math_first":
            pref.math_first_wins += 1
        elif style_used == "intuition_first":
            pref.intuition_first_wins += 1
        pref.last_updated = datetime.utcnow().isoformat()
        self.store.save(self.COLLECTION, doc_id, pref.to_dict())
        return pref

    def get(self, user_id: str, concept: str) -> WritingStylePreference:
        existing = self.store.get(self.COLLECTION, self._doc_id(user_id, concept))
        if not existing:
            return WritingStylePreference(user_id=user_id, concept=concept)
        return WritingStylePreference(
            user_id=existing["user_id"],
            concept=existing["concept"],
            math_first_wins=int(existing.get("math_first_wins", 0)),
            intuition_first_wins=int(existing.get("intuition_first_wins", 0)),
            last_updated=existing.get("last_updated", ""),
        )