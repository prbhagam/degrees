# apps/server/src/matching — agent context

The logic that decides who meets whom. **Owner:** Sahith. It lives inside Christian's server as a module, and routes call into it.

## Pipeline

[ARCHITECTURE.md §5](../../../../docs/ARCHITECTURE.md#5-matching-pipeline) describes four stages:

| Stage | File | Kind | Status |
|---|---|---|---|
| 1. Traverse | `traverse.ts` | SQL: recursive CTE over `connections` from the requester, depth ≤ `max_degrees` (cap 3) | Stub — **PROPOSED signature** |
| 2. Narrow | `narrow.ts` | SQL: pgvector cosine similarity vs. the requester's embedding, filtered on cost overlap, travel distance, meet-again signals | Stub — **PROPOSED signature** |
| 3. Form | `formGroups.ts` | Gemini Flash assembles the group + human-readable reasoning | Stub — signature frozen in API-CONTRACTS |
| 4. Plan | `../ai/generateActivity.ts` | Gemini + Maps grounding | Christian's |

`routes/match.ts` returns `matchFixture` directly today. It switches to calling traverse → narrow → formGroups **once Sahith and Christian agree the boundary at H0**. Until then, the `traverse`/`narrow` signatures are proposals, not contracts.

## Rules

- **Group size is a soft constraint.** Aim for every member's `groupSizeMin`–`groupSizeMax`, and never drop a good group over it.
- **Matching never hard-fails.** If Gemini errors, times out, or returns ids that aren't in the candidate list, fall back to **top-N by similarity** from stage 2. The H14 gate depends on it.
- **Degrees:** the requester is degree 0 in responses (a contract gap, to confirm). Direct connections are 1 and mutuals are 2. `reasoning` should name the path ("you and Maya both know Chris"), because that's the demo beat.
- `connections` stores each edge once with `user_a < user_b`. The traversal must walk **both** directions (`user_a = x OR user_b = x`). There's an index on `user_b` for this.
- Stages 1–2 read with the **service-role client** (`../db/supabase.ts`), and so bypass RLS. Never return another user's `bio` unless they're in the formed group.
- These files import nothing from `../mocks/fixtures.ts`, which keeps the lanes decoupled. Each stub carries its own local mock data.
- Keep matching-internal types (`Candidate`, `NarrowedCandidate`) here. Put a type in `@degrees/shared` only if the app needs it.
