"""End-to-end memory tests: Sign in with Google identity scoping + the
Firestore-style memory of hands and recurring mistakes (checked through the
same repository seam the FirestoreStore uses)."""

import pytest
from fastapi.testclient import TestClient

from api.main import app

HAND_HISTORY = """Hand #1: Hold'em No Limit ($0.50/$1.00)
Seat 1: Hero ($100.00 in chips)
Seat 2: Villain1 ($100.00 in chips)
Hero: posts small blind $0.50
Villain1: posts big blind $1.00
*** HOLE CARDS ***
Dealt to Hero [7c 2d]
Hero: calls $0.50
Villain1: checks
*** FLOP *** [Kh 9s 4c]
Hero: checks
Villain1: checks
*** TURN *** [Kh 9s 4c 2h]
Hero: checks
Villain1: checks
*** RIVER *** [Kh 9s 4c 2h 8d]
Hero: checks
Villain1: bets $30.00
Hero: calls $30.00
*** SHOW DOWN ***
Villain1: shows [Kd Ks] (three of a kind Kings)
Hero: shows [7c 2d] (a pair of Twos)
"""


class _StubEquity:
    win = 0.05
    tie = 0.0


@pytest.fixture(autouse=True)
def local_mode_with_fast_equity(monkeypatch):
    monkeypatch.setattr("auth.firebase_auth._firebase_ready", False)
    monkeypatch.setattr(
        "leak_detection.leak_detector.calculate_equity",
        lambda **_: _StubEquity(),
    )


def _auth(uid: str) -> dict:
    return {"Authorization": f"Bearer local:{uid}"}


def test_me_returns_local_user_without_token():
    body = TestClient(app).get("/api/me").json()
    assert body["uid"] == "local-user"
    assert body["verified"] is False


def test_me_reflects_signed_in_user():
    body = TestClient(app).get("/api/me", headers=_auth("alice")).json()
    assert body["uid"] == "alice"
    assert body["verified"] is True


def test_non_local_token_rejected_when_firebase_not_configured():
    response = TestClient(app).get(
        "/api/me", headers={"Authorization": "Bearer some-firebase-jwt"}
    )
    assert response.status_code == 401


def test_analyzed_hand_is_scoped_to_signed_in_user():
    client = TestClient(app)
    response = client.post(
        "/api/hands/analyze", json={"raw_text": HAND_HISTORY}, headers=_auth("alice")
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "parsed"
    assert body["hand"]["user_id"] == "alice"
    assert body["hand"]["leak_tags"]

    alice_hands = client.get("/api/hands", headers=_auth("alice")).json()["hands"]
    assert any(h["id"] == body["hand"]["id"] for h in alice_hands)

    bob_hands = client.get("/api/hands", headers=_auth("bob")).json()["hands"]
    assert all(h["id"] != body["hand"]["id"] for h in bob_hands)


def test_recurring_leak_is_remembered_across_hands():
    client = TestClient(app)
    first = client.post(
        "/api/hands/analyze", json={"raw_text": HAND_HISTORY}, headers=_auth("carol")
    )
    assert first.json()["recurring_leak"] is None

    second = client.post(
        "/api/hands/analyze", json={"raw_text": HAND_HISTORY}, headers=_auth("carol")
    )
    recurring = second.json()["recurring_leak"]
    assert recurring is not None
    assert recurring["leak_tag"] == "chasing_below_odds"
    assert recurring["previous_count"] >= 1
    assert "drill" in recurring["message"]


def test_mastery_memory_follows_verified_uid():
    client = TestClient(app)
    client.post(
        "/api/hands/analyze", json={"raw_text": HAND_HISTORY}, headers=_auth("dave")
    )
    # Path user_id is ignored in favor of the verified token identity.
    body = client.get("/api/mastery/not-dave", headers=_auth("dave")).json()
    assert "pot_odds" in body["scores"]
    assert body["scores"]["pot_odds"] < 0.5
