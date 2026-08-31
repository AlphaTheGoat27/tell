import logging
import os
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Must run before auth/storage modules read os.environ at import/call time.
from env_loader import load_dotenv

load_dotenv()

from api.routes.health import router as health_router  # noqa: E402
from auth.firebase_auth import LOCAL_USER, AuthUser, resolve_user  # noqa: E402
from leak_detection.leak_detector import (
    board_as_of,
    compute_decision_points,
    detect_recurring_leaks,
    evaluate_decision_point,
)
from models.hand import Action, ActionType, Hand, Street
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
from game.holdem import PracticeGames, PracticeHand

app = FastAPI(title="Tell API", version="0.2.0")

# Frontend and backend live on different Cloud Run / Firebase Hosting domains
# once deployed -- without this, every request gets blocked by the browser
# before it even leaves. TELL_ALLOWED_ORIGINS is a comma-separated list;
# defaults cover local dev. Set it on Cloud Run to your real frontend URL(s).
_default_origins = "http://localhost:5173,http://127.0.0.1:5173,https://tell-506715.web.app"
_allowed_origins = os.environ.get("TELL_ALLOWED_ORIGINS", _default_origins).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("tell.api")


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    # Exceptions that escape to ServerErrorMiddleware bypass CORSMiddleware,
    # so the browser reports a misleading CORS error instead of the real 500.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


app.include_router(health_router)

store = create_store()
hand_repository = HandRepository(store)
mastery_repository = MasteryRepository(store)
action_repository = UserActionRepository(store)
style_repository = WritingStyleRepository(store)
practice_games = PracticeGames()

POT_ODDS_CONCEPT = "pot_odds"

# Concepts the client may seed through /actions/log option_label.
MASTERY_CONCEPTS = {"pot_odds", "preflop_ranges", "bet_sizing", "hand_reading"}


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


@app.get("/api/storage")
def storage_info() -> dict:
    """Tells the client whether hands survive a server restart. In-memory mode
    means the History tab only shows hands from the current backend session."""
    persistent = isinstance(store, FirestoreStore)
    return {
        "persistent": persistent,
        "mode": "firestore" if persistent else "memory",
        "project": os.getenv("GOOGLE_CLOUD_PROJECT", "") if persistent else "",
    }


class AnalyzeRequest(BaseModel):
    raw_text: str = Field(min_length=1)
    user_id: str = "local-user"
    num_opponents: int = Field(default=1, ge=1, le=8)


class PracticeStartRequest(BaseModel):
    players: int = Field(default=2, ge=2, le=9)
    user_id: str = "local-user"


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


def _persist_practice_hand(game: PracticeHand | None) -> None:
    """Store a finished practice hand in the user's Firestore memory so the
    coach can reference it exactly like a pasted hand history."""
    if game is None or not game.complete or not game.board:
        return

    uid = game.user_id or "local-user"
    # Memory belongs to a signed-in account. A hand created by the shared demo
    # identity must never be written — everyone would see it.
    if uid in ("", LOCAL_USER):
        return

    actions: list[Action] = []
    for entry in game.action_log:
        # The log records chips added; BET keeps the pot math additive while
        # CALL stays reserved for hero calls (those become decision points).
        kind = "bet" if entry["action"] == "raise" else entry["action"]
        actions.append(
            Action(
                street=Street(entry["street"]),
                actor=entry["actor"],
                action_type=ActionType(kind),
                amount=entry["amount"] or None,
            )
        )

    decision_points = compute_decision_points(actions)
    villain_hand = None
    if game.winner is not None and game.winner != 0 and game.winner < len(game.hands):
        villain_hand = game.hands[game.winner]

    evaluated = []
    for dp in decision_points:
        ev = evaluate_decision_point(
            dp,
            hero_cards=game.hands[0],
            board_at_street=board_as_of(dp.street, game.board),
            villain_hand=villain_hand,
        )
        evaluated.append(ev)
        if ev.computed_equity is not None:
            signal = 0.0 if ev.leak_tag is not None else 1.0
            mastery_repository.update(uid, POT_ODDS_CONCEPT, signal)
            try:
                action_repository.log(
                    UserAction(
                        user_id=uid,
                        action_type="call_decision_good" if signal > 0.5 else "call_decision_bad",
                        context_street=dp.street.value,
                        context_hand=" ".join(game.hands[0]),
                        detail=f"required={(ev.required_equity or 0):.3f} actual={(ev.computed_equity or 0):.3f}",
                        session_id=game.id,
                        understood=signal > 0.5,
                    )
                )
            except Exception:
                pass

    leak_tags = list(dict.fromkeys(dp.leak_tag for dp in evaluated if dp.leak_tag))

    showdown: dict[str, list[str]] = {"hero": list(game.hands[0])}
    for seat in range(1, game.players):
        if seat < len(game.hands):
            showdown[PracticeHand.bot_name(seat)] = list(game.hands[seat])

    lines = [
        f"Practice hand - {game.players}-handed - blinds $0.50/$1.00",
        f"Dealt to Hero [{' '.join(game.hands[0])}]",
    ]
    current_street = None
    for entry in game.action_log:
        if entry["street"] != current_street:
            current_street = entry["street"]
            lines.append(f"*** {current_street.upper()} ***")
        amount = f" ${entry['amount']:.2f}" if entry["amount"] else ""
        lines.append(f"{entry['actor']}: {entry['action']}{amount}")
    lines.append(f"Board: {' '.join(game.board)}")
    if game.result:
        lines.append(game.result)

    hand = Hand(
        id=game.id,
        user_id=uid,
        raw_text="\n".join(lines),
        hero_cards=list(game.hands[0]),
        board=list(game.board),
        actions=actions,
        decision_points=evaluated,
        leak_tags=leak_tags,
        num_opponents=game.players - 1,
        parsed_at=datetime.now(timezone.utc).isoformat(),
        source="played",
        result=game.result or "",
        winner=game.winner,
        player_names=["Hero"] + [PracticeHand.bot_name(i) for i in range(1, game.players)],
        hero_folded=game.hero_folded,
        hero_fold_street=game.hero_fold_street,
        showdown=showdown,
    )
    hand_repository.save(hand)
    try:
        action_repository.log(
            UserAction(
                user_id=uid,
                action_type="hand_played",
                detail=game.result or "",
                session_id=game.id,
            )
        )
    except Exception:
        pass


@app.post("/api/practice")
def start_practice(
    request: PracticeStartRequest,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    uid = effective_user_id(request.user_id, user)
    game = practice_games.create(request.players, user_id=uid)
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
        if user.verified:
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
        if result.get("complete") and user.verified:
            try:
                _persist_practice_hand(practice_games.get(game_id))
            except Exception:
                # never let persistence break gameplay
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
        result = practice_games.advance_bots(game_id, predicted_winner=predicted)
        if result.get("complete"):
            try:
                _persist_practice_hand(practice_games.get(game_id))
            except Exception:
                # never let persistence break gameplay
                pass
        return result
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
        if (
            user.verified
            and result.get("topic") == "best_hand"
            and result.get("correct") is not None
        ):
            try:
                mastery_repository.update(
                    user_id, "hand_reading", 1.0 if result["correct"] else 0.0
                )
            except Exception:
                # mastery seeding must never break the chat
                pass
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


def _wav_sample_rate(data: bytes) -> int | None:
    if len(data) > 28 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return int.from_bytes(data[24:28], "little")
    return None


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    encoding: str = Form("webm"),
) -> dict:
    """Speech-to-text for the coach-chat microphone. The browser records the
    mic as webm/opus and posts it here; Google Cloud Speech returns the text,
    which the client drops into the chat box so the user can talk to Tell."""
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio upload.")
    try:
        from google.cloud import speech

        client = speech.SpeechClient()
        enc = encoding.lower()
        if enc in ("wav", "linear16"):
            audio_encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16
            sample_rate = _wav_sample_rate(audio_bytes)
        elif enc == "ogg":
            audio_encoding = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
            sample_rate = None
        else:
            audio_encoding = speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
            sample_rate = None

        config_kwargs = dict(
            encoding=audio_encoding,
            language_code="en-US",
            enable_automatic_punctuation=True,
            # Poker vocabulary boost: without it "queen ten" arrives as
            # "queen tomb" and card lists come out mangled.
            speech_contexts=[
                speech.SpeechContext(
                    phrases=[
                        "ace", "king", "queen", "jack", "ten", "nine", "eight",
                        "seven", "six", "five", "four", "three", "two",
                        "spades", "hearts", "diamonds", "clubs", "suited",
                        "offsuit", "pocket", "pair", "two pair", "three of a kind",
                        "trips", "straight", "flush", "full house", "four of a kind",
                        "straight flush", "royal flush", "high card",
                        "outs", "pot odds", "equity", "draw", "flush draw",
                        "straight draw", "gutshot", "check", "call", "raise",
                        "fold", "bet", "all in", "bluff", "preflop", "flop",
                        "turn", "river", "showdown", "board",
                    ],
                    boost=10,
                )
            ],
        )
        if sample_rate:
            config_kwargs["sample_rate_hertz"] = sample_rate

        audio = speech.RecognitionAudio(content=audio_bytes)
        response = client.recognize(
            config=speech.RecognitionConfig(**config_kwargs), audio=audio
        )
        transcript = " ".join(
            result.alternatives[0].transcript
            for result in response.results
            if result.alternatives
        ).strip()
        return {"text": transcript}
    except Exception as error:
        print(f"TRANSCRIBE ERROR: {type(error).__name__}: {error}")
        raise HTTPException(
            status_code=503,
            detail=f"Transcription failed: {type(error).__name__}: {error}",
        ) from error


@app.post("/api/hands/analyze")
def analyze_hand(
    request: AnalyzeRequest,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    user_id = effective_user_id(request.user_id, user)
    # Memory is per signed-in account only: unverified (demo) requests get a
    # full in-session analysis but never write to the shared local-user bucket.
    persist = user.verified

    if persist:
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

        if persist and evaluated.computed_equity is not None:
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

    # Memory steps (signed-in only): compare against the user's saved hands and
    # embed the leak summary so Firestore keeps vector memory alongside the
    # structured record (PRD 4.4 FR2). Best-effort: embedding failures must
    # never block a hand review.
    past_hands: list = []
    embedding: list[float] | None = None
    recurring = None
    if persist:
        past_hands = hand_repository.list_by_user(user_id)
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
        parsed_at=datetime.now(timezone.utc).isoformat(),
        showdown=parsed["showdown"],
        player_names=["Hero"] + [k for k in parsed["showdown"] if k != "hero"],
    )
    if persist:
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
    # Action memory is per signed-in account; demo requests are acknowledged
    # but never written to the shared local-user bucket.
    if not user.verified:
        return {"ok": False, "error": "sign-in required to save progress"}
    try:
        uid = effective_user_id(request.user_id, user)
        action_repository.log(
            UserAction(
                user_id=uid,
                action_type=request.action_type,
                context_street=request.context_street,
                context_hand=request.context_hand,
                detail=request.detail,
                option_label=request.option_label,
                session_id=request.session_id,
                understood=request.understood,
            )
        )
        # Quiz answers tagged with a concept seed the mastery tree.
        if (
            request.action_type in ("quiz_correct", "quiz_wrong")
            and request.option_label in MASTERY_CONCEPTS
        ):
            try:
                signal = 1.0 if request.action_type == "quiz_correct" else 0.0
                mastery_repository.update(uid, request.option_label, signal)
            except Exception:
                pass
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
    if not user.verified:
        return {
            "actions": [],
            "leak_hint": None,
            "preferred_style_pot_odds": "mixed",
            "math_wins": 0,
            "intuition_wins": 0,
        }
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
    # Hand memory belongs to signed-in accounts. Unauthenticated callers get an
    # empty list rather than the shared demo bucket.
    if not user.verified:
        return {"hands": []}
    hands = hand_repository.list_by_user(effective_user_id(user_id, user))
    hands.sort(key=lambda h: h.parsed_at or "", reverse=True)
    return {"hands": [h.to_firestore_dict() for h in hands]}


@app.post("/api/hands/{hand_id}/review")
def review_saved_hand(
    hand_id: str,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    """Re-open a saved hand for review without re-parsing. Works for both
    played practice hands and pasted histories, since both are stored in the
    same Hand shape with decision points already evaluated."""
    hand = hand_repository.get(hand_id)
    if hand is None or hand.user_id != user.uid:
        raise HTTPException(status_code=404, detail="Hand not found.")

    recurring = None
    if hand.leak_tags:
        try:
            others = [
                h
                for h in hand_repository.list_by_user(hand.user_id)
                if h.id != hand.id
            ]
            recurring = detect_recurring_leaks(hand.leak_tags, others)
        except Exception:
            recurring = None

    return {
        "status": "parsed",
        "hand": hand.to_firestore_dict(),
        "showdown": hand.showdown,
        "recurring_leak": recurring,
    }


@app.get("/api/mastery/{user_id}")
def get_mastery(
    user_id: str,
    user: AuthUser = Depends(resolve_user),
) -> dict:
    uid = effective_user_id(user_id, user)
    if not user.verified:
        return {"scores": {}}
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