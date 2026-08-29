"""Gemini-backed practice coach.

Gemini composes the conversational answer, but every fact it can quote
(best five-card hand, pot odds, equity, outs, preflop tier) is computed by
the deterministic engine first and injected as ground truth — the model can
relay or explain these numbers, never invent them (PRD integrity rule).

Quiz grading stays fully deterministic here as well; Gemini only delivers
the verdict. If Gemini is unreachable, the caller falls back to the
rule-based coach in coach_chat.py.
"""

import os
from collections import Counter
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:  # environments without the Google SDK
    genai = None
    types = None

from game.coach_chat import extract_rank_tokens, mentioned_classes
from game.hand_reader import (
    available_ranks,
    best_five,
    format_cards,
    outs_summary,
    readable_rank,
)
from game.holdem import BOT_PERSONALITIES, _preflop_read
from math_engine.equity import calculate_equity
from math_engine.pot_odds import calculate_pot_odds

GEMINI_MODEL = os.environ.get("TELL_COACH_MODEL", "gemini-3.5-flash")

_client = None
_unavailable = False


def _load_env() -> None:
    env_file = Path(__file__).resolve().parent.parent / "agent" / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def _get_client():
    global _client, _unavailable
    if _unavailable or genai is None:
        return None
    if _client is None:
        _load_env()
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        location = os.environ.get("GOOGLE_CLOUD_LOCATION")
        api_key = os.environ.get("GOOGLE_API_KEY")
        try:
            if project and location:
                _client = genai.Client(vertexai=True, project=project, location=location)
            elif api_key:
                _client = genai.Client(api_key=api_key)
            else:
                _unavailable = True
                return None
        except Exception:
            _unavailable = True
            return None
    return _client


def _street_name(street: str) -> str:
    return {
        "preflop": "preflop",
        "flop": "flop",
        "turn": "turn",
        "river": "river",
        "showdown": "showdown",
    }.get(street, street)


def _player_name(seat: int) -> str:
    if seat == 0:
        return "You"
    return BOT_PERSONALITIES[(seat - 1) % len(BOT_PERSONALITIES)]["name"]


def _add_showdown_facts(game, facts: dict) -> None:
    """Ground truth for showdown questions: every hand's best five cards."""
    if len(game.board) < 3 or not game.hands:
        return
    lines = []
    for seat, hand in enumerate(game.hands):
        cards = format_cards(hand)
        if seat == 0 and game.hero_folded:
            lines.append(f"You (folded): {cards} — out of the hand")
            continue
        try:
            best = best_five(hand, game.board)
            lines.append(
                f"{_player_name(seat)}: {cards} makes {format_cards(best['cards'])} ({best['class']})"
            )
        except Exception:
            lines.append(f"{_player_name(seat)}: {cards}")
    facts["showdown_hands"] = " | ".join(lines)
    if game.winner is not None and 0 <= game.winner < len(game.hands):
        try:
            best = best_five(game.hands[game.winner], game.board)
            facts["winner_explanation"] = (
                f"{_player_name(game.winner)} won with {best['class']}: "
                f"{format_cards(best['cards'])}"
            )
        except Exception:
            pass


def collect_facts(game) -> dict:
    """Deterministic ground truth for the current hand state."""
    hole = game.hands[0]
    facts: dict = {
        "street": game.street,
        "pot": f"${game.pot:.2f}",
        "hero_cards": format_cards(hole),
        "board": format_cards(game.board) if game.board else "none yet (preflop)",
    }
    if game.complete:
        facts["result"] = game.result or "hand over"
        _add_showdown_facts(game, facts)
        return facts

    if game.hero_folded and not game.complete:
        facts["situation"] = (
            f"the learner folded on the {_street_name(game.hero_fold_street or game.street)}; "
            "the board ran out and all bot cards are face up — they should now predict which bot wins"
        )
        _add_showdown_facts(game, facts)
        return facts

    if not game.board:
        tier, tip = _preflop_read(hole)
        facts["preflop_tier"] = tier
        facts["preflop_read"] = tip.replace(" ".join(hole), format_cards(hole), 1)
        return facts

    best = best_five(hole, game.board)
    facts["best_five"] = format_cards(best["cards"])
    facts["hand_class"] = best["class"]

    odds = calculate_pot_odds(game.pot, 1.0)
    facts["pot_odds"] = (
        f"a $1.00 call into the ${game.pot:.2f} pot requires "
        f"{odds.required_equity_pct} equity ({odds.ratio})"
    )

    if len(game.board) in (3, 4):
        summary = outs_summary(hole, game.board)
        draws = ", ".join(summary["draws"]) if summary["draws"] else "no named draws"
        facts["outs"] = (
            f"{summary['count']} outs — {format_cards(summary['outs'][:12])} ({draws})"
        )
        try:
            equity = calculate_equity(hole, game.board, iterations=1500)
            facts["equity_vs_random"] = equity.win_pct
        except Exception:
            pass
    return facts


def assess_guess(game, text: str) -> dict | None:
    """Deterministically grade a best-hand quiz answer. None = not an answer."""
    if game.complete or len(game.board) < 3:
        return None
    hole = game.hands[0]
    best = best_five(hole, game.board)
    truth = f"{format_cards(best['cards'])} — {best['class']}"

    tokens = extract_rank_tokens(text)
    if len(tokens) >= 3:
        if len(tokens) < 5:
            return {
                "topic": "best_hand",
                "correct": None,
                "truth": truth,
                "note": f"only {len(tokens)} cards named — a best hand uses exactly five of the seven available",
            }
        guess = Counter(tokens[:5])
        if guess == best["ranks"]:
            return {"topic": "best_hand", "correct": True, "truth": truth, "note": ""}
        available = available_ranks(hole, game.board)
        problems = []
        for rank, count in guess.items():
            have = available.get(rank, 0)
            name = readable_rank(rank)
            if have == 0:
                problems.append(f"there is no {name} in play")
            elif count > have:
                problems.append(f"only {have} {name}s exist between the hand and the board")
        note = "; ".join(problems) or "a stronger five-card combo exists"
        return {"topic": "best_hand", "correct": False, "truth": truth, "note": note}

    mentioned = mentioned_classes(text.lower())
    if mentioned:
        correct = best["class"] in mentioned
        said = " or ".join(mentioned)
        note = "" if correct else f"they said {said}"
        return {"topic": "best_hand", "correct": correct, "truth": truth, "note": note}
    return None


def _system_prompt(facts: dict, assessment: dict | None) -> str:
    lines = [
        "You are Tell, a warm, sharp poker coach sitting with the learner during a live practice hand.",
        "",
        "GROUND TRUTH — computed by the deterministic math engine. Quote these exactly; never recompute or invent numbers:",
    ]
    for key, value in facts.items():
        lines.append(f"- {key.replace('_', ' ')}: {value}")
    lines += [
        "",
        "RULES:",
        "1. Answer the learner's actual question directly. For concept questions (e.g. 'what is a strong hand?'), teach the concept briefly with concrete card examples, then connect it to their current hand using the ground truth.",
        "2. If a number isn't in the ground truth, say you can't compute it right now — never estimate.",
        "3. When the hand is over (or they folded and bots are face up) and they ask who won or why, compare the showdown hands above and cite each player's actual best five-card hand.",
        "4. Keep replies conversational and under ~90 words. No markdown.",
        "5. Strategy and math education only; no real-money advice or winning guarantees.",
    ]
    if assessment is not None:
        if assessment["correct"] is True:
            verdict = "CORRECT"
        elif assessment["correct"] is False:
            verdict = "WRONG"
        else:
            verdict = "INCOMPLETE"
        lines += [
            "",
            f"QUIZ VERDICT on the learner's best-hand answer: {verdict}. This verdict is final — deliver it kindly but clearly.",
            f"The true best five-card hand is: {assessment['truth']}",
        ]
        if assessment["note"]:
            lines.append(f"Explain specifically: {assessment['note']}.")
        if verdict == "INCOMPLETE":
            lines.append("Ask them to give all five cards.")
    return "\n".join(lines)


def gemini_reply(game, message: str) -> dict:
    """Return {reply, topic, correct} composed by Gemini, grounded in facts."""
    client = _get_client()
    if client is None:
        raise RuntimeError("Gemini is not available in this environment.")

    facts = collect_facts(game)
    assessment = assess_guess(game, message)
    prompt = _system_prompt(facts, assessment)

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=message,
        config=types.GenerateContentConfig(
            system_instruction=prompt,
            temperature=0.5,
            # Thinking models spend part of the output budget on internal
            # thoughts; 300 truncated replies mid-sentence (MAX_TOKENS).
            max_output_tokens=2048,
            http_options=types.HttpOptions(timeout=25_000),
        ),
    )
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Gemini returned an empty reply.")

    return {
        "reply": text,
        "topic": assessment["topic"] if assessment else "chat",
        "correct": assessment["correct"] if assessment else None,
        "street": game.street,
        "engine": "gemini",
    }
