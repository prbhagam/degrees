# Tech Stack & Work Split

**HackGT 13 — Social Memory App** · Sep 25, 2026
Companion to [PRD.md](./PRD.md). The PRD says *what* we're building and in what order; this says *what it runs on* and *who builds which part*.

---

## 1. Stack — decided

### Core app

| Concern | Choice | Why this one |
|---|---|---|
| Language | **TypeScript** | Zod schemas are shared between Gemini structured outputs and form validation. Types pay for themselves when four people integrate at H6. |
| Build | **Vite** | Instant HMR, zero config, one-command deploy. |
| UI | **React 19** | Team default. |
| Routing | **React Router** | Boring and known. Not the place to experiment. |
| Styling | **Tailwind CSS v4** | Fastest path to a mobile-looking UI without writing a design system. |
| Components | **shadcn/ui** | Copy-in components, no runtime dependency, restyleable. Gets us a polished sheet/dialog/card for free. |
| Icons | **lucide-react** | Ships with shadcn. |
| Animation | **Motion** (`motion`) | One use: the nudge card entrance in demo beat 1. Polish where the judges are looking. |
| Server state | **TanStack Query** | Caching, loading and error states for free. Saves real time across four async screens. |
| Client state | **Zustand** | ~1KB. Current user, active group. Don't reach for Redux. |
| Validation | **Zod** | One schema definition drives both the Gemini `responseSchema` and the form. This is the highest-leverage library on the list. |
| Dates | **date-fns** | Tree-shakeable, needed for "met 6 weeks ago" copy. |

### Data

| Concern | Choice | Notes |
|---|---|---|
| Database | **Supabase Postgres** | |
| Vectors | **pgvector** | Same database — no second datastore. |
| Client | **`@supabase/supabase-js`** v2 | |
| Embeddings | **`gemini-embedding-001` @ 768 dims** | Default output is 3072, but pgvector's HNSW/IVFFlat indexes cap around 2000 dimensions — so pass `outputDimensionality: 768`. MRL truncation means 768 loses effectively no quality. At our scale (hundreds of tags) exact search without an index also works; 768 keeps the option open. |

### AI

| Concern | Choice | Notes |
|---|---|---|
| SDK | **`@google/genai`** | ⚠️ **Not** `@google/generative-ai` — that package hit end-of-life Nov 30, 2025. Easy trap; the old one still installs fine. |
| Generation | **Gemini Flash tier** | Cheap and fast enough for a live path. |
| Structured output | `responseSchema` + Zod | Zod schemas work out of the box. |
| Grounding | **Maps grounding tool** | Real venues, hours, ratings inside the generation call. |

### Server & hosting

| Concern | Choice | Notes |
|---|---|---|
| Server-side | **Supabase Edge Functions** (Deno + TS) | Keeps API keys off the client. |
| Frontend hosting | **Netlify** | Deploy on push. |
| Auth | **None** — `?u=3` URL param | 3+ hours cost, zero demo seconds. Future work, not built. |
| Secrets | Supabase + Netlify env vars | `.env.example` in git; **real keys never in git**. |

### External data

| Concern | Choice | Notes |
|---|---|---|
| Venues | **Gemini Maps grounding**, Google Places as fallback | Pranav confirms by H4 whether grounding alone suffices (§9). |
| Events | **Ticketmaster Discovery API** | 5,000 calls/day free, 5 req/sec, filter by city/postcode/radius/date. Returns *ticketed* events — concerts, sports, theatre. |

### Device features

| Concern | Choice | Notes |
|---|---|---|
| QR codes | **`qrcode.react`** to display; typed room code as primary join path | Camera-based scanning needs permissions and good lighting — too fragile to put on stage. Show the QR, but let anyone type the code. |
| Voice notes | **MediaRecorder API** → Gemini audio input | Gemini Flash accepts audio natively, so the voice note goes straight to `extractTags` with no separate speech-to-text service. This is what makes the low-friction reflection (PRD §6) actually cheap to build. |

### Deliberately skipped

No test suite, no CI, no error monitoring, no analytics, no auth. Prettier only, no ESLint config debate. Each of these is a real practice we're consciously trading away for hours on a 36-hour clock — say so plainly if a judge asks rather than pretending they were oversights.

## 2. Why Gemini over Grok

Both are sponsors. We evaluated both and chose Gemini for three reasons:

1. **Maps grounding.** Gemini exposes Google Maps as a tool inside a normal `generateContent` call — direct access to ~250M places with business info, ratings, hours, and geographic context, optionally scoped to a lat/long. Since we need real venues across multiple cities, this collapses most of a Places integration *into the model call*, on one key, in one SDK.
2. **Structured outputs.** JSON Schema is supported across all active Gemini models, and Zod schemas work out of the box in TypeScript. Tag extraction is our H10 gate — we want zero glue code between the model and a typed object.
3. **Cost and ecosystem.** Flash-Lite is effectively free at our volume, and Places / Maps / Gemini share one Google Cloud project.

**Grok's one real advantage** is X live search — campus orgs and venues post events on X, which is signal Gemini can't see. It's now metered at $5 per 1,000 posts fetched, and the noise level for local campus events is high.

> ### Backlog: Grok
> Parked, not rejected. Revisit **only** if we find that Ticketmaster + Maps grounding can't surface enough genuinely local, low-cost happenings. If we add it, scope is one panel ("what's happening on campus tonight") powered by X live search — roughly 2 hours, and it earns a second sponsor submission.

### Two cautions

- **Free-tier rate limits will bite.** ~5–15 requests/min and 1,000–1,500/day. That is not enough for a live demo with judges poking at it while 30 real testers use the app. **Turn on billing before H2** — Flash costs pennies and the limits disappear.
- **Free-tier data may be used to improve Google's products.** Paid tier is not. Another reason to enable billing.

---

## 3. Data flow

```
Reflection note (free text)
        │
        ▼
 [AI] tag extraction ──────► tags table ──► [AI] embed ──► tag_embeddings (pgvector)
                                                                    │
 Venues (Maps grounding) ─┐                                         │
 Events (Ticketmaster) ───┼──► opportunities table                  │
                          │              │                          │
                          │              ▼                          ▼
                          └────► match engine (vector similarity + recency)
                                         │
                                         ▼
                              [AI] nudge copy ──► nudges table ──► Nudge screen
```

---

## 4. Roles

Four concurrent lanes. Each owns a different layer, and they meet at **contracts, not files** — so nobody waits on anybody after H2.

### Sahith — Data & Matching Engine
Schema, seed data, pgvector, embeddings, and the query that decides who should reconnect.

- Design and migrate all tables (§5)
- **Seed the *ending* state first** — 5 users, 2 past hangouts, ~20 tags. This exists by H2 so everyone else has real data to build against.
- pgvector extension, embedding storage, index
- Similarity + recency ranking query
- **Deliverable:** `getMatches(userId)` → ranked candidates with shared-interest reasons

### Christian — AI Services & Infra
Every Gemini call, plus the deploy pipeline that makes it all reachable.

- Provision Supabase project, Netlify site, env vars and secrets
- Deploy pipeline — **a public URL that works must exist by H4**, not H25
- Three Gemini endpoints, written in the API console against fake data *before any UI exists*:
  `extractTags()` · `generateActivity()` (with Maps grounding) · `writeNudgeCopy()`
- Embedding calls for Sahith's pipeline
- **Deliverable:** three deployed endpoints with locked JSON contracts (§6)
- **Boundary:** Christian provisions the Supabase project and owns env/deploy; Sahith owns schema and migrations inside it.

### Charles — Memory & Nudge vertical *(the differentiator)*
Scaffolds the app, then owns the screens that carry the demo.

- H0–H2: React + Vite scaffold, routing, shared component kit, mock-data layer — the "build once" burst everyone else consumes
- Nudge card (demo beat 1) · Memory/profile view (beat 2) · Consent screen "Your Memory" · Reflection capture (beat 3, **one question + optional voice note**)
- **Deliverable:** nudge screen rendering off seed data **by H12** — this is the project's kill gate

### Pranav — Places, Events & Meet flow
Real-world data, and the screens that start the loop.

- **First task: test whether Maps grounding alone is sufficient.** If yes, skip the Places integration entirely and save several hours. Report the answer by H4.
- Ticketmaster Discovery integration; normalize venues + events into one `opportunities` table with a `kind` field (`ticketed` | `casual`)
- Multi-city geo handling — user sets city, works anywhere
- Room-code join, constraint chips, activity result screen (demo beat 4)
- **Deliverable:** real, dated, verifiable opportunities in the DB + the meet flow

### Shared — after H26 freeze
Pitch, polish, rehearsal, and the backup video are **all four of us**, not a role. See PRD §9.

---

## 5. Schema sketch

Starting point, owned by Sahith — argue with it at H0, then freeze.

```sql
users            (id, display_name, avatar_url, city)
groups           (id, room_code, name, created_at)
group_members    (group_id, user_id)
hangouts         (id, group_id, activity_text, happened_at)
reflections      (id, hangout_id, author_id, subject_id, body, created_at)
tags             (id, user_id, label, kind, source_reflection_id, created_at)
                 -- kind: interest | personality | plan
tag_embeddings   (tag_id, embedding vector(768))
opportunities    (id, kind, title, venue, city, lat, lng,
                  price_cents, starts_at, url, source)
                 -- kind: ticketed | casual   source: ticketmaster | gemini
nudges           (id, user_id, peer_id, opportunity_id, copy, shared_tags, created_at)
```

Note: `reflections` separates `author_id` from `subject_id` — that's what makes the consent model in PRD §6 expressible. Notes stay private to their author; only extracted **tags** become visible to their subject.

---

## 6. Contracts — lock these at H0

This is the single thing that makes four people concurrent. Agree the shapes first; build against stubs; fill them in later.

```ts
// Christian provides · Charles consumes
extractTags(body: string, subjectId: string)
  → { tags: { label: string; kind: "interest"|"personality"|"plan"; confidence: number }[] }

// Christian provides · Pranav consumes
generateActivity(constraints: {
  budgetMax: number; minutesAvailable: number; maxDistanceMi: number; city: string
}) → { title: string; venue: string; address: string;
       priceEstimate: string; reasoning: string; sourceUrls: string[] }

// Christian provides · Charles consumes
writeNudgeCopy(peerName: string, sharedTags: string[], opportunity: Opportunity)
  → { headline: string; body: string }

// Sahith provides · Charles consumes
getMatches(userId: string)
  → { peerId: string; peerName: string; sharedTags: string[];
      score: number; lastMetAt: string }[]

// Pranav provides · Sahith + Charles consume
getOpportunities(city: string, filters?: { maxPriceCents?: number; kind?: "ticketed"|"casual" })
  → Opportunity[]
```

---

## 7. Timeline by person

Aligned to the PRD clock. **H26 is a hard freeze.**

| Hours | Sahith | Christian | Charles | Pranav |
|---|---|---|---|---|
| **H0–H2** | Schema + migrations; seed ending state | Provision everything; billing ON; prompts in console | React scaffold + component kit | Test Maps grounding sufficiency |
| **H2–H6** | pgvector + embedding pipeline | `extractTags` deployed; public URL green by H4 | Nudge card off mock data | Ticketmaster integration |
| **H6–H12** | Match query + ranking | `writeNudgeCopy`; embeddings endpoint | **Nudge screen live on seed data (H12 GATE)** | `opportunities` populated |
| **H12–H18** | Tune ranking on real tags | `generateActivity` + Maps grounding | Memory view, consent screen, reflection capture | Geo/multi-city handling |
| **H18–H24** | Support + query tuning | Harden endpoints, error handling | Wire reflection → live tag extraction | Join + constraints + activity screens |
| **H24–H26** | Freeze data; verify seeds | Final deploy; verify prod URL | Styling pass | Styling pass |
| **H26–H36** | **All four:** backup video, rehearse 10×, sleep | | | |

### Integration checkpoints

Stop and wire things together at these three moments. Nobody skips them.

- **H6** — contracts smoke test: every stub returns real shapes end-to-end
- **H12** — the kill gate (PRD §9). Nudge renders off seed data, or we pivot to an AI hangout planner with 24 hours left
- **H20** — live-data gate: <10 real reflection notes from actual attendees → demo on seeded data, drop the recruitment beat

---

## 8. Setup checklist — H0, before anyone writes code

- [ ] Supabase project created; `vector` extension enabled *(Christian)*
- [ ] Google Cloud project; Gemini API key; **billing enabled** *(Christian)*
- [ ] Ticketmaster developer key *(Pranav)*
- [ ] Netlify site connected to this repo *(Christian)*
- [ ] `.env.example` committed; real keys in Supabase/Netlify secrets, **never in git** *(Christian)*
- [ ] Contracts in §6 reviewed and frozen *(all four)*
- [ ] App named — 5 minutes, then never reopened *(all four)*

---

## 9. Still open

- **App name.** PRD candidates: *Afterparty*, *Throughline*, *Recall*, *Secondhand*.
- **Does Maps grounding replace Google Places?** Pranav answers by H4; determines whether a whole integration disappears.
- ~~Embedding dimensions~~ — **resolved: 768.** `gemini-embedding-001` defaults to 3072, which exceeds pgvector's index dimension cap; pass `outputDimensionality: 768`.
- **Graph view** (PRD §5, the "is this social media?" mitigation) — build only if ahead at H24.
