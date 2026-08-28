from models.mastery_map import MasteryMap


class MasteryRepository:
    def __init__(self) -> None:
        self._maps: dict[str, MasteryMap] = {}

    def get(self, user_id: str) -> MasteryMap:
        return self._maps.setdefault(user_id, MasteryMap())

    def update(self, user_id: str, concept_id: str, signal: float) -> float:
        return self.get(user_id).update(concept_id, signal)
