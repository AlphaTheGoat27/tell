# Tell — Implementation Checklist

Companion to the PRD. Work top to bottom; the math engine must be solid before any agent/LLM code touches it — that ordering is deliberate, not optional.

---

## Phase 0 — Discovery & Scoping
- [ ] Confirm MVP game context: **No-Limit Hold'em cash games, 6-max or heads-up simplification** (resist scope creep toward tournaments/ICM/PLO for MVP)
- [ ] Confirm the flagship concept pair for the demo: **pot odds/equity** + **preflop hand selection by position**
- [ ] Write down the fixed leak-tag taxonomy (e.g., `bad_river_call`, `overwide_preflop_open`, `missed_value_bet`, `chasing_below_odds`, `misread_position`) — don't allow free-text leak tags
- [ ] Gather 5–10 real (anonymized) sample hand histories in a common export format, plus 5–10 free-form recap examples, to test the parser against later
- [ ] Confirm Google Cloud project set up, Vertex AI enabled, Gemini 3.5 access confirmed, credits applied
- [ ] Confirm Google ADK installed, minimal "hello world" agent runs
- [ ] Confirm Firestore native vector search is enabled/available in your project and you've created one test vector index successfully
- [ ] Re-read PRD Section 7 (Content & AI Behavior) — the "math layer is the single source of truth" rule shapes every architectural decision from here on

## Phase 1 — Design
- [ ] Sketch the 3 screens (Dashboard, Session/Table view, History) — lock the information architecture from PRD 5.1
- [ ] Design the visual poker-table component (positions, stacks, pot, board cards) — this is a key demo/UX asset, worth real design time
- [ ] Write out sample Socratic dialogue for at least 2 full hands (one preflop-focused, one postflop/pot-odds-focused) so you can see the tone before building the state machine
- [ ] Draft the leak-tag taxonomy into a simple lookup table (tag → concept_id → short explanation)
- [ ] Draft the architecture diagram (Coach Agent / Analyst Agent / Math Engine / Firestore+vectors) from PRD 6.1 — do this now, not the night before submission

## Phase 2 — Build: Poker Math Engine (before any agent code)
- [ ] Implement the pot odds calculator: `call_amount / (pot_before_call + call_amount)`
- [ ] Implement or integrate a 7-card hand evaluator
- [ ] Implement equity calculation via Monte Carlo simulation (or exhaustive enumeration for small remaining-card counts)
- [ ] Load static, versioned reference preflop range data by position (not LLM-generated)
- [ ] Write a unit-test suite that checks the math engine against independently known/verifiable values — do not proceed to Phase 3 until this is 100% green
- [ ] Benchmark equity-calculation latency; cache/precompute common preflop matchups if simulation is too slow for a snappy demo

## Phase 3 — Build: Data Layer
- [ ] Set up Firestore collections: `User`, `MasteryMap` (subcollection), `Hand`, `Session`, `ConceptKB`, `RangeChart`
- [ ] Set up Firestore security rules scoping all reads/writes to the authenticated user
- [ ] Set up Firebase Auth
- [ ] Create the Firestore vector index for `Hand.embedding` and `ConceptKB.embedding` (confirm dimension matches your embedding model's output)
- [ ] Seed `ConceptKB` with short reference explanations for each concept in your taxonomy, with embeddings generated via the Vertex AI text-embedding model

## Phase 4 — Build: Hand Autopsy (Analyst Agent)
- [ ] Build the LLM-based parser that turns raw hand-history text (export format) into the structured `Hand` schema
- [ ] Build the parallel parser path for free-form natural-language recaps into the same schema
- [ ] Implement the "confirm reconstructed hand back to the user" step before proceeding
- [ ] Wire the Analyst Agent to call the Poker Math Engine per decision point and attach leak tags where the user's action deviated materially from the computed number
- [ ] Implement opponent-username/identifying-info stripping before any hand is stored
- [ ] Test against your Phase 0 sample hand set — track parse success rate against the ≥80% MVP target
- [ ] Implement graceful clarifying questions for low-confidence parses (don't guess silently)

## Phase 5 — Build: Mastery Map & Vector Clustering
- [x] Implement the mastery-score update function (rolling signal across sessions, not last-hand-only) — `MasteryMap.update()` EWA rolling score; `MasteryRepository` round-trips through `InMemoryStore` serialization (same seam as `HandRepository`); `to_firestore_dict`/`from_firestore_dict` pair added and verified by `test_mastery_repository_round_trips_through_serialization`. *(Step 3 — done & tested)*
- [x] Implement embedding generation for each new leak/hand and storage alongside the structured record — `backend/embeddings/embedder.py` wired to `google-genai` SDK (`genai.Client(vertexai=True)` + `client.models.embed_content(model="gemini-embedding-001", ...)`); mock-tested locally (3 tests green); **live credential test still needed** (`python -c "from embeddings.embedder import embed_text; print(len(embed_text('bad river call')))"` should print `768`). Also fixed pre-existing `SyntaxError` in `embeddings/__init__.py` (unterminated docstring). *(Step 2 — done & tested locally, live API call needs your GCP credentials)*
- [ ] Implement the Firestore `findNearest` similarity query to detect recurring leak patterns across surface-different hands
- [ ] Add a minimum-similarity + same-leak-tag-agreement threshold before surfacing a "this keeps happening" callout (avoid false-positive pattern claims)
- [ ] Confirm the mastery map and recurring-leak callout are genuinely user-visible in the UI, not backend-only state

## Phase 6 — Build: Socratic Coach Agent
- [ ] Build the hint-level state machine (Level 1 question → Level 2 narrower question → Level 3 analogous worked example → Level 4 full walkthrough) with stubbed responses first
- [ ] Wire in Gemini 3.5 via Vertex AI + ADK, replacing stubs one hint level at a time
- [ ] Enforce in code that any numeric answer the Coach Agent gives comes from the Math Engine's return value, never from free model generation
- [ ] Implement the resolution/self-explanation check before a hand or drill session can close
- [ ] Implement misconception-specific correction (reference the specific gap, never a generic "not quite")
- [ ] Wire the Coach Agent to retrieve the top 1–2 relevant `ConceptKB` entries via vector search rather than replaying full session history every turn

## Phase 7 — Build: Frontend
- [ ] Build the Dashboard: mastery/leak map, "your top recurring leak" callout, submit-a-hand / drill-a-concept entry points
- [ ] Build the Session/Table view: visual poker table rendering the hand as it's discussed, chat thread, hint-level indicator, session summary
- [ ] Build the History view: filterable by concept/leak tag
- [ ] Build the onboarding diagnostic (5–6 questions)
- [ ] Wire the "leak map updates visibly" moment after a session resolves — polish this, it's a key demo beat

## Phase 8 — Test
- [ ] Run through all 3 personas' journeys manually (Alex, Sam, Jordan) end-to-end
- [ ] Confirm the math-layer guardrail holds: try to get the Coach Agent to state a pot-odds/equity number without it tracing back to the engine — it should never happen
- [ ] Confirm hint escalation can't be skipped without either repeated failed attempts or explicit override
- [ ] **Critical test:** submit two different-looking hands that share the same underlying leak, confirm the vector-clustering surfaces the "this is the same pattern" callout — this is the centerpiece of your demo and must work reliably before you record anything
- [ ] Test hand-history parsing against your full sample set; confirm parse success rate meets target
- [ ] Test Firestore security rules — confirm one user cannot read another's data
- [ ] Confirm opponent usernames are actually stripped from stored hands
- [ ] Sanity-check tone: read back a full session transcript, confirm it reads as a supportive study buddy, not a lecturing coach

## Phase 9 — Submission Prep
- [ ] Deploy to Cloud Run (backend + frontend)
- [ ] Confirm the deployed app is stable enough for a live/unedited demo segment
- [ ] Finalize the architecture diagram (clean version of the Phase 1 draft)
- [ ] Write the README with spin-up instructions (local run + cloud deploy)
- [ ] Record the ~4-minute demo:
  - [ ] Open with the problem (10–15 seconds — solver tools grade you against equilibrium but don't teach the why)
  - [ ] Show a live Hand Autopsy: paste a messy hand → reconstruction → Socratic questions → math reveal → leak tagged
  - [ ] Show the **second-hand callback**: a different hand triggers "this is the same leak as before" via vector similarity — lead with this, it's the differentiator
  - [ ] Show proof the backend is running on Google Cloud (Cloud Run dashboard, Vertex AI logs, or similar)
- [ ] Write the text description: features, technologies used, data sources, findings/learnings
- [ ] Push code to a public (or shared-access) repo with clear commit history
- [ ] (Optional, bonus points) Publish a short write-up or social post per the hackathon's bonus-point rules, with required disclosure language/hashtag

## Phase 10 — Final Pre-Submission Sanity Pass
- [ ] Does the demo lead with the differentiator (recurring-leak recognition across different hands) in the first 30–45 seconds? If not, re-cut it.
- [ ] Does the repo/README let a judge verify the math-engine-as-source-of-truth architecture without running the app? If not, add detail — this is a direct scoring lever.
- [ ] Does every displayed pot-odds/equity number in the demo actually trace back to the math engine, with zero exceptions?
- [ ] Is the leak map genuinely legible at a glance, or does it need one more design pass?
- [ ] Have you clearly and visibly labeled reference preflop ranges as approximations, not solver-perfect output?
- [ ] Have you cut anything from "Should-have" that's eating time better spent polishing the "Must-have" list (PRD Section 8)?
