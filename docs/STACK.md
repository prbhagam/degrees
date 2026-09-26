# Tech stack

**Degrees** · HackGT 13

Items marked **(meeting)** were decided in the Sep 25 architecture meeting. Items marked *(proposed)* are Claude's recommendations — cheap to swap, nobody has committed to them.

---

## Frontend

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript** | **(meeting)** |
| UI | **React 19** | **(meeting)** |
| Build | **Vite** | **(meeting)** |
| Routing | **React Router** | **(meeting)** |
| Styling | **Tailwind CSS** | **(meeting)** |
| Animation | **Framer Motion** | **(meeting)** |
| Server state | TanStack Query | *(proposed)* — fits the thin-client model: server is the source of truth, no optimistic local state |
| Client state | Zustand | *(proposed)* — ~1KB, just current user + active group |
| Components | shadcn/ui | *(proposed)* — copy-in, no runtime dep |
| Validation | Zod | *(proposed)* — one schema drives both the Gemini `responseSchema` and the form |
| Icons | lucide-react | *(proposed)* |
| Dates | date-fns | *(proposed)* |
| QR | `qrcode.react` to display | *(proposed)* — typed room code stays the primary join path; camera scanning is fragile on stage |

## Backend

| Concern | Choice | Notes |
|---|---|---|
| API server | **Node + TypeScript on Vultr** | **(meeting)** — long-running process, **not** Edge Functions |
| Database | **Supabase Postgres** | **(meeting)** |
| Vectors | **pgvector** | **(meeting)** |
| Auth | **Supabase Auth, username + password** | **(meeting)** — no SSO, no Sign in with Google |
| Email | **Resend** (free tier) | **(meeting)** — transactional only; verification **off** for the demo |
| Reverse proxy | nginx + Let's Encrypt | *(proposed)* |

## AI

| Concern | Choice | Notes |
|---|---|---|
| Provider | **Gemini** | **(meeting)** — Flash for generation |
| SDK | **`@google/genai`** | ⚠️ **not** `@google/generative-ai` — EOL Nov 30 2025, still installs cleanly |
| Embeddings | **`gemini-embedding-001` @ 768 dims** | **(meeting)** — default 3072 exceeds pgvector's index cap |
| Grounding | Google Maps grounding | *(proposed)* — real venues, hours, ratings inside the generation call |
| Structured output | `responseSchema` + Zod | *(proposed)* |

## External data

| Source | Priority | Notes |
|---|---|---|
| **Google Maps / Places** | **Primary** | Venues, hours, ratings. Maps grounding may cover this without a separate Places integration — Pranav confirms by H4. |
| **Ticketmaster Discovery** | Secondary | Real ticketed events. Free tier: 5,000 calls/day, 5 req/sec. |

## Hosting

| Piece | Where |
|---|---|
| Frontend | Netlify |
| API server | Vultr VPS |
| Database + Auth | Supabase |
| Domain | `degrees.tech` (free .tech for a year); server IP is a demo fallback |

---

## Why Gemini, not Grok

Both are HackGT sponsors. Gemini wins on three counts:

1. **Maps grounding** — Google Maps as a tool inside a normal `generateContent` call: ~250M places with hours, ratings, and geo context. Since activities must name real venues across cities, this collapses most of a Places integration into the model call.
2. **Structured outputs** — JSON Schema across all active models, Zod working out of the box. That is the tag-extraction and group-formation path with no glue code.
3. **Cost and ecosystem** — Flash-Lite is ~$0.10/M input; Maps, Places, and Gemini share one Google Cloud project.

**Grok's one real edge is X live search** — campus orgs post events on X, signal Gemini can't see. Metered at $5 per 1,000 posts, and noisy for local campus events.

> **Backlog: Grok.** Parked, not rejected. Revisit only if Maps + Ticketmaster can't surface enough genuinely local, low-cost happenings. Scope would be one panel ("what's happening on campus tonight"), ~2h, and it earns a second sponsor submission.

---

## Deliberately skipped

No test suite, no CI, no error monitoring, no analytics, no SSO. Prettier only, no ESLint config debate. These are conscious trades for hours on a 36-hour clock — say so plainly if a judge asks, rather than letting them read as oversights.

---

## Gotchas

- **Enable Gemini billing before H2.** Free tier is ~5–15 req/min and 1,000–1,500/day — not enough for a live demo plus real testers. Paid also stops your data being used for product improvement.
- **`@google/genai`**, not the EOL package. Worth checking `package.json` twice.
- **768-dim embeddings.** The 3072 default cannot be indexed by pgvector.
- **Service role key and Gemini key never reach the client.** `.env.example` in git; real keys in server env and Netlify secrets only.
