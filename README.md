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

## API endpoints

- `GET /health` — local readiness check
- `POST /api/hands/analyze` — parse a supported structured hand-history export

The frontend and backend are independently runnable, which keeps local testing pleasantly boring—in the best possible way.
