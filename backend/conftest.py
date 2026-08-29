import pytest


@pytest.fixture(autouse=True)
def _gemini_off(monkeypatch):
    """Keep the test suite hermetic: never call Gemini during pytest.

    Live Gemini behaviour is validated manually against the running server
    (or via TELL_LIVE_GEMINI=1 tests), not in CI-style runs.
    """
    try:
        import game.gemini_coach as gemini_coach
    except Exception:
        return
    monkeypatch.setattr(gemini_coach, "_unavailable", True)
    monkeypatch.setattr(gemini_coach, "_client", None)
