# HackGT 13 — Social Memory App

**PRD v2** · Sep 25, 2026 · @Sahith
*Revised after council review. See [What changed in v2](#what-changed-in-v2) for the rationale behind each change.*

> **The AI's job is getting people offline, not keeping them scrolling.**
> That is the pitch. It leads the demo, it leads the devpost, it leads every conversation with a judge.

---

## 1. Problem statement

Social media makes people feel isolated in two specific ways: the feed doesn't lead anywhere real, and even the online connections that do exist rarely turn into shared time or real-world plans.

Meta's HackGT 13 challenge asks for a social app with AI integrated throughout. This project answers it by pointing the AI at the opposite of engagement — the app's success metric is time spent *together offline*, not time spent in-app.

**Target user:** college students who meet new people constantly (orientation, clubs, hackathons, classes) but struggle to turn a first meeting into an ongoing relationship.

**The real bottleneck (revised):** it is *not* that people can't think of somewhere to go. The binding constraint is **initiation** — the cost of texting first, and the awkwardness of reaching out to someone you met once with no reason to. Our AI's job is to manufacture that reason. Everything else in the product is scaffolding that feeds it.

---

## 2. Core loop

1. **Join a group** — people who just met join a shared group via room code or QR.
2. **AI icebreaker activity** — members set light constraints (budget, time, distance); the AI proposes one concrete, real-world plan that fits everyone.
3. **Reflection capture** — after the hangout, each person leaves a *low-friction* note about who they met. The AI extracts structured tags (interests, personality signals, plans mentioned) to each person's profile.
4. **Memory-driven nudge** — later, the AI surfaces a reason to reconnect: it matches accumulated tags across everyone you've met and pings the people with a live shared interest.

**The bet is step 4.** Most social apps nail the icebreaker and stop. The follow-through — accumulated memory that turns a one-off meeting into an ongoing relationship — is the only part nobody else will have on stage.

---

## 3. Build order (INVERTED — this is the most important change)

The v1 PRD built 1 → 6 in loop order, which scheduled the differentiator last. Under fatigue at hour 30, that guarantees we ship a constraint-aware activity picker — the same demo a dozen other teams will have.

**We build the payoff first and backfill the mechanism.**

| Order | Feature | Why here | Gate |
|---|---|---|---|
| **1** | **Memory nudge screen**, rendering off hand-seeded data | The differentiator. Must exist before anything else. | **Working by H12** |
| **2** | **AI tag extraction** from free-text notes → profile | Makes the nudge real instead of hardcoded | H14 |
| **3** | **Reflection capture** (one question, not a form) | Feeds #2 | H18 |
| **4** | **AI activity generator** from group constraints | The icebreaker beat; commodity but needed for the arc | H20 |
| **5** | **Constraint input** (3 chips, not sliders) | Feeds #4 | H22 |
| **6** | **Group join** via room code / QR | Framing beat; least differentiating | H24 |
| **7** | **"Your Memory" consent screen** | See §6 — non-optional | H24 |
| Stretch | Shared group memory feed / "people you've met" graph | See §5 — answers the Meta brief risk | if time |
| Stretch | Real proximity detection | Real-world version of #6 | post-hackathon |

**Cut rule:** if we fall behind, features are cut from the **bottom** of this table, never the top. The room-code join screen can be a static mock in the worst case. The nudge cannot.

### Explicitly cut from v1

- **Supabase Auth.** Costs 3+ hours and occupies zero demo seconds. Users are hardcoded and selected by URL param (`?u=3`). Auth is a line in the "what's next" slide, not a build task.
- **The multi-field constraint form.** Reduced to three tap-chips. Nobody watches a form get filled out.

---

## 4. Demo script — payoff first (4 beats, ~3 min)

The v1 script walked the loop in chronological order, which meant the differentiator landed last and arrived as pre-seeded data after the judges' attention had already been spent on a commodity activity picker. **We open on the payoff and rewind to the mechanism.**

| Beat | On screen | Says |
|---|---|---|
| **1. The nudge** (open cold) | A phone buzzes. *"You and Chris both mentioned bouldering six weeks ago. Stone Summit has a $12 student night Thursday — want in?"* | "This is two people who met once, at an orientation event, and would never have spoken again. Here's how the app got here." |
| **2. The memory** | The profile behind the nudge: Chris's accumulated tags, and the reflection notes they came from | "The AI has been building this quietly since the day they met." |
| **3. Reflect** | Live: type one sentence about someone → tags appear in real time | "That's the only thing we ever ask a user to do." |
| **4. Meet** | Live: three people join by room code, set constraints, AI returns one concrete plan | "And that's day one — which produces the note in beat 3, which produces the nudge in beat 1. The loop closes." |

Beats 3 and 4 are **live**. Beat 1–2 run off accumulated memory (see §7 for whose).

---

## 5. Open risk: does this read as a *social media* app?

**The sharpest objection raised in review, and it is not fully solved.** Meta asked for a social media app with AI integrated throughout. As specified, this is a group-coordination utility with a notes table and two API calls. No feed, no content, no graph, no posts.

Mitigations, in priority order:

1. **Build the "people you've met" graph view** as the app's home surface — your network, rendered, with memory density as edge weight. Cheap to build on data we already have, and it makes the social object visible.
2. **Frame the memory layer as the feed.** Our feed isn't posts, it's reasons to reconnect — and it's ranked by the AI. Say this out loud in the pitch.
3. **Count the AI honestly.** Tag extraction, constraint solving, match ranking, and nudge copy generation = four distinct AI jobs, not two. Name all four when asked "where's the AI?"

**Judge-proofing:** rehearse a direct answer to "how is this social media?" Do not improvise it.

---

## 6. Consent and the dossier problem

We are storing AI-extracted personality assessments **that other people wrote about a user**. A judge will ask who can read that. We need a built answer, not a verbal one.

**Design decision:** every user can see their own complete tag list, at any time, on a "Your Memory" screen — and can delete any tag. Notes stay private to their author; only the *extracted tags* become shared profile data, and only with the subject's visibility.

This costs us honesty in the notes (people write softer knowing tags are visible) and we accept that tradeoff. The alternative is covert profiling of college students, which is both wrong and a demo-day liability.

**Also reduces friction:** reflection is one question — *"What's one thing you learned about someone tonight?"* — with an optional voice note. Not a per-person form. Asking users to file written reports on people they just met is the single weakest assumption in v1; we minimize the ask rather than pretend it won't happen.

---

## 7. Demo data: seeded floor, live upside

We are inside a building with ~1,000 colocated strangers who just met each other — the exact user at the exact moment, free, for 36 hours. Pre-seeding fake accounts in that room is a wasted asset.

**But recruitment is a second project with real failure modes** (no-shows, nobody returns a note, nothing to nudge on by Sunday). So:

- **Floor (guaranteed):** 5 seeded users, 2 past hangouts, ~20 extracted tags, built at H2 and rehearsed. The demo works with zero real users.
- **Upside (parallel track):** one **non-coding** team member spends Saturday recruiting 20–40 real attendees with a QR code. If it lands, beat 1 fires on a real name a judge can walk over and verify. That is a category difference in judging: "we built it" vs "it's running, here are our users."
- **Decision point at H20:** fewer than ~10 real reflection notes → drop the live-user beat, demo on seeded data, no regrets.

---

## 8. Tech stack

- **Frontend:** React + Vite, mobile-framed
- **Backend / DB:** Supabase (Postgres) — users, groups, notes, tags, nudges
- **AI:** Claude API via Supabase Edge Functions — four jobs: (1) constraint-solving → activity, (2) tag extraction from notes, (3) shared-interest match ranking, (4) nudge copy generation. All structured-output/JSON-schema'd.
- **Hosting:** Netlify (frontend), Supabase Edge Functions (server-side AI)
- **Auth:** none. Hardcoded users via URL param.

Stack mirrors the team's default infra, so nearly all 36 hours go to prompting and the demo flow rather than plumbing.

**Cost:** ~$5 Claude API, $0 Supabase/Netlify free tier.

---

## 9. The clock

| Hours | Work |
|---|---|
| **H0–H2** | Freeze the demo script as literal screen-by-screen text. Name the app. Assign roles. Write both core prompts in the API console against fake data — **no UI yet**. Seed the database with the *ending* state. |
| **H2–H12** | Nudge screen working off seeded data. **Nothing else.** |
| **H12–H18** | Tag extraction + reflection capture. Memory becomes real. |
| **H18–H24** | Activity generator, constraint chips, room-code join, consent screen. |
| **H24–H26** | Styling pass. Graph view if ahead of schedule. |
| **H26** | **HARD CODE FREEZE.** |
| **H26–H36** | Record backup video. Rehearse the pitch 10×. Sleep. |

Teams lose to live-demo failure far more often than to missing features. H26–H36 is not slack — it is the highest-ROI block on the board.

### Tripwires

- **H2 — prompt gate.** If tag extraction isn't returning clean structured tags within 45 minutes of starting, the memory thesis is in question. Escalate immediately; a pivot at H2 is free.
- **H10 — the kill gate.** The nudge screen must render a concrete match off seeded data — *"Maya and Chris both mentioned bouldering — climb Thursday?"* If it doesn't, **cut the memory thesis and rebrand as an AI hangout planner** with 26 hours left. Do not discover this at H30.
- **H20 — live-data gate.** <10 real reflection notes → seeded demo, drop the recruitment beat.
- **H26 — freeze.** No exceptions, no "one more feature."

---

## 10. Decisions closed (do not reopen)

| Question | Decision |
|---|---|
| Which track? | **Both** — Meta challenge *and* general AI/ML, plus every sponsor track our stack touches (Supabase, Netlify, Anthropic). One build, multiple pools, zero marginal work. |
| App name | **Decide in 5 minutes at H0 and never revisit.** Candidates: *Afterparty*, *Throughline*, *Recall*, *Secondhand*. Name matters far less than the nudge working at H12. |
| Auth | None. URL param. |
| Demo data | Seeded floor + live upside (§7). |
| Team roles | Assigned at H0: one on prompts/AI, one on the nudge + memory screens, one on the meet/activity flow, one non-coding on recruitment + pitch. Adjust to actual headcount, but **the prompt owner and the nudge owner are separate people**. |

### Still genuinely open

- Exact prompt design for the four AI calls — iterate at H0–H2 in the console, lock the schemas, then stop tuning.
- Whether the graph view (§5) fits before H26.

---

## What changed in v2

Every change below traces to a specific review finding.

1. **Build order inverted (§3).** v1 scheduled the differentiator sixth of six. All five reviewers independently predicted it would be cut at hour 30, leaving a generic activity picker. The nudge now ships first, gated at H12.
2. **Demo reordered payoff-first (§4).** v1 walked the loop chronologically, landing the memory beat last and on admittedly pre-seeded data. Opening on the nudge puts the novel thing in front of a judge while attention is highest.
3. **Auth cut, constraint form shrunk (§3).** Hours spent on screens that occupy zero demo seconds.
4. **Bottleneck restated (§1).** "People can't think of somewhere to go" is false — the real constraint is initiation cost. This reframe is what makes the nudge the *product* rather than a retention feature.
5. **Meta-brief risk surfaced (§5).** The strongest dissent in review: this may not read as *social media* at all. Added the graph view, the feed reframe, and a rehearsed answer.
6. **Consent screen made non-optional (§6).** Storing third-party-authored personality dossiers on college students, with no way to see your own, is both a design flaw and a question we would fumble live.
7. **Reflection friction minimized (§6).** One question + optional voice note, replacing a per-person written form — the weakest behavioral assumption in v1.
8. **Demo data split into floor + upside (§7).** Seeded data guarantees the demo; real HackGT attendees are the upside that beats every other team. Neither depends on the other.
9. **AI call count raised from 2 → 4 (§8).** "AI integrated throughout" against two API calls invites the objection. Four named, distinct jobs answers it.
10. **Clock and tripwires added (§9).** v1 had a feature ladder but no schedule and no kill criteria. The H10 gate is the single most important line in this document.
11. **Open questions closed (§10).** Track selection and naming were consuming decision energy with no upside. Both are now settled.
