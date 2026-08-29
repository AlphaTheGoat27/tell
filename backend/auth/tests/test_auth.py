import pytest
from fastapi import HTTPException

from auth.firebase_auth import LOCAL_USER, resolve_user


@pytest.fixture(autouse=True)
def force_local_mode(monkeypatch):
    monkeypatch.setattr("auth.firebase_auth._firebase_ready", False)


def test_no_token_resolves_to_local_user():
    user = resolve_user(None)
    assert user.uid == LOCAL_USER
    assert user.verified is False


def test_local_demo_token_resolves_in_local_mode():
    user = resolve_user("Bearer local:alice")
    assert user.uid == "alice"
    assert user.verified is True


def test_empty_local_token_falls_back_to_local_user():
    user = resolve_user("Bearer local:")
    assert user.uid == LOCAL_USER


def test_non_bearer_scheme_rejected():
    with pytest.raises(HTTPException) as err:
        resolve_user("Basic abc123")
    assert err.value.status_code == 401


def test_foreign_token_rejected_when_firebase_not_configured():
    with pytest.raises(HTTPException) as err:
        resolve_user("Bearer some-firebase-jwt")
    assert err.value.status_code == 401


def test_tell_auth_mode_local_forces_local_mode(monkeypatch):
    import auth.firebase_auth as fa

    monkeypatch.setattr(fa, "_firebase_ready", None)
    monkeypatch.setenv("TELL_AUTH_MODE", "local")
    assert fa._firebase_configured() is False
    user = resolve_user("Bearer local:dev")
    assert user.uid == "dev"
