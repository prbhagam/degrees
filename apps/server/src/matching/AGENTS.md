# apps/server/src/matching — agent context

The logic that decides who meets whom. **Owner:** Sahith. It lives inside Christian's server as a module, and routes call into it.

## Pipeline

[ARCHITECTURE.md §5](../../../../docs/ARCHITECTURE.md#5-matching-pipeline) describes four stages:

| Stage | File | Kind | Status |
|---|---|---|---|
| 1. Traverse | `traverse.ts` | RPC `match_traverse` (migration 0003): recursive CTE over `connections`, both directions, depth ≤ `max_degrees` (cap 3), shortest degree + one deterministic path per person | Built |
| 2. Narrow | `narrow.ts` | RPC `match_narrow` (0003, boost weight from 0004): cosine similarity vs. the requester's embedding, soft cost/travel filters, meet-again boost, excludes any "wouldn't meet again" pair | Built |
| 3. Form | `formGroups.ts` | Gemini picks members + reasoning (Flash 4.5s → Lite 3s); output sanitized; deterministic fallback | Built |
| 4. Plan | `../ai/generateActivity.ts` | Gemini + Maps grounding | Christian's |

`routes/match.ts` runs traverse → narrow → formGroups in real mode and persists the group with RPC `match_create_group` (one transaction). Mock mode still returns `matchFixture`. Candidates carry `path` (user ids requester → candidate) so reasoning can name the connection.

Tests: `supabase/tests/run-local.sh` (SQL, throwaway local Postgres) and `npx tsx apps/server/src/matching/formGroups.test.ts` (no network).

## Rules

- **Group size is a soft constraint.** Aim for every member's `groupSizeMin`–`groupSizeMax`, and never drop a good group over it.
- **Every group shows a degrees path when one exists.** If the model's group has no degree-2+ member while one is available, the sanitizer swaps in the best-scoring one (appended under max, else replacing the model's last pick). If the reasoning never names anyone on a friend-of-a-friend's path, it's replaced with the deterministic reasoning, which always does. Measured Sep 26: Lite skipped friends-of-friends in 2 of 4 groups without this.
- **Model order is Flash, then Lite, inside 7.5s** so `match/run` fits Netlify's ~10s. On Sep 26 Flash timed out or returned 503/429 on nearly every call and Lite answered in ~1s, so in practice Lite forms most groups until Gemini billing is on.
- **Matching never hard-fails.** If Gemini errors, times out, or returns ids that aren't in the candidate list, fall back to **top-N by stage-2 score** (pool-relative similarity + a small meet-again boost), with deterministic reasoning. Model output is also sanitized: unknown/duplicate ids dropped, backfilled to the minimum size, capped at 8. The H14 gate depends on it.
- **Degrees:** the requester is degree 0 in responses (API-CONTRACTS: `0 = you`). Direct connections are 1 and mutuals are 2. `reasoning` should name the path ("you and Maya both know Chris"), because that's the demo beat.
- `connections` stores each edge once with `user_a < user_b`. The traversal must walk **both** directions (`user_a = x OR user_b = x`). There's an index on `user_b` for this.
- Stages 1–2 read with the **service-role client** (`../db/supabase.ts`), and so bypass RLS. Never return another user's `bio` unless they're in the formed group.
- These files import nothing from `../mocks/fixtures.ts`, which keeps the lanes decoupled.
- `score` in narrow = `similarity rescaled 0–1 within the pool + 0.25 × min(meet-again yeses, 2)`. Gemini similarities are anisotropic (every profile pair measured 0.85–0.94), so raw values are only meaningful relative to each other; the max boost (0.5) stays under 1, so it can't lift the least similar candidate past the most similar.
- **Feedback must raise the score of anyone you'd meet again.** Feedback re-embeds the author (derived tags), which moves pool-relative similarity by up to ~0.3; the old 0.1 boost lost to that drift (measured Sep 26: Leo → Ethan went 0.83 → 0.82 after a "yes"). At 0.25 the same case goes 0.83 → 0.97. Keep the weight above the drift if you retune it.
- Feedback reaches matching through `routes/feedback.ts`: one `event_feedback` row per (group, author), upserted, plus one `feedback_peers` row per rated groupmate. `match_narrow` reads both directions (you → them and them → you).
- Keep matching-internal types (`Candidate`, `NarrowedCandidate`) here. Put a type in `@degrees/shared` only if the app needs it.
