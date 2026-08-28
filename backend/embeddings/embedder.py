"""Local placeholder for the future Vertex AI embedding adapter."""


def embed_text(text: str) -> list[float]:
    """Return a deterministic tiny vector for local development only."""
    if not text:
        return []
    return [round(sum(text.encode("utf-8")) / max(len(text), 1) / 255, 6)]
