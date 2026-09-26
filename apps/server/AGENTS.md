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
src/lib/log.ts           wave 2: JSON log lines (`log.*`), `timed()` around slow work, requestLogger (one line per request, x-request-id)
src/lib/profileStatus.ts wave 2: the one definition of "onboarding done" (GET /me + the /match/run gate)
src/lib/graph.ts         exploreFrom(): BFS over connections → each person's degree + path (the `via` field)   (Pranav)
src/lib/groups.ts        loadGroup() as the viewer sees it, membership checks (404 for non-members), activity I/O (Pranav)
src/external/            places.ts (Places API New) + ticketmaster.ts (Discovery, cached per area)             (Pranav)
src/routes/auth.ts       POST /api/auth/signup — the only public route, mounted before requireAuth in app.ts
src/routes/*.ts          one Hono sub-app per contract area: me, profile, preferences, connections + graph,
                         events (join + host — wave 2: creates the backing meetup group, expiring codes),
                         hangouts (wave 2: GET /hangouts, groups + meetups for Home), match, groups (view,
                         respond, complete, leave, icebreakers, activity, photos, exchange-request/accept),
                         messages, feedback, notifications (mock only).
                         connections, events, groups, and messages are Pranav's.
src/ai/                  Gemini wrapper + the AI calls (wave 2 adds generateIcebreakers) + the global rate limiter — see src/ai/AGENTS.md
src/matching/            Sahith's pipeline — see src/matching/AGENTS.md
src/mocks/fixtures.ts    the coherent mock world every stub returns (Atlanta, HackGT, demo group)
netlify/functions/       api.ts (Hono router) + activity-background.ts (asynchronous activity generation)
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
- **Every `/groups/:id/*` route checks membership** with `memberRows()` from `lib/groups.ts` (404 for non-members, so group ids don't leak). Exchange also requires the peer to be in the group, and `complete` requires a *matched* group to be past `proposed` (409 otherwise). **Wave 2:** `complete` connects every pair only for a `kind = 'meetup'` group (and stamps `events.ended_at`); a matched group's edges come from per-person `POST /connections`. `leave` refuses (409) once a group is completed.
- **Chat and photo `POST`s close 24h after `completed_at`** (`assertNotArchived()`, 403 `hangout_archived`). `complete` stamps `completed_at` only once, so a second tap can't reopen the window.
- **Identity past 1st degree is redacted server-side** (`lib/groups.ts` `loadGroup`, `routes/match.ts`): no id, name, bio, or photo until an edge exists or the group is confirmed. Any new response that includes people must apply the same rule, including free text such as `reasoning`. Meetup members are the exception (same room, same rule as the event lobby): never redacted.
- **Log with `lib/log.ts`, not `console.*`.** `log.info('domain.event', { userId, groupId, … })` for state changes, `log.error('x.fail', error, fields)` for failures, `timed('ai.foo', fields, () => …)` around Gemini/Storage/matching calls. `LOG_LEVEL=debug` shows start lines and 4xx codes. Every line carries the request id that the response's `x-request-id` header exposes.
- Add new routes by exporting a sub-app from `src/routes/` and mounting it in `app.ts`. **Public routes** mount on `app` *before* the `api` sub-app with `requireAuth`: a matched handler that returns ends the chain. Keep public routes to signup only. Contract changes go through [packages/shared](../../packages/shared/AGENTS.md) first.

## Deployed

Production is **`https://degrees-api.netlify.app`** (Netlify Functions, real mode; `netlify.toml` routes `/api/*` and `/health` to the function). A merge to `main` doesn't deploy by itself — redeploy after merging server changes (PR #14 + migration `0006` went live together on Sep 26). Every request must finish inside Netlify's ~10s limit; match and activity measured ~2.8s on Sep 26.

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
- **No notification writes.** The `notifications` table and the client read exist; no route inserts rows at invite, message, feedback-due, exchange, or connection time.
- **Photos** (wave 2): upload, bucket, policies, and signed URLs are built; the shared project still needs migration `0007` applied before they work live.
