from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

from api.routes.health import router as health_router
from auth.firebase_auth import AuthUser, resolve_user
from leak_detection.leak_detector import (
    board_as_of,
    compute_decision_points,
    detect_recurring_leaks,
    evaluate_decision_point,
)
from models.hand import Hand
from parsers.structured_parser import looks_like_structured_export, parse_structured_hand
from storage.firestore_client import (
    FirestoreStore,
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


def effective_user_id(requested: str, user: AuthUser) -> str:
    """A verified sign-in token always wins over a client-supplied user_id,
    so one user can never read or write another user's memory."""
    return user.uid if user.verified else requested


@app.get("/api/me")
def whoami(user: AuthUser = Depends(resolve_user)) -> dict:
    return {
        "uid": user.uid,
        "email": user.email,
        "name": user.name,
        "verified": user.verified,
    }


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
def practice_action(
    game_id: str,
    request: PracticeActionRequest,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    user_id = effective_user_id(request.user_id, user)
    try:
        result = practice_games.action(game_id, request.action)
        try:
            action_repository.log(
                UserAction(
                    user_id=user_id,
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
def practice_chat(
    game_id: str,
    request: PracticeChatRequest,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    user_id = effective_user_id(request.user_id, user)
    try:
        result = practice_games.chat(game_id, request.message)
        if result.get("topic") == "best_hand" and result.get("correct") is not None:
            try:
                action_repository.log(
                    UserAction(
                        user_id=user_id,
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
def analyze_hand(
    request: AnalyzeRequest,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    user_id = effective_user_id(request.user_id, user)

    try:
        action_repository.log(
            UserAction(
                user_id=user_id,
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
            mastery_repository.update(user_id, POT_ODDS_CONCEPT, signal)
            try:
                action_repository.log(
                    UserAction(
                        user_id=user_id,
                        action_type="quiz_correct" if signal else "quiz_wrong",
                        context_street=dp.street,
                        context_hand=" ".join(parsed["hero_cards"]),
                        detail=f"required={(evaluated.required_equity or 0):.3f} actual={(evaluated.computed_equity or 0):.3f}",
                        understood=signal > 0.5,
                    )
                )
                if signal:
                    style_repository.record_win(
                        user_id, POT_ODDS_CONCEPT, "math_first"
                    )
            except Exception:
                pass

    leak_tags = [dp.leak_tag for dp in evaluated_decision_points if dp.leak_tag]

    # Memory step 1: what did this user already get wrong before?
    past_hands = hand_repository.list_by_user(user_id)

    # Memory step 2: embed the leak summary in cloud mode so Firestore keeps
    # vector memory alongside the structured record (PRD 4.4 FR2). Best-effort:
    # embedding failures must never block a hand review.
    embedding: list[float] | None = None
    if isinstance(store, FirestoreStore):
        try:
            from embeddings.embedder import embed_text

            summary = _leak_summary(parsed, leak_tags, evaluated_decision_points)
            embedding = embed_text(summary) or None
        except Exception:
            embedding = None

    recurring = detect_recurring_leaks(leak_tags, past_hands, new_embedding=embedding)

    hand = Hand(
        id=str(uuid4()),
        user_id=user_id,
        raw_text=request.raw_text,
        hero_cards=parsed["hero_cards"],
        board=parsed["board"],
        actions=parsed["actions"],
        decision_points=evaluated_decision_points,
        leak_tags=leak_tags,
        num_opponents=request.num_opponents,
        embedding=embedding,
    )
    hand_repository.save(hand)

    return {
        "status": "parsed",
        "hand": hand.to_firestore_dict(),
        "showdown": parsed["showdown"],
        "recurring_leak": recurring,
    }


def _leak_summary(parsed: dict, leak_tags: list, decision_points: list) -> str:
    """Compact text describing what went wrong — the embedding target."""
    parts = [f"leak:{getattr(t, 'value', t)}" for t in leak_tags]
    for dp in decision_points:
        if dp.leak_tag is not None:
            parts.append(
                f"{dp.street}: called {dp.call_amount} into {dp.pot_before}, "
                f"needed {(dp.required_equity or 0):.2f}, "
                f"had {(dp.computed_equity or 0):.2f}"
            )
    parts.append("hero:" + ",".join(parsed["hero_cards"]))
    parts.append("board:" + ",".join(parsed["board"]))
    return " ".join(parts)


@app.post("/api/actions/log")
def log_user_action(
    request: LogActionRequest,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    """Logs any user choice for Collaborative Partner adaptation."""
    try:
        action_repository.log(
            UserAction(
                user_id=effective_user_id(request.user_id, user),
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
def get_recent_actions(
    user_id: str,
    limit: int = 20,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    """Returns the last N actions for a user — used by the coach agent
    to surface 'you did this same thing last week'-style callbacks."""
    uid = effective_user_id(user_id, user)
    actions = action_repository.recent(uid, limit=limit)
    leak_hint = action_repository.most_common_leak_hint(uid)
    style = style_repository.get(uid, POT_ODDS_CONCEPT)
    return {
        "actions": [a.to_dict() for a in actions],
        "leak_hint": leak_hint,
        "preferred_style_pot_odds": style.preferred_style(),
        "math_wins": style.math_first_wins,
        "intuition_wins": style.intuition_first_wins,
    }


@app.get("/api/hands")
def list_hands(
    user_id: str = "local-user",
    user: AuthUser = Depends(resolve_user),
) -> dict:
    hands = hand_repository.list_by_user(effective_user_id(user_id, user))
    return {"hands": [h.to_firestore_dict() for h in hands]}


@app.get("/api/mastery/{user_id}")
def get_mastery(
    user_id: str,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    uid = effective_user_id(user_id, user)
    mastery = mastery_repository.get(uid).to_firestore_dict()
    try:
        actions_30 = action_repository.recent(uid, limit=30)
        if actions_30:
            mastery["recent_action_count"] = len(actions_30)
            hint = action_repository.most_common_leak_hint(uid)
            if hint:
                mastery["leak_hint"] = hint
    except Exception:
        pass
    try:
        style = style_repository.get(uid, POT_ODDS_CONCEPT)
        mastery["preferred_style_pot_odds"] = style.preferred_style()
    except Exception:
        pass
    return mastery
