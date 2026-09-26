# apps/server — agent context

The Degrees API server: **Node + TypeScript + Hono**, deployed to Netlify (never Supabase Edge Functions). Read the root [AGENTS.md](../../AGENTS.md) first. This file covers what's specific to the server.

**Owner:** Christian (framework, auth, routes, AI, deploy). **Exception:** `src/matching/` is Sahith's. See [its AGENTS.md](./src/matching/AGENTS.md).

---

## Layout

```
src/app.ts               Hono app: /health, mounts every route under /api behind requireAuth, 404 + error handlers
src/index.ts             local entry: serve(app) on $PORT (Netlify uses netlify/functions/api instead)
src/config/env.ts        Zod-validated env; loads the repo-root .env; decides mock vs real mode
src/middleware/auth.ts   requireAuth: Bearer token → context.var.userId
src/db/supabase.ts       getServiceClient(): service-role client. The ONLY write path to the database.
src/lib/errors.ts        ApiError + validateJson(): every error becomes { error: { code, message } }
src/lib/graph.ts         exploreFrom(): BFS over connections → each person's degree + path (the `via` field)   (Pranav)
src/lib/groups.ts        loadGroup() as the viewer sees it, membership checks (404 for non-members), activity I/O (Pranav)
src/external/            places.ts (Places API New) + ticketmaster.ts (Discovery, cached per area)             (Pranav)
src/routes/*.ts          one Hono sub-app per contract area: me, profile, preferences, connections + graph,
                         events (join + host), match, groups (view, respond, complete, activity, photos,
                         exchange-request/accept), messages, feedback, notifications (mock only).
                         connections, events, groups, and messages are Pranav's.
src/ai/                  Gemini wrapper + the four AI calls — see src/ai/AGENTS.md
src/matching/            Sahith's pipeline — see src/matching/AGENTS.md
src/mocks/fixtures.ts    the coherent mock world every stub returns (Atlanta, HackGT, demo group)
```

## Mock mode vs real mode

- **Mock mode** is the default whenever `NODE_ENV` isn't `production`. Any bearer token is accepted, `userId` is `REQUESTER_ID` from the fixtures, and nothing touches Supabase or Gemini. It's why `npm run dev` works with no `.env`.
- **Real mode** (`MOCK_MODE=false`, or production) requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`, and exits at boot listing any that are missing. It verifies every token with `supabase.auth.getUser(token)`.
- `MOCK_MODE=true` with `NODE_ENV=production` is refused at boot.

When a route goes real, replace its fixture return with the real query but keep the response `satisfies <SharedType>`.

## Rules for routes

- **`userId` comes only from `context.get('userId')`**, never from the body, params, or query. No shared schema has a `userId` field. Keep it that way.
- Validate every JSON body with `validateJson(context, <sharedSchema>)`. It returns 400 `invalid_request` in the contract's error shape, including for malformed JSON.
- Throw `new ApiError(status, code, message)` for expected failures, such as 404 `group_not_found`. Anything else becomes a 500, and production responses don't include the message.
- Type every response with the `@degrees/shared` type (`satisfies MatchRunResponse`, etc.) so a wrong shape fails `npm run typecheck`.
- **Idempotency:** `POST /api/connections` and `POST /api/events/:roomCode/join` must be safe to repeat. Sort the connection pair so `user_a < user_b` before inserting, and upsert rather than insert.
- Money is integer cents. Timestamps are ISO 8601 UTC strings (`new Date().toISOString()`).
- **Every `/groups/:id/*` route checks membership** with `memberRows()` from `lib/groups.ts` (404 for non-members, so group ids don't leak). Exchange also requires the peer to be in the group, and `complete` requires the group to be past `proposed` (409 otherwise), because it connects every pair of members.
- **Chat and photo `POST`s close 24h after `completed_at`** (`assertNotArchived()`, 403 `hangout_archived`). `complete` stamps `completed_at` only once, so a second tap can't reopen the window.
- **Identity past 1st degree is redacted server-side** (`lib/groups.ts` `loadGroup`, `routes/match.ts`): no id, name, bio, or photo until an edge exists or the group is confirmed. Any new response that includes people must apply the same rule, including free text such as `reasoning`.
- Add new routes by exporting a sub-app from `src/routes/` and mounting it in `app.ts`. Contract changes go through [packages/shared](../../packages/shared/AGENTS.md) first.

## Deployed

Production is **`https://degrees-api.netlify.app`** (Netlify Functions, real mode; `netlify.toml` routes `/api/*` and `/health` to the function). A merge to `main` doesn't deploy by itself — as of Sep 26 prod still runs the PR #13 server. Deploy PR #14 only together with migration `0006` (see [supabase/AGENTS.md](../../supabase/AGENTS.md)). Every request must finish inside Netlify's ~10s limit; match and activity measured ~2.8s on Sep 26.

## Running it

```bash
npm run dev:server     # from the repo root: tsx watch on :8787 (or $PORT)
curl localhost:8787/health
curl localhost:8787/api/me -H "Authorization: Bearer dev"
```

`tsx` is a **runtime** dependency on purpose. `npm start` runs the TypeScript source directly, and `@degrees/shared` is consumed as TS source, so there's no build step. Imports inside the server use `.js` suffixes (Node ESM style). `tsx` maps them to `.ts`.

Physical phones reach the dev server over your LAN IP. The server listens on all interfaces, so allow Node through the macOS firewall if the app can't connect.

## Known gaps (Sep 26)

Tracked with owners in [docs/ROLES.md](../../docs/ROLES.md#next-steps-sep-26):
- **New users get no `profiles` row.** `PUT /api/profile` only updates, and nothing inserts on signup, so `GET /api/me` 404s for a real new account.
- **No notification writes.** The `notifications` table and the client read exist; no route inserts rows at invite, message, feedback-due, exchange, or connection time.
- **Photos** store a path but nothing uploads an image yet (no bucket, no picker); see ROLES decision 3.
