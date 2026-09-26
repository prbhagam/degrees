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
- **Your Circle** *(Added Sep 26)* — see PRD.md §9 "Resolved"; this was the PRD's "graph view, build if ahead" stretch goal, now assigned and built
- Ticketmaster integration (secondary priority, after Maps)
- **Deliverable:** demo beats 1–3 — join, see your group, see the plan, talk to them

## Shared — after the freeze

Pitch, polish, rehearsal, and the backup video are **all four**, not a role.

---

## Next steps (Sep 26)

Written after PR #14 merged, from a full test pass. Local suite green: typecheck, expo-doctor 21/21, iOS export, SQL suites, server unit tests. Mock-mode sweep of the new contract: 21/21. Production smoke (PR #13 server): 24/25.

### Checkpoint status

| Gate | Status |
|---|---|
| H4 server is real | **Met.** `https://degrees-api.netlify.app`: `/health` 200, fake token → 401 |
| H6 contracts smoke | **Met** for the deployed server; PR #14's contract passes in mock mode, not yet live |
| H14 matching gate | **Met.** Real groups off seed data; every seeded user gets a friend-of-a-friend |
| H20 live-data gate | **At risk.** A real new signup can't use the app (no `profiles` row); fix in Wave 1 before recruiting |
| H26 hard freeze | Pending |

### Decisions for the team (make these first)

1. **Username or email login?** The PRD and rule 9 say username + password, the seeded demo logins are `<username>@degrees.demo`, and the Sep 26 signup screen asks for an email. **Recommendation: username.** Signup and login take a username and build `<username>@degrees.demo`. It's faster to type on stage and matches the seed.
2. **Does one member's accept confirm the group for everyone?** Right now yes, and confirming reveals every member to every other member. Recommendation: keep it for the demo and write it down. Per-member accepts are more work than the time left.
3. **Photos and notifications: build or cut from the demo?** Recommendation: build a few notifications (they make the demo feel alive), and cut photo upload unless Pranav finishes Wave 1 early.

### Wave 0 — make PR #14 live (together, one sitting)

| Who | Task |
|---|---|
| Sahith | Apply `0006` in the Supabase SQL editor (verified locally Sep 26), then rerun the production smoke test against the new contract |
| Christian | Deploy `main` (PR #14) to Netlify **right after** `0006` is applied — the old server breaks under 0006, the new one breaks without it |
| Christian | **Turn on Gemini billing.** Free-tier 429s/503s hit every AI call during testing |

### Wave 1 — demo blockers (before H20)

| Who | Task | Why |
|---|---|---|
| Sahith | `0007`: trigger on `auth.users` that inserts the `profiles` row (id, username from the email's local part, display name), plus a backfill for existing auth users | Without it, `/me`, matching, and everything else fail for real new accounts |
| Sahith | `formGroups`: never name degree-2+ members or their path in `reasoning` (hide their names from the prompt, reject replies that contain one, deterministic text says "plus N from your wider network") | Reasoning currently shows names the redaction hides |
| Charles | Signup + login take a **username** and build `<username>@degrees.demo` (per decision 1) | Matches the seed and the 0007 trigger |
| Pranav | ~~`ScanScreen`: pass `eventId`/`eventName` through to `connect/[peerId]`~~ **Done** (falls back to the scanner's own event) | In-app person scans always fail with "missing event" (demo beat 1) |
| Pranav | ~~Add `memberRows()` checks to `respond`, `complete`, `exchange-request/accept`, and `photos`~~ **Done** (was Christian's; these routes live in Pranav's `routes/groups.ts`) | Any signed-in user with a group id can confirm or complete it, which forms edges between strangers |

### Wave 2 — finish what the demo shows

| Who | Task |
|---|---|
| Christian | Write notifications at the trigger points the demo hits: `hangout_invited` (match/run, per member), `feedback_prompt` (complete), `exchange_requested` / `exchange_accepted`, `connection_added`. Give the notifications screen a Realtime subscription and mark-as-read |
| Pranav | ~~Photos `POST` returns `{ photos }` as the contract says; add its request schema to `packages/shared`; enforce the 24h lock server-side for photos and chat `POST`~~ **Done**; `complete` also sets `status: completed` now |
| Christian | TestFlight build with `EXPO_PUBLIC_API_URL=https://degrees-api.netlify.app` (`api.degrees.tech` DNS is optional) |
| Charles | Feedback: let the peer see and accept an incoming exchange request, remove the "(demo: they said yes)" link, and send or drop the group-tag chips |
| Charles | About: send accepted generated tags as `hobby`/`activity`, not `derived` (the server drops `derived`). Making "Generate tags" real needs a small server endpoint (Christian): good for the "AI throughout" brief if there's time |
| Charles | Preferences: prefill saved values |
| Pranav | Photos: `expo-image-picker` + Supabase Storage upload + real thumbnails — or hide the entry point (decision 3). Sahith creates the bucket and policy if built |
| Sahith | Update and commit the production smoke test (`scripts/`) so anyone can rerun the whole demo chain before rehearsals |

### Wave 3 — freeze and rehearse (H24–H26 and after)

| Who | Task |
|---|---|
| Sahith | Demo-reset script: restore seed state after each rehearsal (feedback, groups, derived tags, embeddings, test connections); delete the leftover `proposed` group from the Sep 26 match run; make the H20 call (live data vs seed) |
| Christian | Final deploy + prod verification at the freeze |
| All | H26 freeze, then backup video and 10 rehearsals of the demo arc |

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
