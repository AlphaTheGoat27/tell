from models.mastery_map import MasteryMap
from storage.firestore_client import InMemoryStore


class MasteryRepository:
    """Mirrors HandRepository's seam pattern: same InMemoryStore today,
    same drop-in path to real Firestore later."""

    def __init__(self, store: InMemoryStore | None = None) -> None:
        self.store = store or InMemoryStore()

    def get(self, user_id: str) -> MasteryMap:
        data = self.store.get("mastery_maps", user_id)
        return MasteryMap.from_firestore_dict(data) if data else MasteryMap()

    def update(self, user_id: str, concept_id: str, signal: float) -> float:
        mastery_map = self.get(user_id)
        new_score = mastery_map.update(concept_id, signal)
        data = {"user_id": user_id, **mastery_map.to_firestore_dict()}
        self.store.save("mastery_maps", user_id, data)
        return new_score