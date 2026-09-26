# Handoff — build the Degrees codebase skeleton

*Paste this into a fresh chat, or point the session at this file. Repo: `~/Projects/hackgt-26`.*

---

## Your task

Scaffold the **Degrees** codebase so four developers can start in parallel at hour zero without colliding. **Skeleton only — no feature logic.**

The success test is narrow and specific: four people clone this, each opens a different folder, and none of them has to create a file someone else is also creating.

## Read first

The repo already has complete context docs. Read these before writing anything:

- `AGENTS.md` — entry point, and the ten rules that are easy to get wrong
- `docs/API-CONTRACTS.md` — **every endpoint you stub must match these shapes exactly**
- `docs/DATA-MODEL.md` — the schema your migration creates
- `docs/ARCHITECTURE.md` — why the server owns all AI and all writes
- `docs/STACK.md` — what's decided vs. merely proposed
- `docs/ROLES.md` — who owns which folder

Don't redesign anything in those docs. If something seems wrong, say so — don't silently deviate.

## What "done" means

```bash
npm install
npm run dev          # web on :5173, server on :8787
curl localhost:8787/health          # → 200 {"ok":true}
curl localhost:8787/api/me -H "Authorization: Bearer fake"   # → correctly shaped mock
npm run typecheck    # passes clean
```

Plus: every route in `API-CONTRACTS.md` returns **realistic mock data of the right shape**, and every feature folder has a placeholder page wired into the router.

The mock data matters more than it sounds. It's what lets Charles and Pranav build real screens before Sahith's matching or Christian's AI calls exist.

## Structure

```
hackgt-26/
├── package.json                    # npm workspaces, root scripts
├── .env.example                    # every var, no real values
├── apps/
│   ├── web/                        # React 19 + Vite + TS + Tailwind
│   │   ├── src/
│   │   │   ├── main.tsx  App.tsx  router.tsx
│   │   │   ├── lib/
│   │   │   │   ├── supabase.ts     # anon-key client (READS ONLY)
│   │   │   │   ├── api.ts          # fetch wrapper, attaches JWT
│   │   │   │   └── query.ts        # TanStack Query client
│   │   │   ├── components/ui/      # shadcn drops here
│   │   │   ├── stores/session.ts   # Zustand: current user, active group
│   │   │   └── features/
│   │   │       ├── auth/           ← Charles
│   │   │       ├── onboarding/     ← Charles   (interests, preferences)
│   │   │       ├── profile/        ← Charles
│   │   │       ├── feedback/       ← Charles
│   │   │       ├── events/         ← Pranav    (QR / room-code join)
│   │   │       ├── groups/         ← Pranav
│   │   │       ├── activity/       ← Pranav
│   │   │       └── chat/           ← Pranav
│   └── server/                     # Node + TS
│       ├── src/
│       │   ├── index.ts            # http server, route mounting
│       │   ├── config/env.ts       # validated env, fails loudly if missing
│       │   ├── middleware/auth.ts  ← Christian  (JWT verify)
│       │   ├── db/supabase.ts      # service-role client (WRITES)
│       │   ├── routes/             ← Christian
│       │   │   ├── me.ts  profile.ts  preferences.ts  connections.ts
│       │   │   ├── events.ts  match.ts  groups.ts  messages.ts  feedback.ts
│       │   ├── ai/                 ← Christian
│       │   │   ├── client.ts       # @google/genai wrapper
│       │   │   ├── embedProfile.ts  generateActivity.ts  analyzeFeedback.ts
│       │   └── matching/           ← Sahith
│       │       ├── traverse.ts     # recursive CTE, degree-capped
│       │       ├── narrow.ts       # pgvector similarity + filters
│       │       └── formGroups.ts   # Gemini call + top-N fallback
├── packages/shared/src/
│   ├── types.ts                    # every type from API-CONTRACTS.md
│   └── schemas.ts                  # matching Zod schemas
└── supabase/
    ├── migrations/0001_init.sql    ← Sahith  (full schema from DATA-MODEL.md)
    └── seed/seed.ts                ← Sahith  (stub + TODO, don't populate)
```

**`packages/shared` is the contract made real.** Both apps import from it. Changing a type there is a four-person conversation, not a local edit — say so in a comment at the top of the file.

## Rules

Straight from `AGENTS.md` — the skeleton must not violate them:

1. **`@google/genai`**, never `@google/generative-ai` (EOL Nov 30 2025, still installs cleanly — check `package.json` twice).
2. **No Supabase Edge Functions anywhere.** Not used in this project.
3. **Server owns all AI calls and all writes.** Web talks to Supabase for reads only.
4. `userId` comes from the **verified JWT**, never a request body.
5. Embeddings are **768 dims** (`outputDimensionality: 768`) — 3072 exceeds pgvector's index cap.
6. `connections` rows are stored once with `user_a < user_b`.
7. Money in **integer cents**. Timestamps **ISO 8601 UTC**.
8. **No secrets in git.** `.env.example` with empty values only.

## Explicit non-goals

Do **not** build:

- real matching logic (stub `formGroups`, return mock)
- real Gemini calls (wire the SDK, stub the functions)
- real prompts — those are owned by Sahith and Christian
- auth screens beyond a placeholder
- seed *data* — create the seed script shell with a TODO; Sahith fills it
- tests, CI, linting config, error monitoring (deliberately skipped, see `docs/STACK.md`)

Scaffolding that guesses at feature logic is worse than no scaffolding, because someone has to delete it.

## Notes

- **`npm run dev` must start both apps with one command.** Four tired people at 3am should not be running two terminals and remembering ports.
- Every stub route should return mock data a UI can actually render — real-looking names, interests, venues. Not `{}`.
- Add a one-line header comment to each stub naming its owner from `docs/ROLES.md`, so nobody edits someone else's lane by accident.
- Commit on a branch, don't push to main — the repo is `prbhagam/hackgt-26`, a teammate's.
- This is a multi-file build. Per my standing rule, consider running it through `/route`.

## When you're done

Report: the tree you created, the exact commands to run it, anything in the docs that turned out to be wrong or underspecified, and any decision you made that I should review.
