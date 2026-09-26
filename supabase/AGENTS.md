# supabase — agent context

Schema, row-level security, and seed data for Supabase Postgres + pgvector. **Owner:** Sahith. The source of truth for the schema is [docs/DATA-MODEL.md](../docs/DATA-MODEL.md). The migration implements it, and its header lists every addition beyond the doc.

```
migrations/0001_init.sql                 full schema, indexes, RLS, grants, Realtime publication
migrations/0002_seed_georgia_tech_demo.sql  canonical demo seed (12 GT students, graph, 2 completed groups, HACKGT)
migrations/0003_matching_functions.sql   matching RPCs (match_traverse, match_narrow, match_create_group), service-role only
seed/seed.ts                             replaces 0002's placeholder vectors with real Gemini embeddings (`npm run seed`)
tests/run-local.sh + matching.sql        0001 + 0003 on a throwaway local Postgres with assertions
tsconfig.json                            lets `npm run typecheck` cover seed.ts
```

**No Edge Functions.** There is no `supabase/functions/` folder, and there won't be one. All server logic lives in `apps/server`.

## Security model (what the migration encodes)

- **RLS is on for every table.** Only `authenticated` gets `SELECT`, and only on the tables the app reads directly: profiles, profile_tags, preferences, groups, group_members, activities, messages. Nothing grants insert, update, or delete, so **every write goes through the API server's service-role key**.
- Policies: you can read your own profile, tags, and preferences. Group rows, members, activities, and messages are readable only for groups you're in, via `public.is_group_member(gid)`. That helper is `security definer` with an empty `search_path` and fully qualified names; keep it that way. Another user's profile row is readable only if you share a group.
- **Known gap:** RLS works per row, so it can't hide just `bio`. A shared group exposes the whole profile row. If `bio` must stay hidden until matched, use a view or column grants.
- `messages` is in the `supabase_realtime` publication for the chat subscription.

## Schema invariants

- `connections` stores each edge once, with `check (user_a < user_b)`. Sort the pair before inserting.
- `profile_embeddings.embedding` is `vector(768)` with an HNSW cosine index. Don't change the dimension; 3072 can't be indexed.
- `preferences.max_degrees` is checked to 1–3. Enum-like text columns have check constraints that match the Zod enums in `packages/shared`.
- No `on delete cascade` anywhere, because data retention hasn't been decided. Add cascades deliberately, in a new migration.

## Changing the schema

Add a **new** numbered migration (`0002_…sql`). Never edit `0001` once it has been applied to the shared project. If a column change affects an API shape, update `packages/shared` and `docs/API-CONTRACTS.md` in the same PR.

To test locally without the Supabase CLI, apply the migration to a throwaway Postgres with a small shim: an `auth` schema, `auth.users`, `auth.uid()`, the `anon` and `authenticated` roles, and a `supabase_realtime` publication. pgvector isn't installed via Homebrew by default, so stub the vector column or install the extension.

## Seeding the shared project

1. Apply `0002` (already done on the shared project), then `0003`.
2. `npm run seed` — re-embeds every profile with Gemini (`gemini-embedding-001`, 768 dims, `SEMANTIC_SIMILARITY`).
   Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` in the root `.env`. Safe to rerun.

Demo logins are `<username>@degrees.demo` / `DegreesDemo26!`. The app's signup must build emails the same way.

## Seed requirements (from DATA-MODEL.md)

- ~12 profiles with real-looking interests, **embedded**.
- A connection graph with genuine **2nd-degree paths**, since first-degree alone doesn't demonstrate degrees.
- 2 completed groups with feedback already submitted, for the "matching improved because of feedback" beat.
- One event with a room code the demo can join live. The app's dev mocks use `HACKGT`.
