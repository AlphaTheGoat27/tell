from uuid import uuid4

from fastapi import FastAPI
from pydantic import BaseModel, Field

from api.routes.health import router as health_router
from leak_detection.leak_detector import compute_decision_points
from models.hand import Hand
from parsers.structured_parser import looks_like_structured_export, parse_structured_hand


app = FastAPI(title="Tell API", version="0.1.0")
app.include_router(health_router)


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
	hand = Hand(
		id=str(uuid4()),
		user_id=request.user_id,
		raw_text=request.raw_text,
		hero_cards=parsed["hero_cards"],
		board=parsed["board"],
		actions=parsed["actions"],
		decision_points=compute_decision_points(parsed["actions"]),
	)
	return {"status": "parsed", "hand": hand.to_firestore_dict(), "showdown": parsed["showdown"]}
