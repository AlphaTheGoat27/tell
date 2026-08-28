"""Small, deterministic mastery-score model used by the local MVP."""

from dataclasses import dataclass, field


@dataclass
class MasteryMap:
    """Rolling concept scores in the range 0.0 to 1.0."""

    scores: dict[str, float] = field(default_factory=dict)

    def update(self, concept_id: str, signal: float, weight: float = 0.2) -> float:
        if not 0 <= signal <= 1 or not 0 < weight <= 1:
            raise ValueError("signal must be 0..1 and weight must be between 0 and 1")
        previous = self.scores.get(concept_id, signal)
        self.scores[concept_id] = previous + weight * (signal - previous)
        return self.scores[concept_id]

    def to_firestore_dict(self) -> dict:
        return {"scores": dict(self.scores)}

    @staticmethod
    def from_firestore_dict(data: dict) -> "MasteryMap":
        return MasteryMap(scores=dict(data.get("scores", {})))