# Tell

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Google Cloud Run](https://img.shields.io/badge/Google%20Cloud%20Run-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](https://www.python.org/)


**A poker study partner that never gives you the answer first — it asks the question that gets you to it, using your own hands as the curriculum.**

Built for the [All Things Agentic Hackathon](https://allthingsagentichackathon.devpost.com/) — Collaborative Partner track.

🔗 **Live app:** https://tell-506715.web.app/
🔗 **Backend API:** https://tell-backend-349695222877.asia-southeast1.run.app

---

## The problem

Most poker-improvement tools (GTO Wizard, ThinkGTO, PLO Genius, and similar) are built for players who already think in solver terms — they grade you against equilibrium but don't explain the reasoning a newer player actually needs. None of them start from _your own actual hands_ and walk you through why a decision was right or wrong.

Tell does. Paste in a hand you played — even a messy export straight from a poker client — and it reconstructs what happened, asks what you were thinking at each decision point, and only then reveals what the math actually says. Every session it updates a private map of exactly which concepts keep costing you money, and it remembers the _pattern_ of your mistakes even when two hands look nothing alike on the surface.

## Why this fits Collaborative Partner

The track is scored on whether the agent actively **synthesizes or mutates data** rather than just reading it, and how well it ingests **messy, unstructured input**. That's the literal center of Tell's design:

1. A hand history export — real, semi-structured, often inconsistent text — gets parsed into a clean schema.
2. Every decision point is checked against a deterministic pot-odds/equity engine (never against a model's free-handed guess).
3. Leaks get tagged, embedded, and compared against the user's _past_ leaks via Firestore's native vector similarity search — so "called a river bet with a gutshot" and "chased a flush draw for the wrong price" get recognized as the same underlying pattern, even though the hands look nothing alike.
4. The coach — a real Gemini call, not a template — asks about that specific hand before ever stating a number.

## How it works

```
┌────────────────────────┐      ┌───────────────────────────────┐      ┌───────────────────────┐
│   Frontend             │      │   Backend (Cloud Run)         │      │   Google Cloud        │
│   React + Vite         │◄────►│   FastAPI                     │◄────►│   Vertex AI / Gemini  │
│   Firebase Auth        │      │  ┌───────────────────────┐    │      │   (google-genai SDK)  │
│   (Sign in with Google)│      │  │ Poker Math Engine     │    │      └───────────────────────┘
└────────────────────────┘      │  │ pot odds, 7-card eval,│    │
                                │  │ Monte Carlo equity    │    │      ┌───────────────────────────┐
                                │  │ (pure Python, no LLM) │    │◄────►│   Firestore               │
                                │  └───────────────────────┘    │      │   hands, mastery_maps,    │
                                │  ┌───────────────────────┐    │      │   user_actions, embeddings│
                                │  │ Hand Parser + Leak    │    │      │   (native vector search)  │
                                │  │ Detector -> structures│    │      └───────────────────────────┘
                                │  │ messy input, tags leaks    │
                                │  └───────────────────────┘    │
                                │  ┌───────────────────────┐    │
                                │  │ Gemini Coach          │    │
                                │  │ composes the dialogue;│    │
                                │  │ every number still comes   │
                                │  │ from the math engine  │    │
                                │  └───────────────────────┘    │
                                └───────────────────────────────┘
```

The rule that shapes the whole backend: **the LLM never states a pot-odds or equity number from its own reasoning.** It always relays what the deterministic engine returned. That split — model for language and judgment, code for math — is enforced architecturally, not just by prompting.

## Google Cloud requirements checklist

| Requirement                 | How Tell satisfies it                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Gemini 3.5+ via Vertex AI   | `google-genai` SDK, used in the coach dialogue and hand-history mutation    |
| Google Agent Framework      | GenAI SDK (`google.genai`) drives the live coaching calls                   |
| Google Cloud infrastructure | Cloud Run (backend), Firestore Native (data + vector index)                 |
| Not required, used anyway   | Firebase Auth, Firebase Hosting, Cloud Text-to-Speech, Cloud Speech-to-Text |

## Features

- **Hand Autopsy** — paste a hand history export or a free-form recap; Tell reconstructs it, questions your reasoning street by street, then reveals the real pot odds and equity.
- **Recurring leak detection** — every leak is embedded and compared against your history via Firestore vector search, so patterns get caught across differently-worded hands.
- **Mastery map** — a persistent, per-concept skill score that drives what the coach leads with next session.
- **Practice mode** — play hands against explainable bots with a deterministic (non-LLM) chat coach for exact pot-odds/outs/hand-strength quizzing.
- **Sign in with Google** — every user's data is scoped to their verified Firebase uid, never a client-supplied ID.
- **Voice** — optional narration (Cloud Text-to-Speech) and voice input (Cloud Speech-to-Text) for hands-free review.

## Project structure

```
backend/
  math_engine/     pot odds + equity (pure Python, zero cloud deps, unit tested)
  models/          Hand, MasteryMap schemas + Firestore serialization
  parsers/         deterministic structured hand-history parser
  leak_detection/  pot tracking, leak tagging, recurring-pattern detection
  storage/         InMemoryStore / FirestoreStore seam, repositories
  auth/            Firebase ID token verification
  agent/           early ADK-based coach scaffold (superseded by game/gemini_coach.py)
  game/            practice-mode engine, deterministic chat, Gemini-backed coach
  api/             FastAPI app -- see API reference below
frontend/
  src/             React + Vite app, Firebase Auth, the poker table UI
infra/
  firestore.rules, firestore.indexes.json
docs/
  tell-prd.md, tell-checklist.md
```

## Running it locally

**Backend:**

```bash
cd backend
python3 -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
pytest                                              # 76 tests, no cloud credentials needed
uvicorn api.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive API docs. Without `GOOGLE_CLOUD_PROJECT` set, the backend runs entirely on in-memory storage -- no credentials required to develop or test.

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env.local` and fill in your Firebase web-app config to enable real sign-in; without it, the app runs in demo mode with in-memory storage.

**To connect to real Firestore locally:**

```bash
export GOOGLE_CLOUD_PROJECT=tell-506715
gcloud auth application-default login
```

`create_store()` prints which store it picked (and why, if it fell back) -- check the terminal output on startup to confirm.

## Deploying

```bash
# Backend -> Cloud Run
gcloud run deploy tell-backend --source backend/ --region asia-southeast1 --allow-unauthenticated
gcloud run services update tell-backend --region asia-southeast1 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=tell-506715,GOOGLE_CLOUD_LOCATION=asia-southeast1,TELL_ALLOWED_ORIGINS=https://tell-506715.web.app

# Frontend -> Firebase Hosting
cd frontend && npm run build
firebase deploy --only hosting
```

The Cloud Run service account needs `roles/datastore.user` and `roles/aiplatform.user` for Firestore and Vertex AI access -- see `infra/firestore.rules` for the data-access model (note: Security Rules only govern direct client-SDK access; the backend uses the Admin SDK and enforces ownership itself via verified Firebase ID tokens in `auth/firebase_auth.py`).

## API reference

| Endpoint                                            | What it does                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /health`                                       | Liveness check                                                                 |
| `GET /api/me`                                       | Resolved identity for the request's bearer token                               |
| `GET /api/storage`                                  | Reports whether the backend is running on Firestore or in-memory storage       |
| `POST /api/hands/analyze`                           | Parse a hand history export, evaluate every decision point, tag leaks, persist |
| `GET /api/hands`                                    | List a user's analyzed hands                                                   |
| `POST /api/hands/{hand_id}/review`                  | Re-open a saved hand for another coaching pass                                 |
| `GET /api/mastery/{user_id}`                        | Per-concept mastery scores                                                     |
| `POST /api/actions/log` / `GET /api/actions/recent` | Adaptive-style signal log (math-first vs. intuition-first)                     |
| `POST /api/practice`                                | Deal a practice hand against explainable bots                                  |
| `POST /api/practice/{game_id}/action`               | Advance a practice hand (fold/check/call/raise)                                |
| `POST /api/practice/{game_id}/bots`                 | Resolve the bots' action after a fold                                          |
| `POST /api/practice/{game_id}/chat`                 | Deterministic coach chat -- exact math, no LLM                                 |
| `POST /api/narrate`                                 | Text-to-speech narration                                                       |
| `POST /api/transcribe`                              | Speech-to-text for voice input                                                 |

## Testing

```bash
cd backend && pytest -v
```

76 tests covering the math engine (checked against known poker benchmarks), hand parsing, leak detection, storage round-trips, and the API -- all runnable with zero cloud credentials.

## Honest scope notes

- **Free-form recap parsing is partial.** The structured hand-history export path (`parsers/structured_parser.py`) is fully deterministic and reliable. Genuinely free-form recaps ("I had AK, raised, got called...") currently fall back to a clarification prompt rather than an LLM parse -- a natural next step, not yet built.
- **Reference preflop ranges are approximations**, not solver-perfect GTO output, and are labeled as such -- Tell teaches sound fundamentals, it isn't a replacement for a full solver.
- **`agent/agent.py`** is an earlier ADK-based coach scaffold, superseded by `game/gemini_coach.py`'s direct GenAI SDK integration -- kept in the repo for reference, not part of the live request path.

## License

This project is licensed under the MIT License.
