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

- Deploy to Netlify; TLS; `degrees.tech` DNS
- API server skeleton, routing, error handling
- **JWT verification on every request** — derive `userId` from the token, never the body
- Supabase service-role client; the anon-read / service-write split
- `@google/genai` wrapper; **all four AI calls live here**
- `generateActivity` (Maps grounding) and `analyzeFeedback`
- **Notifications** *(Added Sep 26)* — server writes at each trigger point (invite, message, feedback due, exchange request/accept, new connection); client reads its own rows directly from Supabase + Realtime, same pattern as chat. `GET /api/notifications` exists only for mock mode.
- **Contact exchange** *(Added Sep 26)* — server-mediated only, `contact_exchanges` has zero client grants; a phone number is computed and returned only once both sides have accepted
- Expo/EAS project and TestFlight builds; env and secret management
- **Deliverable:** a **public URL with a working health check by H4** — not H25
- **Boundary:** Christian owns the server framework, auth, deploy, and the Gemini client. Sahith owns schema and the matching module inside it.

## Charles — Onboarding & Profile

Everything from signup to a complete profile, plus the feedback loop.

- H0–H2: shared component kit on the Expo scaffold (`apps/mobile`, already routed) — the "build once" burst everyone consumes
- Supabase auth screens (username + password)
- **Interests page** — tag selection (common tags + type-your-own), bio, optional AI paragraph
- **About page** *(Added Sep 26)* — bio, AI-paragraph-to-tags, optional "avoids" list
- **Preferences page** — cost, distance, frequency, **group size range**, **degrees of separation**
- **Edit profile page** *(Added Sep 26)* — the settings-side counterpart to onboarding
- **Post-event feedback** — rating scale, **per-person relationship signal** (widened Sep 26 from a "meet again?" boolean to great/fine/not-for-me), optional free text, **mutual-consent contact exchange** *(Added Sep 26)*
- **Deliverable:** a user can sign up, complete a profile, and submit feedback that visibly changes their next match

## Pranav — Groups, Activities & Chat

Everything after a match exists.

- **First task: does Maps grounding alone cover venues, or do we need a separate Places integration?** Answer by H4 — it may delete a whole workstream.
- **QR / room-code event join** and the edge-creation UX (`POST /api/connections`) — **CHANGED Sep 26:** a QR-formed connection must carry which event it happened at; the app won't show a scannable code without one
- Group view — members, Gemini's reasoning. **CHANGED Sep 26:** no longer shows a degrees path to anyone you haven't met — members past 1st degree are redacted server-side (see [DATA-MODEL.md](./DATA-MODEL.md)); also gained an Invited state with accept/decline, and "mark hangout done" (starts the 24h chat/photo archive clock, forms edges with everyone in the group)
- Activity display — venue, price, map, source link
- **Chat** — message list, composer, Supabase Realtime subscription. **CHANGED Sep 26:** read-only 24h after the hangout's marked done
- **Photos** *(Added Sep 26)* — per-group album, same 24h window as chat
- **Host a hangout** *(Added Sep 26)* — create an event (`POST /api/events`), reuses the existing join-room screen as the host's lobby
- **Your Circle** *(Added Sep 26)* — see §"Resolved" below; this was the PRD's "graph view, build if ahead" stretch goal, now assigned and built
- Ticketmaster integration (secondary priority, after Maps)
- **Deliverable:** demo beats 1–3 — join, see your group, see the plan, talk to them

## Shared — after the freeze

Pitch, polish, rehearsal, and the backup video are **all four**, not a role.

---

## Timeline

| Hours | Sahith | Christian | Charles | Pranav |
|---|---|---|---|---|
| **H0–H2** | Schema + migrations; **seed graph** | Setup Netlify deploy; API server skeleton | Component kit on the Expo scaffold | Maps grounding spike |
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
- **H14 — the matching gate.** `POST /api/match/run` returns a real group with real degree numbers off seeded data (not, since Sep 26, a displayed path to anyone past 1st degree — see the redaction note above). If it doesn't, **cut Gemini group formation and ship top-N by vector similarity** — still demoable, and you have 22 hours left instead of discovering it at H30.
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
| "Is this social media?" (Meta brief) | Pranav | **Resolved Sep 26:** Your Circle is built (see PRD §9) and structurally enforces 1st-degree-only visibility, not just a UI choice |
