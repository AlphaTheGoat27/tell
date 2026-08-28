"""Storage seam for Firestore; local tests use the in-memory implementation."""


class InMemoryStore:
    def __init__(self) -> None:
        self._collections: dict[str, dict[str, dict]] = {}

    def save(self, collection: str, document_id: str, data: dict) -> dict:
        self._collections.setdefault(collection, {})[document_id] = dict(data)
        return self._collections[collection][document_id]

    def get(self, collection: str, document_id: str) -> dict | None:
        return self._collections.get(collection, {}).get(document_id)

    def list(self, collection: str) -> list[dict]:
        return list(self._collections.get(collection, {}).values())
