# Tell

Tell is a poker study companion. The current local MVP includes the deterministic hand parser, pot-odds/equity engine, leak detection, a FastAPI backend, and a React frontend scaffold.

## Project structure

- `backend/` — Python API and domain packages
- `frontend/` — React + Vite UI
- `infra/` — Firestore rules and indexes
- `docs/` — product requirements and implementation checklist

## Run the backend

From the repository root, create a virtual environment and install `backend/requirements.txt`. Then run the test suite with `pytest` and start the API with Uvicorn at port 8000. Open `/docs` to view the interactive API documentation.

The local API uses in-memory storage and does not require cloud credentials. Cloud Firestore, Vertex AI, and ADK integrations are intentionally isolated behind adapter seams for the next phase.

## Run the frontend

From `frontend/`, install npm dependencies, run the Vite development server, and open the printed local URL. Production validation is available through the existing `build` and `lint` scripts.

## Sign in with Google + Firestore memory

Tell remembers each user individually:

- The frontend uses Firebase Auth (Sign in with Google popup). Copy `frontend/.env.example` to `frontend/.env.local` and fill in your Firebase web-app values. Without them the app runs in zero-config demo mode with in-memory storage.
- Every API request carries the Firebase ID token as `Authorization: Bearer <token>`; `backend/auth/firebase_auth.py` verifies it with firebase-admin and scopes all data to the verified uid (a client-supplied `user_id` can never impersonate another user).
- With `GOOGLE_CLOUD_PROJECT` set (Cloud Run provides it automatically), `create_store()` persists to Cloud Firestore: analyzed hands with leak tags (`hands`), per-concept mastery scores (`mastery_maps`), decision logs (`user_actions_v1`), and explanation-style preferences (`writing_style_v1`).
- Leak summaries are embedded (gemini-embedding-001, 768 dims, best-effort) and stored on `Hand.embedding`; the vector index is declared in `infra/firestore.indexes.json`. `infra/firestore.rules` locks every read/write to the owning uid.
- Every analysis checks the user's stored hands for recurring mistakes and returns a `recurring_leak` callout, which the coach surfaces as a "Memory check" message.

Backend env vars: `GOOGLE_CLOUD_PROJECT` (turns on Firestore), optional `FIREBASE_SERVICE_ACCOUNT` (service-account JSON path; otherwise Application Default Credentials are used), optional `TELL_AUTH_MODE=local` (dev override: keeps `local:` demo tokens working on machines that already have Google Application Default Credentials).

Troubleshooting:

- If the Sign-in-with-Google popup shows "The requested action is invalid", enable **Google** under Firebase console → Authentication → Sign-in method for your project (and keep `localhost` in Authorized domains).
- On machines whose antivirus performs TLS inspection (e.g. Avast Web Shield), the Firestore **gRPC** connection fails certificate verification locally. This does not affect Cloud Run deployments; for local checks against the real database, use the REST API (see the smoke scripts) or exclude the dev tools from TLS scanning.

## API endpoints

- `GET /health` — local readiness check
- `GET /api/me` — resolved identity for the request's bearer token
- `POST /api/hands/analyze` — parse a supported structured hand-history export
- `POST /api/practice` — deal a practice hand against explainable bots
- `POST /api/practice/{game_id}/action` — advance the hand with fold/check/call/raise
- `POST /api/practice/{game_id}/bots` — resolve the post-fold winner prediction
- `POST /api/practice/{game_id}/chat` — deterministic coach chat: checks the learner's best-five-card answers and answers hand-strength / pot-odds / outs questions using the math engine and hand reader (no LLM, so every number is exact)

The frontend and backend are independently runnable, which keeps local testing pleasantly boring—in the best possible way.
