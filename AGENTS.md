# Degrees — agent context

Entry point for any AI agent or new teammate working in this repo. Read this first, then the doc your task touches.

---

## What this is

**Degrees** — "a dating app for friend groups," built for HackGT 13 (Meta challenge: a social app with AI integrated throughout).

People are **nodes**; an **edge** forms when two people meet in person. The app builds real-world hangout groups out of that graph, and the differentiator is **degrees of separation** — you control how far from yourself the app may reach (people you've met / mutuals / wider network).

The AI's job is getting people offline, not keeping them scrolling.

**It's an iOS app** built with React Native + Expo (no Swift), backed by a Node API server and Supabase. It was originally specced as a web SPA; that changed on Sep 25. Any doc that still says web is stale.

---

## Context files

| File | What's in it |
|---|---|
| [PRD.md](./PRD.md) | Product spec — the loop, onboarding, matching, feedback, demo arc |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Topology, security model, AI call inventory, matching pipeline, deployment |
| [docs/DATA-MODEL.md](./docs/DATA-MODEL.md) | Full Postgres schema, graph design, seed requirements |
| [docs/API-CONTRACTS.md](./docs/API-CONTRACTS.md) | Every endpoint and internal AI service signature |
| [docs/STACK.md](./docs/STACK.md) | Every library, what's decided vs proposed, gotchas |
| [docs/ROLES.md](./docs/ROLES.md) | Who owns what, hour-by-hour timeline, checkpoints, risks |

Folder-level `AGENTS.md` files hold the specifics for each area. The more specific file wins:

| Folder | Owner | Read it for |
|---|---|---|
| [apps/mobile/](./apps/mobile/AGENTS.md) | Charles + Pranav | Expo app — routing pattern, feature lanes, styling, env, running on iOS |
| [apps/server/](./apps/server/AGENTS.md) | Christian | Hono API — auth, mock mode, adding routes, error shape |
| [apps/server/src/ai/](./apps/server/src/ai/AGENTS.md) | Christian | Gemini wrapper and the four AI calls |
| [apps/server/src/matching/](./apps/server/src/matching/AGENTS.md) | Sahith | The matching pipeline and its fallback |
| [packages/shared/](./packages/shared/AGENTS.md) | all four | The contract as types + Zod — how to change it safely |
| [supabase/](./supabase/AGENTS.md) | Sahith | Migrations, RLS, seed |

---

## Repo map

```
apps/mobile/        Expo (React Native) iOS app — Charles + Pranav
apps/server/        Node + Hono API server — Christian (matching/ is Sahith's)
packages/shared/    API contract as TypeScript types + Zod schemas — all four
supabase/           migrations + seed — Sahith
docs/               the context files above
scripts/dev.mjs     one-command dev launcher
```

## Commands

```bash
npm install
npm run dev          # API server on :8787 + Expo dev server (scan the QR code with Expo Go, or press i for the iOS simulator)
npm run typecheck    # every package
npm run doctor       # expo-doctor: SDK compatibility + duplicate native deps
npm run export:ios   # bundle the app for iOS — the no-Xcode compile check
npm run seed         # re-embed every seeded profile with Gemini (needs the root .env)
```

No `.env` is needed to start. The server runs in **mock mode**, accepting any bearer token and serving fixtures, until real keys are set. Each file's first line names its owner, so check it before editing outside your lane.

---

## Rules that are easy to get wrong

1. **The server owns every AI call.** No Gemini in the app. No Gemini in Supabase Edge Functions — Edge Functions are not used in this project at all.
2. **The server owns every write.** The client reads from Supabase with the anon key under RLS; all writes go through the API server with the service role key.
3. **`userId` comes from the verified JWT**, never from a request body.
4. **The SDK is `@google/genai`.** `@google/generative-ai` is end-of-life (Nov 30, 2025) and still installs cleanly — check `package.json`.
5. **Embeddings are 768 dimensions.** `gemini-embedding-001` defaults to 3072, which exceeds pgvector's index cap. Pass `outputDimensionality: 768`.
6. **`connections` stores each edge once**, with `user_a < user_b`. Sort the pair before inserting or the degree math breaks.
7. **Group size is a soft constraint.** Best effort, not a hard filter.
8. **Money is integer cents.** Never floats.
9. **No auth shortcuts.** Supabase username + password, no SSO. (An earlier draft proposed skipping auth entirely — that was reversed.) Auth runs on email + password under the hood: a username maps to `<username>@degrees.demo` (`authEmailFor()` in `@degrees/shared`), which is how the seeded demo logins work. Signup goes through `POST /api/auth/signup`, which creates the confirmed auth user and the `profiles` row. Never call `supabase.auth.signUp` from the app: the project requires email confirmation, which `@degrees.demo` addresses can't complete.
10. **Secrets never enter git.** `.env.example` only; real keys live in server env only. `EXPO_PUBLIC_*` values ship inside the app bundle, so only the Supabase publishable (anon) key may go there.

---

## Conventions

- TypeScript everywhere. Timestamps ISO 8601 UTC.
- Contracts in [API-CONTRACTS.md](./docs/API-CONTRACTS.md) are frozen — if you need a shape change, say so explicitly rather than changing it locally; three other people build against it.
- Errors: `{ error: { code, message } }` with a real HTTP status.
- `POST /api/connections` and event joins are idempotent — people scan twice.

---

## Status

**Sep 26 (after PRs #12–#18): features built and live.** Every screen is real — no placeholders remain — and every route has a real-mode implementation. Matching runs traverse → narrow → Gemini `formGroups` with a deterministic fallback; feedback saves, re-embeds, and boosts the next match. PR #14 added the validated design: bottom tabs, Your Circle (1st-degree graph), hosted events, invite accept/decline, mark-hangout-done (forms edges, starts a 24h chat/photo window), a 3-way feedback signal, contact exchange, photos, notifications, and **server-side redaction of anyone past 1st degree**.

**Live (checked Sep 26):** production (`https://degrees-api.netlify.app`) runs PR #14's server, and the shared Supabase project has migrations 0001–0006. Server changes need a Netlify redeploy after merge; nothing deploys by itself.

**Known gaps** (owners and order: [docs/ROLES.md](./docs/ROLES.md#next-steps-sep-26)):
- `formGroups` reasoning names people the redaction hides.
- No route writes notifications; photos don't upload to Storage; the About screen's "Generate tags" is canned.

**Auth (Sep 26):** username signup and login work end to end: signup → onboarding → app. The app is gated: signed-out visits go to login and return to the link they opened (e.g. a scanned event QR) afterwards.

**Open questions** are at the end of [PRD.md](./PRD.md): Resend usage and the frequency scheduler. The graph view is resolved (Your Circle). [HANDOFF-SKELETON.md](./HANDOFF-SKELETON.md) is the original web-era brief, kept for history.
