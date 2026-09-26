# Architecture

**Degrees** · HackGT 13 · Sep 25, 2026

The single most important rule: **the application server owns every AI call and all writes.** Not the client. Not Supabase Edge Functions.

---

## 1. Topology

```
┌─────────────────┐
│  iOS app        │  Expo / React Native · TestFlight
│  (thin client)  │
└────────┬────────┘
         │
         ├──────────────► Supabase Auth ──► issues JWT
         │
         ├──────────────► Supabase Postgres        READS ONLY
         │                (anon key + RLS)          profiles, groups, messages
         │
         └──────────────► API server               ALL WRITES + ALL AI
                          Vultr VPS · api.degrees.tech
                               │
                               ├──► Supabase Postgres (service role key)
                               ├──► Gemini API (@google/genai)
                               ├──► Google Maps grounding
                               └──► Ticketmaster Discovery (secondary)
```

**Thin client, server-heavy.** The client is a React Native app built with Expo (changed Sep 25 from a React web SPA — see [STACK.md](./STACK.md)). State lives on the server so it syncs across devices. Avoid optimistic local state — read through TanStack Query and let the server be the source of truth.

---

## 2. Why not Edge Functions

Supabase Edge Functions are serverless. Matching needs to hold a candidate pool in memory, traverse the graph, call Gemini, and post-process — work that wants a warm long-lived process, not a cold isolate with an execution ceiling. A plain VPS is also easier to debug at 3am than a deployed isolate.

**Decision: a long-running API server on Vultr.** Edge Functions are not used anywhere in this project.

---

## 3. Security model

| Key | Lives | Can do |
|---|---|---|
| Supabase **anon (publishable) key** | App bundle (public — anyone can extract it) | Reads only, constrained by Row Level Security |
| Supabase **service role key** | **Server env only** | Full read/write. Never ships to the client, never enters git. |
| **Gemini API key** | **Server env only** | All model calls. Never reaches the app. |

**Request flow:** Supabase Auth issues a JWT on login. The client sends it as `Authorization: Bearer <jwt>` on every API call. **The server verifies the token on every request** and derives the user id from it — never from the request body.

RLS is on for every table the client reads. A user reads their own profile and preferences; other people's bios are readable only when a shared group row exists.

---

## 4. AI call inventory

All server-side, all through `@google/genai`.

| Call | Model | Purpose |
|---|---|---|
| `embedProfile` | `gemini-embedding-001` @ 768 dims | Embed interest tags + AI paragraph + accumulated feedback into a profile vector |
| `formGroups` | Gemini Flash | Assemble a group from narrowed candidates, honoring size range; returns members + reasoning |
| `generateActivity` | Gemini Flash + **Maps grounding** | One concrete, real-venue plan fitting combined constraints |
| `analyzeFeedback` | Gemini Flash | Extract sentiment and interest signals from optional free-text feedback |

768 dimensions is not arbitrary: `gemini-embedding-001` defaults to 3072, which exceeds pgvector's index dimension cap. Pass `outputDimensionality: 768`; MRL truncation costs effectively no quality.

⚠️ The SDK is **`@google/genai`**. `@google/generative-ai` reached end-of-life Nov 30, 2025 and still installs cleanly — an easy trap.

---

## 5. Matching pipeline

Server-side, four stages:

1. **Traverse** — recursive CTE over `connections` from the user, depth-limited by their `max_degrees`. Yields the candidate pool with each candidate's degree.
2. **Narrow** — pgvector cosine similarity against the user's profile embedding, filtered on overlapping cost range, travel distance, and prior meet-again signals.
3. **Form** — Gemini receives the narrowed candidates with their constraints and assembles a group, honoring every member's size range as a **soft** constraint.
4. **Plan** — Gemini + Maps grounding proposes the activity.

Stage 1 and 2 are deterministic SQL; stage 3 and 4 are model calls. **If Gemini fails in stage 3, fall back to top-N by similarity** so matching never hard-fails during the demo.

---

## 6. Rate limits and cost

Gemini free tier is ~5–15 req/min and 1,000–1,500/day — **not enough** for a live demo plus real testers. **Enable billing before H2.** Flash is pennies at our volume, and the paid tier also stops your data being used for product improvement.

Ticketmaster Discovery free tier: 5,000 calls/day, 5 req/sec. Cache responses per city; do not call it per page load.

---

## 7. Deployment

| Piece | Where | Notes |
|---|---|---|
| iOS app | Expo | Dev: Expo Go on a phone. Testers + demo: EAS Build → TestFlight. `ios/` is generated, never committed. |
| API server | Vultr VPS | Node + TypeScript behind nginx, TLS via Let's Encrypt |
| Database | Supabase | Managed Postgres + pgvector + Auth |
| Domain | `api.degrees.tech` | Free .tech for a year. A bare server IP works in dev only — iOS release builds require HTTPS (App Transport Security). |
| Email | Resend free tier | Transactional only. **Verification off for the demo** so venue signups aren't blocked. |

**A public URL must exist by H4**, serving a health check from the real server. Not H25.
