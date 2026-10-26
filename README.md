# Degrees

**A dating app for friend groups.** Built at HackGT 13 for the Meta challenge: a social app with AI throughout.

People are nodes. Two people form an edge when they meet in person. Degrees builds real hangout groups from that graph, and you choose how far from yourself it can reach: only people you've met (1st degree), their friends (2nd), or the wider network (3rd+). The AI's job is to get people offline, not to keep them scrolling.

## How it works

1. **Onboard.** Pick interests, budget, travel distance, preferred group size, and how many degrees out you're open to.
2. **Meet people.** Host or join a meetup with a room code or QR scan. When it ends, everyone who was there becomes connected.
3. **Get matched.** The server walks your graph up to your degree limit, narrows candidates by embedding similarity and your constraints, and Gemini forms a group and explains why it fits. Nobody past your 1st degree is ever named to you.
4. **Make a plan.** Gemini, grounded in Google Maps, proposes a real venue that fits everyone's budget and distance. The group votes on a time, chats, and shares photos.
5. **Give feedback.** Saying who you'd meet again re-embeds your profile and improves your next match.

## Stack

| Layer | What |
|---|---|
| App | iOS via React Native + Expo (Expo Router, NativeWind, Reanimated, TanStack Query) |
| API | Node + Hono, deployed as a Netlify Function |
| Data | Supabase Postgres + pgvector, Auth, Storage, Realtime |
| AI | Gemini via `@google/genai`: profile embeddings (768-dim), group formation, grounded activity planning, feedback analysis |

The server owns every AI call and every write. The app reads from Supabase with the anon key under row-level security and sends all writes through the API with a verified JWT.

## Repo layout

```
apps/mobile/       Expo iOS app
apps/server/       Hono API server (matching pipeline in src/matching/, AI calls in src/ai/)
packages/shared/   API contract as TypeScript types + Zod schemas
supabase/          migrations, seed, maintenance scripts, SQL tests
docs/              architecture, data model, API contracts, stack, roles, demo script
scripts/dev.mjs    one-command dev launcher
```

## Getting started

Requires Node 24 (see `.nvmrc`; at least 22.12) and Expo Go or the iOS simulator.

```bash
npm install
npm run dev
```

This starts the API on `:8787` and the Expo dev server. Scan the QR code with Expo Go or press `i` for the simulator.

You don't need a `.env` to start. Without keys, the server runs in **mock mode**: it accepts any bearer token and serves fixtures. To run against real services, copy `.env.example` to `.env` (server: Supabase service role, Gemini, Maps) and `apps/mobile/.env.example` to `apps/mobile/.env` (Supabase URL and publishable key only).

### Other commands

```bash
npm run typecheck    # every package, plus the Supabase seed
npm run doctor       # expo-doctor: SDK compatibility and duplicate native deps
npm run export:ios   # bundle the app for iOS, a compile check that needs no Xcode
npm run seed         # re-embed every seeded profile with Gemini (needs the root .env)
supabase/tests/run-local.sh   # apply migrations to a throwaway local Postgres and run the SQL tests
```

## Deployment

The API is deployed to Netlify (`netlify.toml`) at `https://degrees-api.netlify.app`. Nothing deploys automatically, so server changes need a Netlify redeploy after merge. Schema changes ship as numbered migrations in `supabase/migrations/` and are applied to the shared Supabase project by hand.

## Docs

- [PRD.md](./PRD.md): the product spec
- [AGENTS.md](./AGENTS.md): the contributor and agent guide, with ground rules and current status. **Read this before opening a PR.**
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): topology, security model, and the matching pipeline
- [docs/DATA-MODEL.md](./docs/DATA-MODEL.md): Postgres schema and graph design
- [docs/API-CONTRACTS.md](./docs/API-CONTRACTS.md): every endpoint
- [docs/STACK.md](./docs/STACK.md): libraries and gotchas
- [docs/DEMO-SCRIPT.md](./docs/DEMO-SCRIPT.md): the demo walkthrough

## Team

Charles and Pranav (mobile), Christian (server and infra), Sahith (data and matching).
