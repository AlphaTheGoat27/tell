# Tell — Product Requirements Document

**Version:** 1.0 · **Status:** Draft for build · **Track:** Collaborative Partner (All Things Agentic Hackathon) · **Owner:** You

---

## 1. Overview

### 1.1 Product Name
Tell

### 1.2 Problem Statement
Most poker-improvement tools are built for players who already think in solver terms — they output equilibrium ranges and EV numbers but don't explain the reasoning a newer player actually needs. The tools that exist (GTO Wizard, ThinkGTO's Preflop+/Postflop+, PLO Genius, GTO Gecko, and similar) are excellent at grading you against equilibrium, but they assume GTO literacy you may not have yet, and none of them start from *your own actual hands* and walk you through why a decision was right or wrong in a way that builds understanding rather than just a score.

The result: players grind free solver reps or pay $25–40/month for tools that tell them *what* the equilibrium play is, without ever building the underlying intuition — so mistakes repeat, because the player never internalized *why* the correct play was correct.

### 1.3 Target Users & Primary Use Cases
- Beginner-to-intermediate cash game players (home games, low-stakes live, micro-stakes online) who know the rules of poker but freeze up on real-time math (pot odds, equity) and hand selection.
- Players with some experience who have specific recurring leaks they can't self-diagnose from memory alone.
- **Primary use case:** "I played a hand I wasn't sure about — help me understand what I should have done and why."
- **Secondary use case:** "Quiz me / drill me on pot odds and opening ranges so the math becomes automatic at the table."

### 1.4 Product Vision & Value Proposition
Tell is a study partner that never just hands you "the right play" — it asks the question that gets you to work it out, using your own hands as the curriculum. Paste in a hand you played (even messy, half-remembered, copy-pasted from a hand history export), and it reconstructs what happened, asks you what you were thinking at each decision point, and only then reveals what the math actually says — pot odds, equity, and whether your hand selection made sense for your position. Every session it updates a private map of exactly which concepts keep costing you money, and it leads with those the next time.

**The promise:** it feels like reviewing your session with a sharp, patient friend who did the math in the background and remembers every leak you've ever had — not a solver spitting out a percentage you have to decode yourself.

### 1.5 Competitive Landscape & Differentiation (why this, why now)
| Existing tool | What it does well | What it doesn't do |
|---|---|---|
| GTO Wizard | Massive pre-solved spot library, nodelocking, huge content ecosystem | Assumes you already think in GTO terms; doesn't teach from your own hands |
| ThinkGTO (Preflop+/Postflop+) | Mobile drilling against a GTO bot, ELO-style progress tracking | Solver-first grading, not reasoning-first coaching |
| PokerTrainer | Free, simple, good for raw reps on basics | No personalization, no memory of your specific leaks |
| GTO Gecko / PLO Genius | EV-loss grading, adaptive repetition of misplayed spots | Still spot-drilling, not built around ingesting *your* actual played hands |

The gap: nothing in this category takes a real, messy hand you just played, reconstructs it, questions your reasoning, and remembers the specific pattern of mistakes across sessions in a way that changes how it teaches you. That's the product.

**Explicit non-goal:** this is a strategy/math education tool, not a real-money gambling product. It does not integrate with real-money poker platforms, does not simulate wagering, and makes no promises about guaranteed winnings — poker has variance, and the product should never imply otherwise.

---

## 2. Objectives & Success Metrics

### Business Goals
- Prove a genuinely differentiated mechanism (hand-history-driven Socratic coaching + persistent leak memory) that's hard to reduce to "a wrapper around a solver."
- Win on the specific rubric dimensions this hackathon actually scores: data synthesis from messy input, architectural discipline, and a demo that *proves* the memory/adaptation claim live.
- Build a foundation that scales from "pot odds and preflop ranges" to a full postflop/ICM curriculum without re-architecting.

### User Goals
- Get a real hand reviewed without waiting for a coach or a forum reply.
- Understand *why* a decision was +EV or -EV, not just get told a number.
- See concrete evidence of which leaks are shrinking over time.
- Build math fluency (pot odds, equity) that becomes automatic at the table.

### KPIs
| Metric | Definition | MVP Target |
|---|---|---|
| Hand parse success rate | % of pasted hand histories successfully structured without manual correction | ≥ 80% |
| Math accuracy | % agreement between engine-computed pot odds/equity and independently verified values (unit-test suite) | 100% (this is non-negotiable — see Section 7) |
| Session completion rate | % of started review/drill sessions reaching a resolved conclusion | ≥ 70% |
| Return rate | % of users starting a 2nd session within 7 days | ≥ 40% |
| Leak resolution rate | % of flagged leaks that move from "weak" to "developing/strong" within 4 sessions of being flagged | ≥ 50% |
| Adaptation visibility | % of returning users who notice the tutor referencing a specific past hand/leak (survey) | ≥ 60% |

---

## 3. User Personas & User Journeys

### Persona 1 — Alex, 27, Home Game Grinder
Plays a weekly home game, knows hand rankings, has no idea what "getting the right price" means. Calls or folds on gut feel. Wants to stop bleeding money on bad calls without becoming a math nerd.

**Journey:** After a rough session, opens the app and types a rough recap of a hand he wasn't sure about → agent reconstructs the hand, asks "what did you think the pot odds were before you called?" → Alex has no idea → agent walks him through the calculation using *his own numbers* (the actual pot and bet size from his hand) → flags "pot odds calculation" as a weak concept → next session opens with a quick pot-odds drill before touching anything else.

### Persona 2 — Sam, 24, Online Micro-Stakes Grinder
Grinds micro-stakes online, exports hand histories from tracking software, wants to move up in stakes. Doesn't want a full solver subscription yet — wants to know specifically what's costing them money.

**Journey:** Pastes a raw hand history export (multi-line text, timestamps, seat numbers, the works) → agent parses it, flags a river call that was -EV given the pot odds vs. Sam's stated read → session becomes a targeted Socratic walk-through of that specific decision → the leak ("calling too wide on rivers against polarized bet sizing") gets tagged and tracked across future imports.

### Persona 3 — Jordan, 35, Casual/Aspiring Serious Player
Plays live cash monthly, wants to actually get good before diving into solver software, which currently feels overwhelming. Self-learner, no coach, no study group.

**Journey:** Onboards with a quick diagnostic (a handful of pot-odds and hand-ranking questions) → gets a starting leak map even before submitting a real hand → does short sessions reviewing hands from memory after each live session → the growing leak map is the only concrete evidence of improvement Jordan has, since there's no coach or peer group giving that feedback otherwise.

### End-to-End Flow (all personas)
1. **Onboarding** — quick diagnostic (5–6 questions covering pot odds and basic range sense) seeds the initial mastery/leak map.
2. **Submit a hand** — paste a hand history export, or type a free-form recap of a hand played live/from memory.
3. **Hand Autopsy** — agent reconstructs the hand into a structured timeline (positions, actions, board, sizing) and confirms it back to the user ("so you opened button, BB called, flop K-7-2 rainbow...").
4. **Socratic walk-through** — at each decision point, agent asks what the user was thinking *before* revealing what the math says.
5. **Resolution** — engine reveals the deterministic pot odds/equity numbers, agent explains the gap (if any) between the user's reasoning and the math, ties it to a named concept.
6. **Leak map update** — visibly updates; if this is a repeat of a previously flagged leak, the agent says so explicitly.
7. **Return visit** — dashboard surfaces "your top leak" and suggests either submitting a new hand or drilling the weak concept directly.

---

## 4. Core Features & Requirements

### 4.1 Deterministic Poker Math Engine
**Description:** The computational backbone — pot odds, hand equity, and reference preflop ranges are computed in code, never free-handed by the LLM. This is the single most important architectural decision in the product: correctness cannot depend on model sampling.

**User stories:**
- As a user, I want the pot odds and equity numbers I'm shown to be exactly right, so that I can trust the coaching built on top of them.

**Functional requirements:**
- FR1: Pot odds calculator: `required_equity = call_amount / (pot_before_call + call_amount)`, computed in code from parsed hand data.
- FR2: Equity calculator: given hero's hand, known board cards, and either a specific villain combo or a villain range, compute win/tie/lose % via a standard 7-card hand evaluator plus Monte Carlo simulation (or exhaustive enumeration where the remaining card count makes it fast enough).
- FR3: Reference preflop range charts stored as static, versioned data (not LLM-generated) per position for a standard 6-max cash game context, used as a *reference point for discussion*, not an absolute solver-perfect answer — the product should be explicit with users that these are standard approximations, not exact solver output, to avoid false precision.
- FR4: All math-engine outputs are unit-tested against known, independently verifiable values before any agent logic is layered on top.

**Non-functional requirements:**
- Latency: pot odds computation near-instant; equity simulation returns within ~2 seconds for typical postflop spots.
- Determinism: identical inputs always produce identical outputs — no model variance in the math layer.

### 4.2 Hand Autopsy — Messy Hand History Ingestion & Leak Synthesis
**Description:** The product's centerpiece and primary differentiator. Accepts messy, unstructured input — a pasted hand-history export or a free-form typed recap — and mutates it into a structured hand record, then synthesizes it against the math engine to detect specific, tagged leaks.

**User stories:**
- As a user, I want to paste in a hand however I have it (export or my own words), so I don't have to manually re-enter it in a rigid form.
- As a user, I want the system to tell me specifically what I got wrong (and where), not just "nice hand" or a vague grade.

**Functional requirements:**
- FR1: Accept two input modes: (a) a plain-text hand-history export in a common online-poker format, and (b) a free-form natural-language recap.
- FR2: LLM-based parsing step extracts a structured `Hand` record: seats/positions, stack sizes (if present), action sequence per street, bet sizes, board cards, and showdown/result if known.
- FR3: Agent confirms the reconstructed hand back to the user before proceeding, so parsing errors are caught immediately rather than silently propagating.
- FR4: For each decision point in the hand, the math engine computes the "textbook" number (pot odds required equity, computed equity, or range fit) and the system tags any material deviation with a specific, fixed-taxonomy leak label (e.g., `bad_river_call`, `overwide_preflop_open`, `missed_value_bet`, `chasing_below_odds`).
- FR5: Leak tags feed directly into the Mastery Map (4.4) — this is the "mutate data, don't just read it" mechanism the product is built around.

**Non-functional requirements:**
- Parsing failure must degrade gracefully: if the engine can't confidently reconstruct part of a hand, it asks a clarifying question rather than guessing silently.
- Any opponent usernames or identifying information in a pasted hand history are stripped/anonymized before storage — this is third-party data the user doesn't own the right to retain verbatim.

### 4.3 Socratic Questioning Engine
**Description:** Drives the actual coaching dialogue, whether reviewing a submitted hand or drilling a concept directly.

**User stories:**
- As a user, I want to be asked what I was thinking before being told the answer, so the review actually builds my judgment instead of just correcting me.

**Functional requirements:**
- FR1: At each decision point, the agent's first move is a question ("what did you put them on there?" / "what price were you getting?"), never a direct verdict.
- FR2: Tiered hint escalation identical in spirit to a general Socratic tutor: **Level 1** (guiding question) → **Level 2** (narrower question, e.g., "what's the pot size before your call?") → **Level 3** (worked micro-example on an analogous, simplified spot) → **Level 4** (full walkthrough using the deterministic math-engine output).
- FR3: Misconception-specific correction — a wrong read gets a response naming the specific gap (e.g., "you're valuing top pair like it's always good here, but think about what hands continue on this river").
- FR4: Every resolved hand ends with the user restating, in their own words, what the correct thought process should have been — this is what updates the mastery map, not just whether they "got it right."

**Non-functional requirements:**
- Response latency under ~3 seconds per turn.
- Tone: supportive study-buddy, not a lecturing coach (see Section 7).

### 4.4 Mastery Map / Leak Tracker (Persistent Memory Bank, Vector-Backed)
**Description:** A per-user, per-concept model of demonstrated understanding, plus a vector-embedded leak history that lets the system recognize *recurring patterns* even when the surface details of each hand differ.

**User stories:**
- As a returning user, I want the system to notice when I'm making the same kind of mistake in different-looking hands, so I actually address the pattern instead of treating each hand as unrelated.

**Functional requirements:**
- FR1: Concept-level mastery score (weak/developing/strong) per fixed taxonomy: pot odds calculation, preflop hand selection by position, postflop bet-sizing logic, hand reading/board texture awareness.
- FR2: Each flagged leak, and each concept explanation the system has given, is embedded (via Vertex AI's text-embedding model) and stored in Firestore alongside the structured record.
- FR3: Vector similarity search (Firestore native vector search) clusters new leaks against past ones — so "called a river bet with a gutshot that missed" and "chased a flush draw for the wrong price on the turn" can be recognized as the same underlying pattern ("calling below required equity") even though the hands look nothing alike on the surface.
- FR4: Mastery map is user-visible, not backend-only state — a simple concept-by-concept visualization plus a running "recurring leak" callout.
- FR5: Mastery decays slightly if a concept goes unaddressed for several sessions (nice-to-have for MVP).

**Non-functional requirements:**
- All mastery/leak data persists reliably across sessions/devices.
- The embedding-based clustering must be explainable in the UI ("this looks like the same pattern as a hand from last week") — not an invisible black box.

### 4.5 Adaptive Teaching Style
**Description:** Learns whether a given user responds better to numeric/math-first explanations or intuition/range-first explanations, and leads with whichever has worked historically.

**Functional requirements:**
- FR1: Track which explanation style preceded a user's successful self-correction, per concept.
- FR2: Weight future explanations toward the historically successful style for that user.
- FR3: Allow explicit override at any time ("just show me the math" / "explain it in plain English").

### 4.6 Session Management & Continuity
**Functional requirements:**
- FR1: Sessions autosave after every turn.
- FR2: History view, filterable by concept or leak tag.
- FR3: Resume restores full conversational and mastery context.

### 4.7 Onboarding & Diagnostic
**Functional requirements:**
- FR1: 5–6 question diagnostic covering pot odds and basic hand-selection sense, to seed the mastery map before the first real hand review.
- FR2: Skippable — cold start still works with an empty map.

### 4.8 Progress Dashboard
**Functional requirements:**
- FR1: Concept-by-concept mastery visualization.
- FR2: "Top recurring leak" callout, driven by the vector-clustering in 4.4.
- FR3: Session/hand count and streak indicator.

---

## 5. UX & Interaction Design

### 5.1 Information Architecture
```
Login / Onboarding
 └── Diagnostic (optional, first-run only)

Home / Dashboard
 ├── "Your top leak right now" (driven by vector clustering)
 ├── Leak/mastery map visualization
 ├── "Submit a hand" (paste export or type a recap)
 └── "Drill a concept" (direct practice, no hand needed)

Session View (two entry modes, same underlying engine)
 ├── Hand Autopsy mode: reconstructed hand timeline + Socratic walk-through
 ├── Drill mode: direct concept practice (e.g., rapid-fire pot-odds questions)
 ├── Hint-level indicator
 └── Session summary (leak tags, mastery deltas)

Session History
 └── Past hands/sessions, filterable by leak tag
```

### 5.2 Key Flows

**Submitting a hand:**
Paste hand history or type a recap → agent reconstructs and reads it back for confirmation → a simple visual poker table renders the hand (positions, stack/pot sizes, board cards as they come) as the walk-through proceeds street by street → at each decision point, Socratic question first, math-engine answer second → session summary shows leak tags and mastery deltas, with an explicit callout if this matches a past pattern.

**Drilling a concept directly:**
From Dashboard, tap a weak concept chip → rapid-fire practice spots (engine-generated pot-odds scenarios, or reference-range preflop spots) → same Socratic hint-escalation pattern, just without a "reconstructed hand" step.

**Reviewing progress:**
Dashboard's mastery map is the primary visual. Tapping a concept shows every past hand/drill that touched it, plus the vector-clustered "this keeps happening" view for recurring leaks — making the "it remembers your patterns" claim visibly true, not just a marketing line.

### 5.3 Interaction Patterns for Socratic Questioning
- **Question before verdict**, always, at every decision point — the deterministic math is the *reveal*, not the opener.
- **The visual table is the anchor.** Because poker has an inherently visual structure (positions, stacks, board), the UI should render the hand state as it's discussed, not just describe it in text — this is both good UX and a direct lever on the Best Multimodal UX prize category.
- **Hints are opt-in and escalating**, same pattern as a general Socratic tutor.
- **Wrong reads are data, not failure** — the next question references the specific misread, not a generic "not quite."
- **Resolution requires the user to restate the correct thought process**, not just see the right number.

---

## 6. Technical Considerations

### 6.1 High-Level Architecture
```
┌───────────────────┐      ┌─────────────────────────────┐      ┌───────────────────────┐
│    Frontend         │      │      Agent Backend             │      │     Google Cloud         │
│   (React SPA)       │◄────►│    (Cloud Run service)         │◄────►│     Vertex AI             │
│  - Dashboard         │      │  ┌───────────────────────┐    │      │  - Gemini 3.5 (dialogue,│
│  - Session/Table UI  │      │  │  Coach Agent (ADK)      │    │      │    hand parsing)        │
│  - History view      │      │  │  Socratic dialogue,     │    │      │  - text-embedding model │
└───────────────────┘      │  │  hint-level state        │    │      └───────────────────────┘
                             │  └───────────────────────┘    │
                             │  ┌───────────────────────┐    │      ┌───────────────────────┐
                             │  │  Analyst Agent (ADK)    │    │◄────►│      Firestore            │
                             │  │  Hand parsing → leak     │    │      │  - Mastery/leak map       │
                             │  │  tagging → mutation       │    │      │  - Structured hands       │
                             │  └───────────────────────┘    │      │  - Vector embeddings      │
                             │  ┌───────────────────────┐    │      │    (native vector search) │
                             │  │  Poker Math Engine       │    │      └───────────────────────┘
                             │  │  (deterministic code:    │    │
                             │  │  pot odds, equity,       │    │
                             │  │  range reference data)   │    │
                             │  └───────────────────────┘    │
                             └─────────────────────────────┘
```

- **Frontend:** React SPA — Dashboard, Session/Table view (visual poker table component), History.
- **Coach Agent (ADK):** owns the Socratic dialogue and hint-escalation state machine; calls Gemini 3.5 via Vertex AI for generation, but never for the underlying math.
- **Analyst Agent (ADK):** a separate, narrowly-scoped agent whose only job is turning messy input (hand history text) into a structured `Hand` record and tagging leaks by calling the Poker Math Engine — this is the "actively synthesize/mutate data" mechanism. Splitting this from the Coach Agent keeps each agent's tool access narrow and its failure modes isolated (a parsing failure in the Analyst Agent can't corrupt the dialogue state in the Coach Agent).
- **Poker Math Engine:** plain deterministic code (not an LLM call) — a 7-card hand evaluator, a Monte Carlo/enumeration equity calculator, and static versioned reference range data.
- **Firestore:** stores structured hands, mastery/leak map, and vector embeddings for leak/concept similarity search, using Firestore's native vector search (`findNearest`, cosine distance) rather than standing up a separate vector database.
- **Auth:** Firebase Auth.

### 6.2 Integrations
- **MVP:** none required beyond the Google stack above. Explicitly **no** integration with real-money poker platforms or wagering mechanics.
- **Post-MVP candidates:** import from popular hand-tracking tools' export formats, session-note export to a personal wiki/Notion.

### 6.3 Conceptual Data Model
```
User
 ├── id, created_at
 └── MasteryMap (subcollection, keyed by concept_id)
      ├── concept_name
      ├── mastery_level: weak | developing | strong
      ├── last_updated
      ├── successful_style: math_first | intuition_first
      └── history: [hand_id/session_id, ...]

Hand
 ├── id, user_id, raw_text, parsed_at
 ├── structured: { positions, stacks, actions_by_street, board, result }
 ├── decision_points: [ { street, pot_before, call_amount, computed_required_equity,
 │                        computed_equity, action_taken, leak_tag | null } ]
 ├── leak_tags: [ concept_id, ... ]
 └── embedding: vector   ← for similarity clustering against past leaks

Session
 ├── id, user_id, hand_id (nullable, for drill-only sessions), started_at, ended_at
 └── turns: [ {role, content, hint_level, timestamp} ]

ConceptKB
 ├── concept_id, short_explanation, embedding   ← retrieved via similarity search
 │    to ground explanations instead of stuffing full history into every prompt

RangeChart (static reference data)
 └── position → reference opening-range data (versioned, not LLM-generated)
```

- Embeddings on `Hand.embedding` power the "this is the same leak pattern as before" feature (4.4/FR3).
- `ConceptKB` + vector retrieval keeps the agent's context window small and targeted — retrieve the 1–2 most relevant concept explanations rather than replaying full session history every turn, directly addressing the rubric's "how efficiently does the system manage massive context windows" question.

### 6.4 Security, Privacy & Data Protection
- Opponent usernames/identifying details in pasted hand histories are stripped before storage — that's third-party data the user doesn't have standing to retain verbatim.
- All data scoped to the authenticated user via Firestore security rules; no cross-user reads.
- No real-money account credentials are ever requested or stored.
- User-deletable hand/session history (right-to-delete), even though it reduces the system's memory.

---

## 7. Content & AI Behavior

### 7.1 Tone & Style Guidelines
- Supportive, peer-like study-buddy tone — like reviewing a session with a sharp friend, not a lecturing coach.
- Direct about mistakes without being harsh: name the leak specifically, don't editorialize about the player.

### 7.2 Core Socratic Method Rules (hard constraints)
1. **Question before verdict** at every decision point — no exceptions, even if the user asks for the answer immediately (redirect once, then use standard hint-escalation if they insist).
2. **The math layer is the single source of truth.** The LLM never states a pot-odds or equity number from its own generation — it always relays the deterministic engine's output. This is enforced in code (the agent's answer-reveal step reads from the engine's return value, not from free model text).
3. **Full answers are a last resort**, following the same 4-level escalation as a general Socratic tutor.
4. **Every resolution ends in a self-explanation check** — mastery map updates are driven by the user's restated reasoning, not just whether their in-hand action happened to be correct.
5. **Misconception-specific correction, never generic** — reference the specific gap between the user's stated read and what the board/math actually supports.

### 7.3 Handling Mistakes & Misconceptions
- Wrong reads are tagged against a fixed leak taxonomy (not free text), so patterns are comparable across hands: `bad_river_call`, `overwide_preflop_open`, `missed_value_bet`, `chasing_below_odds`, `misread_position`, etc.
- A recurring identical leak tag is surfaced explicitly ("this is the third hand where you've called below the odds you needed — want to drill that specifically?").

### 7.4 Guardrails: Accuracy, Scope, and Responsible Framing
- **No hallucinated math, ever.** Any numeric claim about pot odds, equity, or "correct" frequency must trace back to the deterministic engine or the versioned static range data — never to free LLM generation. This is the product's core integrity guarantee and is enforced architecturally (Section 6.1), not just by prompting.
- **Honesty about precision.** Reference preflop ranges are clearly labeled as standard approximations for coaching purposes, not solver-perfect GTO output — the product should never overstate its own precision.
- **No real-money facilitation.** The product does not connect to real-money platforms, does not simulate wagering, and does not make guarantees about winnings — poker involves genuine variance, and the tone should reflect that honestly rather than promising outcomes.
- **Scope discipline.** The agent stays within poker strategy/math coaching and redirects gracefully on unrelated requests.

---

## 8. Roadmap & Phases

### MVP (hackathon scope)
**Must-have:**
- Deterministic poker math engine (pot odds + equity), unit-tested (4.1)
- Hand Autopsy: ingestion of a pasted hand-history export *and* free-form recap, structured parsing, leak tagging (4.2)
- Socratic questioning engine with hint escalation (4.3)
- Mastery/leak map, persisted in Firestore, with vector-based leak clustering (4.4)
- Single game context: No-Limit Hold'em cash games, 6-max or heads-up simplification
- Visual poker-table UI rendering the hand as it's discussed (5.2/5.3)
- Deployed on Cloud Run, using Gemini 3.5 via Vertex AI + Google ADK, Firestore native vector search

**Should-have:**
- Adaptive teaching style (4.5)
- Diagnostic onboarding (4.7)

**Nice-to-have:**
- Mastery decay over time
- Drill-only mode fully fleshed out beyond a basic version

### Phase 2 (post-hackathon v1)
- Deeper postflop coverage (multi-street bet-sizing theory, board texture categorization)
- Tournament/ICM-aware concepts as a separate track
- Import directly from common hand-tracking-software export formats
- Range-vs-range visual comparison tool

### Phase 3 (growth)
- Live-session quick-reference companion (still no wagering integration)
- Community leak leaderboard (aggregate, anonymized)
- Coach/mentor marketplace layered on top of the leak data

### Prioritization Summary
| Feature | Priority |
|---|---|
| Deterministic math engine + unit tests | Must-have |
| Hand Autopsy (ingestion + leak tagging) | Must-have |
| Socratic questioning engine | Must-have |
| Mastery/leak map with vector clustering | Must-have |
| Visual poker-table UI | Must-have |
| Adaptive teaching style | Should-have |
| Diagnostic onboarding | Should-have |
| Mastery decay | Nice-to-have |
| Postflop/ICM depth, tracking-software import | Post-MVP |

---

## 9. Risks & Assumptions

### Product Risks
- **Risk:** Users perceive reference preflop ranges as "the" GTO answer when they're approximations. **Mitigation:** explicit, visible labeling every time a reference range is shown (7.4).
- **Risk:** Scope creep toward "build a full solver" — this is not achievable at hackathon scope and dilutes the actual differentiator. **Mitigation:** keep the math engine's ambition capped at pot odds + Monte Carlo equity + static reference ranges; explicitly defer true solver-grade postflop trees to Phase 2+.
- **Risk:** Hand-history parsing fails often enough to frustrate users. **Mitigation:** confirm-back step before proceeding (4.2/FR3), graceful clarifying questions on low-confidence parses.

### Technical Risks
- **Risk:** Equity Monte Carlo simulation is too slow for a snappy demo. **Mitigation:** cap simulation iterations for common spots, precompute/cache equity for frequently-seen preflop matchups.
- **Risk:** Vector similarity clustering surfaces false-positive "recurring leak" matches. **Mitigation:** require a minimum similarity threshold plus same-leak-tag agreement before surfacing a "this keeps happening" callout, so it's not embedding-similarity alone driving the claim.

### Dependencies & Assumptions
- Assumes Gemini 3.5 (or newer) via Vertex AI and Firestore native vector search are available within the hackathon's credit/time budget.
- Assumes users are adults learning poker strategy for recreational/skill-building purposes; the product is explicitly not a gambling facilitation tool.
- Assumes a narrow MVP scope (NLHE cash, pot odds + preflop ranges as the two flagship concepts) is enough to tell a complete, demoable story without needing full postflop solver depth.

---

## 10. Implementation Notes

### Practical Build Order
1. **Build and unit-test the Poker Math Engine first**, entirely independent of any agent code — pot odds formula, a 7-card hand evaluator, Monte Carlo equity, and static reference range data. Verify against known values before anything else touches it.
2. **Build the Hand Autopsy parser** against a handful of real (anonymized) sample hand histories and a few free-form recaps — get the structured `Hand` schema solid before wiring in Socratic dialogue.
3. **Wire the Analyst Agent** (ADK) to call the math engine against parsed hands and produce leak tags — test this end-to-end with fake/stubbed dialogue before adding real conversation.
4. **Wire the Coach Agent** (ADK + Gemini 3.5) for the actual Socratic back-and-forth, reading numeric answers only from the math engine's output, never generating them.
5. **Add Firestore vector embeddings** for hands and concept-KB entries once the core loop works — this is the single highest-leverage addition for the "Architectural Discipline" score, so give it real time rather than bolting it on last.
6. **Build the visual poker-table UI** early — it's your best Multimodal UX lever and the most demoable artifact in the product.
7. **Record the demo** only once you can reliably show: paste a messy hand → agent reconstructs and questions you → reveals correct math → leak gets tagged → a *second*, different-looking hand triggers a "this is the same leak as before" callout via vector similarity. That callback is the entire pitch in one clip.

### Recommended Tools/Frameworks
- **Agent orchestration:** Google ADK, two narrowly-scoped agents (Coach, Analyst)
- **Hand evaluation:** a standard open-source 7-card poker hand evaluator library
- **Frontend:** React + Tailwind, plus a lightweight SVG/canvas poker-table component
- **Hosting:** Cloud Run
- **Data:** Firestore (documents + native vector search) + Firebase Auth
- **Embeddings:** Vertex AI text-embedding model
- **Diagramming:** keep the submission diagram to the boxes in Section 6.1 — clarity over density

---

*End of PRD.*
