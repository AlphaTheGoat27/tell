from uuid import uuid4

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

from api.routes.health import router as health_router
from leak_detection.leak_detector import board_as_of, compute_decision_points, evaluate_decision_point
from models.hand import Hand
from parsers.structured_parser import looks_like_structured_export, parse_structured_hand
from storage.firestore_client import (
    UserAction,
    UserActionRepository,
    WritingStyleRepository,
    create_store,
)
from storage.hand_repository import HandRepository
from storage.mastery_repository import MasteryRepository
from game.holdem import PracticeGames

app = FastAPI(title="Tell API", version="0.2.0")
app.include_router(health_router)

store = create_store()
hand_repository = HandRepository(store)
mastery_repository = MasteryRepository(store)
action_repository = UserActionRepository(store)
style_repository = WritingStyleRepository(store)
practice_games = PracticeGames()

POT_ODDS_CONCEPT = "pot_odds"


class AnalyzeRequest(BaseModel):
    raw_text: str = Field(min_length=1)
    user_id: str = "local-user"
    num_opponents: int = Field(default=1, ge=1, le=8)


class PracticeStartRequest(BaseModel):
    players: int = Field(default=2, ge=2, le=9)


class PracticeActionRequest(BaseModel):
    action: str
    user_id: str = "local-user"


class AdvanceBotsRequest(BaseModel):
    user_id: str = "local-user"
    predicted_winner: int | None = None


class PracticeChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    user_id: str = "local-user"


class LogActionRequest(BaseModel):
    user_id: str = "local-user"
    action_type: str
    context_street: str = ""
    context_hand: str = ""
    detail: str = ""
    option_label: str = ""
    session_id: str = ""
    understood: bool | None = None


class NarrationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1_200)


@app.post("/api/practice")
def start_practice(request: PracticeStartRequest) -> dict:
    game = practice_games.create(request.players)
    return game


@app.post("/api/practice/{game_id}/action")
def practice_action(game_id: str, request: PracticeActionRequest) -> dict:
    try:
        result = practice_games.action(game_id, request.action)
        try:
            action_repository.log(
                UserAction(
                    user_id=request.user_id,
                    action_type=request.action,
                    context_street=result.get("street", ""),
                    context_hand=" ".join(result.get("hero_cards", [])),
                    detail=result.get("last_hero_action", ""),
                    session_id=game_id,
                )
            )
        except Exception:
            # never let logging break gameplay
            pass
        return result
    except KeyError as error:
        return {"error": str(error)}
    except ValueError as error:
        return {"error": str(error)}


@app.post("/api/practice/{game_id}/bots")
def advance_practice_bots(game_id: str, request: AdvanceBotsRequest | None = None) -> dict:
    try:
        predicted = request.predicted_winner if request else None
        return practice_games.advance_bots(game_id, predicted_winner=predicted)
    except KeyError as error:
        return {"error": str(error)}
    except ValueError as error:
        return {"error": str(error)}


@app.post("/api/practice/{game_id}/chat")
def practice_chat(game_id: str, request: PracticeChatRequest) -> dict:
    try:
        result = practice_games.chat(game_id, request.message)
        if result.get("topic") == "best_hand" and result.get("correct") is not None:
            try:
                action_repository.log(
                    UserAction(
                        user_id=request.user_id,
                        action_type="quiz_correct" if result["correct"] else "quiz_wrong",
                        context_street=result.get("street", ""),
                        detail=request.message[:200],
                        session_id=game_id,
                        understood=bool(result["correct"]),
                    )
                )
            except Exception:
                # never let logging break the chat
                pass
        return result
    except KeyError as error:
        return {"error": str(error)}


@app.post("/api/narrate", response_class=Response)
def narrate(request: NarrationRequest) -> Response:
    try:
        from google.cloud import texttospeech

        client = texttospeech.TextToSpeechClient()

        speech = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=request.text),
            voice=texttospeech.VoiceSelectionParams(
                language_code="en-US",
                name="en-US-Chirp3-HD-Charon",
            ),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            ),
        )

        return Response(
            content=speech.audio_content,
            media_type="audio/mpeg",
        )

    except Exception as error:
        print(f"NARRATION ERROR: {type(error).__name__}: {error}")
        raise HTTPException(
            status_code=503,
            detail=f"Narration failed: {type(error).__name__}: {error}",
        ) from error


@app.post("/api/hands/analyze")
def analyze_hand(request: AnalyzeRequest) -> dict:
    try:
        action_repository.log(
            UserAction(
                user_id=request.user_id,
                action_type="hand_analyzed",
                detail=f"{request.num_opponents + 1}-max",
            )
        )
    except Exception:
        pass

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
            try:
                action_repository.log(
                    UserAction(
                        user_id=request.user_id,
                        action_type="quiz_correct" if signal else "quiz_wrong",
                        context_street=dp.street,
                        context_hand=" ".join(parsed["hero_cards"]),
                        detail=f"required={(evaluated.required_equity or 0):.3f} actual={(evaluated.computed_equity or 0):.3f}",
                        understood=signal > 0.5,
                    )
                )
                if signal:
                    style_repository.record_win(
                        request.user_id, POT_ODDS_CONCEPT, "math_first"
                    )
            except Exception:
                pass

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
        num_opponents=request.num_opponents,
    )
    hand_repository.save(hand)

    return {
        "status": "parsed",
        "hand": hand.to_firestore_dict(),
        "showdown": parsed["showdown"],
    }


@app.post("/api/actions/log")
def log_user_action(request: LogActionRequest) -> dict:
    """Logs any user choice for Collaborative Partner adaptation."""
    try:
        action_repository.log(
            UserAction(
                user_id=request.user_id,
                action_type=request.action_type,
                context_street=request.context_street,
                context_hand=request.context_hand,
                detail=request.detail,
                option_label=request.option_label,
                session_id=request.session_id,
                understood=request.understood,
            )
        )
        return {"ok": True}
    except Exception as error:
        return {"ok": False, "error": str(error)}


@app.get("/api/actions/recent")
def get_recent_actions(user_id: str, limit: int = 20) -> dict:
    """Returns the last N actions for a user — used by the coach agent
    to surface 'you did this same thing last week'-style callbacks."""
    actions = action_repository.recent(user_id, limit=limit)
    leak_hint = action_repository.most_common_leak_hint(user_id)
    style = style_repository.get(user_id, POT_ODDS_CONCEPT)
    return {
        "actions": [a.to_dict() for a in actions],
        "leak_hint": leak_hint,
        "preferred_style_pot_odds": style.preferred_style(),
        "math_wins": style.math_first_wins,
        "intuition_wins": style.intuition_first_wins,
    }


@app.get("/api/hands")
def list_hands(user_id: str = "local-user") -> dict:
    hands = hand_repository.list_by_user(user_id)
    return {"hands": [h.to_firestore_dict() for h in hands]}


@app.get("/api/mastery/{user_id}")
def get_mastery(user_id: str) -> dict:
    mastery = mastery_repository.get(user_id).to_firestore_dict()
    try:
        actions_30 = action_repository.recent(user_id, limit=30)
        if actions_30:
            mastery["recent_action_count"] = len(actions_30)
            hint = action_repository.most_common_leak_hint(user_id)
            if hint:
                mastery["leak_hint"] = hint
    except Exception:
        pass
    try:
        style = style_repository.get(user_id, POT_ODDS_CONCEPT)
        mastery["preferred_style_pot_odds"] = style.preferred_style()
    except Exception:
        pass
    return mastery
