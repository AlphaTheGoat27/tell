from uuid import uuid4

from fastapi import FastAPI
from pydantic import BaseModel, Field

from api.routes.health import router as health_router
from leak_detection.leak_detector import board_as_of, compute_decision_points, evaluate_decision_point
from models.hand import Hand
from parsers.structured_parser import looks_like_structured_export, parse_structured_hand
from storage.hand_repository import HandRepository
from storage.mastery_repository import MasteryRepository

app = FastAPI(title="Tell API", version="0.1.0")
app.include_router(health_router)

# Module-level singletons so state persists across requests within this
# process. Swap InMemoryStore for a real Firestore-backed store later --
# these repositories are the only place that changes.
hand_repository = HandRepository()
mastery_repository = MasteryRepository()

# Every evaluated decision point currently rolls into this one concept.
# Splitting into more granular concepts (preflop ranges, bet sizing, etc.)
# is a Phase 2 addition once more leak types beyond chasing_below_odds exist.
POT_ODDS_CONCEPT = "pot_odds"


class AnalyzeRequest(BaseModel):
    raw_text: str = Field(min_length=1)
    user_id: str = "local-user"


@app.post("/api/hands/analyze")
def analyze_hand(request: AnalyzeRequest) -> dict:
    if not looks_like_structured_export(request.raw_text):
        return {
            "status": "needs_clarification",
            "message": "Paste a supported hand-history export to use the local parser.",
        }

    parsed = parse_structured_hand(request.raw_text)
    raw_decision_points = compute_decision_points(parsed["actions"])

    villain_hand = parsed["showdown"].get("villain1")
    evaluated_decision_points = []
    for dp in raw_decision_points:
        board_known = board_as_of(dp.street, parsed["board"])
        evaluated = evaluate_decision_point(
            dp,
            hero_cards=parsed["hero_cards"],
            board_at_street=board_known,
            villain_hand=villain_hand,
        )
        evaluated_decision_points.append(evaluated)

        if evaluated.computed_equity is not None:
            signal = 0.0 if evaluated.leak_tag is not None else 1.0
            mastery_repository.update(request.user_id, POT_ODDS_CONCEPT, signal)

    leak_tags = [dp.leak_tag for dp in evaluated_decision_points if dp.leak_tag]

    hand = Hand(
        id=str(uuid4()),
        user_id=request.user_id,
        raw_text=request.raw_text,
        hero_cards=parsed["hero_cards"],
        board=parsed["board"],
        actions=parsed["actions"],
        decision_points=evaluated_decision_points,
        leak_tags=leak_tags,
    )
    hand_repository.save(hand)

    return {"status": "parsed", "hand": hand.to_firestore_dict(), "showdown": parsed["showdown"]}


@app.get("/api/hands")
def list_hands(user_id: str = "local-user") -> dict:
    hands = hand_repository.list_by_user(user_id)
    return {"hands": [h.to_firestore_dict() for h in hands]}


@app.get("/api/mastery/{user_id}")
def get_mastery(user_id: str) -> dict:
    return mastery_repository.get(user_id).to_firestore_dict()