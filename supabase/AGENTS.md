# supabase — agent context

Schema, row-level security, and seed data for Supabase Postgres + pgvector. **Owner:** Sahith. The source of truth for the schema is [docs/DATA-MODEL.md](../docs/DATA-MODEL.md). The migration implements it, and its header lists every addition beyond the doc.

```
migrations/0001_init.sql                 full schema, indexes, RLS, grants, Realtime publication
migrations/0002_seed_georgia_tech_demo.sql  canonical demo seed (12 GT students, graph, 2 completed groups, HACKGT)
migrations/0003_matching_functions.sql   matching RPCs (match_traverse, match_narrow, match_create_group), service-role only
migrations/0004_meet_again_boost.sql     match_narrow's meet-again boost 0.1 → 0.25 per "yes" (feedback must outweigh re-embed drift)
migrations/0005_profile_location_privacy.sql  column grants: signed-in clients can't read profiles.lat/lng
migrations/0006_contact_events_photos_notifications.sql  Sep 26 product update (Charles, PR #14): profile phone/pronouns/photo_url,
                                         'avoid' tags, wider frequency enum, groups.completed_at, host event fields,
                                         event_feedback.sentiment, feedback_peers.would_meet_again → relationship
                                         (+ match_narrow redefined), contact_exchanges, event_photos, notifications
seed/seed.ts                             replaces 0002's placeholder vectors with real Gemini embeddings (`npm run seed`)
tests/run-local.sh + matching.sql + privacy.sql   0001 + 0003–0006 on a throwaway local Postgres with assertions
tsconfig.json                            lets `npm run typecheck` cover seed.ts
```

**No Edge Functions.** There is no `supabase/functions/` folder, and there won't be one. All server logic lives in `apps/server`.

## Security model (what the migration encodes)

- **RLS is on for every table.** Only `authenticated` gets `SELECT`, and only on the tables the app reads directly: profiles, profile_tags, preferences, groups, group_members, activities, messages. Nothing grants insert, update, or delete, so **every write goes through the API server's service-role key**.
- Policies: you can read your own profile, tags, and preferences. Group rows, members, activities, and messages are readable only for groups you're in, via `public.is_group_member(gid)`. That helper is `security definer` with an empty `search_path` and fully qualified names; keep it that way. Another user's profile row is readable only if you share a group.
- RLS works per row, so a shared group exposes a groupmate's profile row. `bio` being visible then is intended (you're matched). `lat`/`lng` are not: 0005 revokes table-level `SELECT` on `profiles` and grants every column except `lat`/`lng` to `authenticated`. Client code must name columns — `select('*')` on `profiles` fails for signed-in users. The server reads location with the service role.
- `messages` and `notifications` are in the `supabase_realtime` publication (chat and the notification feed).
- 0006 tables: `notifications` is readable only by its owner; `event_photos` only by group members; **`contact_exchanges` has zero client grants** — the server computes whether both sides accepted and only then returns a phone number.
- **New `profiles` columns are not client-readable.** 0005 replaced table-level `SELECT` with a column list, so `phone`, `pronouns`, and `photo_url` (0006) aren't in it. Keep it that way for `phone`; the app gets `photoUrl` and `pronouns` through the API. Grant a column only if the app must read it directly, and never `phone`.

## Schema invariants

- `connections` stores each edge once, with `check (user_a < user_b)`. Sort the pair before inserting.
- `profile_embeddings.embedding` is `vector(768)` with an HNSW cosine index. Don't change the dimension; 3072 can't be indexed.
- `preferences.max_degrees` is checked to 1–3. Enum-like text columns have check constraints that match the Zod enums in `packages/shared`.
- No `on delete cascade` anywhere, because data retention hasn't been decided. Add cascades deliberately, in a new migration.

## Changing the schema

Add a **new** numbered migration (next is `0007_…sql`). Never edit `0001` once it has been applied to the shared project. If a column change affects an API shape, update `packages/shared` and `docs/API-CONTRACTS.md` in the same PR.

To test locally without the Supabase CLI, apply the migration to a throwaway Postgres with a small shim: an `auth` schema, `auth.users`, `auth.uid()`, the `anon` and `authenticated` roles, and a `supabase_realtime` publication. pgvector isn't installed via Homebrew by default, so stub the vector column or install the extension.

## Seeding the shared project

1. Applied on the shared project: `0002`–`0005` (Sep 26). **`0006` is NOT applied yet** (checked Sep 26). Apply it in the SQL editor **in the same window as deploying PR #14's server**: the new server writes 0006's columns, and 0006 drops `feedback_peers.would_meet_again`, which the old server writes. Verified locally: the widened check constraints replace the old ones cleanly and every 0006 table's grants hold.
   Then create the **Storage bucket for group photos** (dashboard → Storage), which no migration can do; see `docs/DATA-MODEL.md`.
2. `npm run seed` — re-embeds every profile with Gemini (`gemini-embedding-001`, 768 dims, `SEMANTIC_SIMILARITY`).
   Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` in the root `.env`. Safe to rerun.

Demo logins are `<username>@degrees.demo` / `DegreesDemo26!`. The app's signup should build emails the same way, but as of Sep 26 it takes a typed email, and **nothing creates a `profiles` row for a new auth user** (no trigger, and `PUT /api/profile` only updates). A `0007` trigger on `auth.users` that inserts the profile row is the planned fix; see [docs/ROLES.md](../docs/ROLES.md#next-steps-sep-26).

## Seed requirements (from DATA-MODEL.md)

- ~12 profiles with real-looking interests, **embedded**.
- A connection graph with genuine **2nd-degree paths**, since first-degree alone doesn't demonstrate degrees.
- 2 completed groups with feedback already submitted, for the "matching improved because of feedback" beat.
- One event with a room code the demo can join live. The app's dev mocks use `HACKGT`.
