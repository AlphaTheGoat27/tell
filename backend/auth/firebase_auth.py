"""Sign in with Google -> verified user identity for per-user memory.

Flow (PRD 6.1 "Auth: Firebase Auth", checklist Phase 3):
- The frontend signs in with Google via Firebase Auth and sends the Firebase
  ID token as `Authorization: Bearer <token>`.
- This module verifies the token with firebase-admin and returns the user's
  uid, which becomes the ownership key for every memory document (hands,
  mastery map, action history).
- When the server runs without Firebase credentials (local dev / demo), it
  falls back to `local:*` demo tokens so the app stays usable without cloud
  setup. Once Firebase IS configured, only real verified tokens are accepted.

The Firestore security rules in infra/firestore.rules enforce the same
uid-ownership for any direct client reads.
"""

import os
import threading
from dataclasses import dataclass

from fastapi import Header, HTTPException

LOCAL_USER = "local-user"
LOCAL_TOKEN_PREFIX = "local:"

_firebase_lock = threading.Lock()
_firebase_ready: bool | None = None  # None = not checked yet


@dataclass(frozen=True)
class AuthUser:
    uid: str
    email: str = ""
    name: str = ""
    verified: bool = False


def _try_init_firebase() -> bool:
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        return False
    try:
        firebase_admin.get_app()
        return True
    except ValueError:
        pass
    try:
        service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if service_account:
            cred = credentials.Certificate(service_account)
        else:
            cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
        return True
    except Exception:
        return False


def _firebase_configured() -> bool:
    global _firebase_ready
    with _firebase_lock:
        if _firebase_ready is None:
            mode = os.getenv("TELL_AUTH_MODE", "auto").strip().lower()
            if mode == "local":
                # Dev opt-out: machines with stray Application Default
                # Credentials would otherwise lock out local: demo tokens.
                _firebase_ready = False
            else:
                _firebase_ready = _try_init_firebase()
        return _firebase_ready


def _verify_firebase_token(token: str) -> AuthUser:
    from firebase_admin import auth as firebase_auth

    claims = firebase_auth.verify_id_token(token)
    return AuthUser(
        uid=claims["uid"],
        email=claims.get("email", ""),
        name=claims.get("name", ""),
        verified=True,
    )


def resolve_user(authorization: str | None = Header(default=None)) -> AuthUser:
    """FastAPI dependency: maps the request's bearer token to a user identity.

    - No token -> the shared local-user (keeps the zero-config demo working).
    - `local:<uid>` tokens -> accepted only while Firebase is not configured.
    - Anything else must be a valid Firebase ID token once Firebase is set up.
    """
    if not authorization:
        return AuthUser(uid=LOCAL_USER)

    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=401, detail="Expected 'Authorization: Bearer <token>'"
        )

    if not _firebase_configured():
        if token.startswith(LOCAL_TOKEN_PREFIX):
            uid = token[len(LOCAL_TOKEN_PREFIX):].strip() or LOCAL_USER
            return AuthUser(uid=uid, verified=True)
        raise HTTPException(
            status_code=401,
            detail=(
                "Firebase auth is not configured on this server. "
                "Set FIREBASE_SERVICE_ACCOUNT or Application Default Credentials "
                "to enable Sign in with Google."
            ),
        )

    if token.startswith(LOCAL_TOKEN_PREFIX):
        # Real auth is live: demo tokens must not be able to spoof uids.
        raise HTTPException(status_code=401, detail="Demo tokens are disabled.")

    try:
        return _verify_firebase_token(token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired sign-in token. Please sign in again.",
        )
