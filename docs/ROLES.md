# Roles & timeline

**Degrees** · four lanes, running concurrently

They stay concurrent because they meet at [API contracts](./API-CONTRACTS.md), not at files. Lock those contracts at H0; build against stubs; fill them in after.

---

## Sahith — Data & Matching

The graph, the vectors, and the logic that decides who meets whom.

- Schema and migrations ([DATA-MODEL.md](./DATA-MODEL.md)); RLS policies
- **Seed data first** — 12 profiles, a graph with real 2nd-degree paths, 2 completed groups with feedback. Exists by H2 so everyone else builds against real data.
- pgvector setup; embedding storage and refresh
- **Degree traversal** — recursive CTE over `connections`, depth-capped by `max_degrees`
- **Matching pipeline stages 1–2** (traverse + narrow), and the `formGroups` prompt in stage 3
- **Deliverable:** `POST /api/match/run` returns a real group with degrees and reasoning

Writes matching logic as a module inside Christian's server. Coordinate on the module boundary at H0.

## Christian — Server & Infra

The server everything else depends on, and the deploy pipeline that makes it reachable.

- Provision Vultr; nginx; TLS; `degrees.tech` DNS
- API server skeleton, routing, error handling
- **JWT verification on every request** — derive `userId` from the token, never the body
- Supabase service-role client; the anon-read / service-write split
- `@google/genai` wrapper; **all four AI calls live here**
- `generateActivity` (Maps grounding) and `analyzeFeedback`
- Netlify site; env and secret management
- **Deliverable:** a **public URL with a working health check by H4** — not H25
- **Boundary:** Christian owns the server framework, auth, deploy, and the Gemini client. Sahith owns schema and the matching module inside it.

## Charles — Onboarding & Profile

Everything from signup to a complete profile, plus the feedback loop.

- H0–H2: React + Vite scaffold, routing, shared component kit — the "build once" burst everyone consumes
- Supabase auth screens (username + password)
- **Interests page** — tag selection, bio, optional AI paragraph
- **Preferences page** — cost, distance, frequency, **group size range**, **degrees of separation**
- **Post-event feedback** — rating scale, per-person "meet again?", optional free text
- **Deliverable:** a user can sign up, complete a profile, and submit feedback that visibly changes their next match

## Pranav — Groups, Activities & Chat

Everything after a match exists.

- **First task: does Maps grounding alone cover venues, or do we need a separate Places integration?** Answer by H4 — it may delete a whole workstream.
- **QR / room-code event join** and the edge-creation UX (`POST /api/connections`)
- Group view — members, **the degrees path** ("you and Maya both know Chris"), Gemini's reasoning
- Activity display — venue, price, map, source link
- **Chat** — message list, composer, Supabase Realtime subscription
- Ticketmaster integration (secondary priority, after Maps)
- **Deliverable:** demo beats 1–3 — join, see your group, see the plan, talk to them

## Shared — after the freeze

Pitch, polish, rehearsal, and the backup video are **all four**, not a role.

---

## Timeline

| Hours | Sahith | Christian | Charles | Pranav |
|---|---|---|---|---|
| **H0–H2** | Schema + migrations; **seed graph** | Provision Vultr; billing ON; server skeleton | React scaffold + component kit | Maps grounding spike |
| **H2–H6** | pgvector; embed seeded profiles | **Public URL + health check (H4)**; JWT verify | Auth + interests page | QR join + `POST /api/connections` |
| **H6–H12** | Degree traversal; narrowing query | `embedProfile`; Gemini wrapper | Preferences page | Group view off seed data |
| **H12–H18** | `formGroups` prompt; **matching returns real groups (H14 GATE)** | `generateActivity` + Maps grounding | Feedback flow | Activity display |
| **H18–H24** | Tune ranking on real signals | `analyzeFeedback`; harden endpoints | Wire feedback → re-embed | Chat; Ticketmaster if time |
| **H24–H26** | Freeze data; verify seeds | Final deploy; verify prod | Styling pass | Styling pass |
| **H26–H36** | **All four:** backup video, rehearse 10×, sleep | | | |

---

## Checkpoints

Nobody skips these.

- **H4 — the server is real.** Public URL, health check, JWT verification working. If the server isn't reachable at H4, that is the whole project's critical path slipping, not a Christian problem.
- **H6 — contracts smoke test.** Every stub returns real shapes end-to-end.
- **H14 — the matching gate.** `POST /api/match/run` returns a real group with a real degrees path off seeded data. If it doesn't, **cut Gemini group formation and ship top-N by vector similarity** — still demoable, and you have 22 hours left instead of discovering it at H30.
- **H20 — live-data gate.** Fewer than ~10 real accounts with real edges → demo on seed data, drop the live-recruitment beat.
- **H26 — hard freeze.** No exceptions. Teams lose to live-demo failure far more often than to missing features.

---

## Risks

| Risk | Owner | Mitigation |
|---|---|---|
| Graph too sparse for 2nd-degree matches | Sahith | Seed a graph with real 2nd-degree paths at H2 |
| Gemini group formation unreliable | Sahith | Documented fallback: top-N by similarity ([contracts](./API-CONTRACTS.md)) |
| Server not reachable in time | Christian | H4 checkpoint exists precisely for this |
| Onboarding is 3+ form screens of dead air on stage | Charles | Demo uses the QR skip path; profile completed later |
| Group formation is harder than pair matching | Sahith | Size range is a **soft** constraint — best effort, not exact |
| "Is this social media?" (Meta brief) | All | The graph view is the answer; build it if ahead at H24 |
