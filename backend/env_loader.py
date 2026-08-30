"""Tiny dependency-free .env loader.

The backend reads GOOGLE_CLOUD_PROJECT / FIREBASE_SERVICE_ACCOUNT /
TELL_AUTH_MODE from the environment. Loading them from backend/.env means a
local `uvicorn` run keeps its Firestore + auth setup across shells without
each terminal having to export the variables again. Real environment
variables always win over file values.
"""

import os
from pathlib import Path

_LOADED = False


def load_dotenv() -> None:
    global _LOADED
    if _LOADED:
        return
    _LOADED = True

    # Keep the test suite hermetic: tests must run against InMemoryStore and
    # never touch the real Firestore, even on machines where backend/.env and
    # cloud credentials are present.
    import sys

    if "pytest" in sys.modules:
        return

    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return

    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
