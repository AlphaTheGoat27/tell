from models.hand import Hand
from storage.firestore_client import InMemoryStore


class HandRepository:
    def __init__(self, store: InMemoryStore | None = None) -> None:
        self.store = store or InMemoryStore()

    def save(self, hand: Hand) -> Hand:
        self.store.save("hands", hand.id, hand.to_firestore_dict())
        return hand

    def get(self, hand_id: str) -> Hand | None:
        data = self.store.get("hands", hand_id)
        return Hand.from_firestore_dict(data) if data else None
