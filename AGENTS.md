# Degrees — agent context

Entry point for any AI agent or new teammate working in this repo. Read this first, then the doc your task touches.

---

## What this is

**Degrees** — "a dating app for friend groups," built for HackGT 13 (Meta challenge: a social app with AI integrated throughout).

People are **nodes**; an **edge** forms when two people meet in person. The app builds real-world hangout groups out of that graph, and the differentiator is **degrees of separation** — you control how far from yourself the app may reach (people you've met / mutuals / wider network).

The AI's job is getting people offline, not keeping them scrolling.

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

---

## Rules that are easy to get wrong

1. **The server owns every AI call.** No Gemini in the browser. No Gemini in Supabase Edge Functions — Edge Functions are not used in this project at all.
2. **The server owns every write.** The client reads from Supabase with the anon key under RLS; all writes go through the API server with the service role key.
3. **`userId` comes from the verified JWT**, never from a request body.
4. **The SDK is `@google/genai`.** `@google/generative-ai` is end-of-life (Nov 30, 2025) and still installs cleanly — check `package.json`.
5. **Embeddings are 768 dimensions.** `gemini-embedding-001` defaults to 3072, which exceeds pgvector's index cap. Pass `outputDimensionality: 768`.
6. **`connections` stores each edge once**, with `user_a < user_b`. Sort the pair before inserting or the degree math breaks.
7. **Group size is a soft constraint.** Best effort, not a hard filter.
8. **Money is integer cents.** Never floats.
9. **No auth shortcuts.** Supabase username + password, no SSO. (An earlier draft proposed skipping auth entirely — that was reversed.)
10. **Secrets never enter git.** `.env.example` only; real keys live in server env and Netlify secrets.

---

## Conventions

- TypeScript everywhere. Timestamps ISO 8601 UTC.
- Contracts in [API-CONTRACTS.md](./docs/API-CONTRACTS.md) are frozen — if you need a shape change, say so explicitly rather than changing it locally; three other people build against it.
- Errors: `{ error: { code, message } }` with a real HTTP status.
- `POST /api/connections` and event joins are idempotent — people scan twice.

---

## Status

Pre-build as of Sep 25, 2026. Docs are written; the codebase skeleton is the next step — see [HANDOFF-SKELETON.md](./HANDOFF-SKELETON.md) for that brief.

**Open questions** are listed at the end of [PRD.md](./PRD.md) — Resend usage, the graph view, and the frequency scheduler.
