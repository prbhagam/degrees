# Degrees — Product Spec

**v3** · Sep 25, 2026 · HackGT 13
Supersedes PRD v2 ("Social Memory App"). Rewritten after the Sep 25 architecture meeting.

> **A dating app for friend groups.**
> The AI's job is getting people offline, not keeping them scrolling.

**Context files for agents:** [AGENTS.md](./AGENTS.md) · [Architecture](./docs/ARCHITECTURE.md) · [Data model](./docs/DATA-MODEL.md) · [API contracts](./docs/API-CONTRACTS.md) · [Stack](./docs/STACK.md) · [Roles](./docs/ROLES.md)

---

## 1. The idea

People are **nodes**. An **edge** forms when two people meet in person. Degrees builds real-world hangout groups out of that graph, and the AI's job is choosing who should meet whom.

The differentiator is **degrees of separation**: you control how far from yourself the app is allowed to reach. Only people you've actually met (1st degree). Friends of those people (2nd). The wider network (3rd+). That dial is what makes this not a dating app and not a random-stranger app.

**Target user:** college students who meet people constantly — orientation, clubs, hackathons, classes — but whose one-time meetings never become anything.

**Why the graph isn't empty at a hackathon:** edges form when people meet *in person*, and HackGT is a building full of people meeting in person. The graph grows live during the event. We seed enough accounts to make 2nd-degree matches visible, since first-degree alone doesn't demonstrate *degrees*.

---

## 2. Core loop

```
  Onboard ──► Meet people in person ──► Edge forms
     │                                      │
     │                                      ▼
     │                            Memory (Gemini embeddings)
     │                                      │
     │                                      ▼
     └──────────────────────────► Gemini forms a group
                                  (honors degrees + size range + cost/time/distance)
                                            │
                                            ▼
                                  Activity proposed (Maps-grounded)
                                            │
                                            ▼
                                  Group chat → they hang out
                                            │
                                            ▼
                             Post-event feedback (rating + meet-again + free text)
                                            │
                                            └──► back into memory, better next match
```

The loop closes at feedback. Every hangout makes the next match better — that's the compounding asset, and it's why memory matters even though users never write essays.

---

## 3. Onboarding

1. **Sign up** — Supabase auth, username + password. No SSO, no Sign in with Google.
2. **Interests** — tag-based hobbies and activities, plus an optional freeform **"AI paragraph"** the model reads for nuance tags can't carry. Voice input is a nice-to-have. Bio is visible **only to matched users**.
3. **Preferences** — cost range · location + travel distance · match frequency (daily / weekly / monthly) · **group size range** · **degrees of separation** allowed.

**Deliberately avoided:** hard exclusion filters (triggers, religion, personal screens). Degrees is about who you're open to meeting, not who you're filtering out.

**Skip path (the demo path):** at an icebreaker event, join by **QR code** and finish the profile later. Getting someone into the graph takes seconds, not a form. NFC was floated but is likely restricted on iOS; AirDrop link sharing is the simpler fallback.

---

## 4. Matching

Runs **server-side only** (see [Architecture](./docs/ARCHITECTURE.md)). Never on the client, never in Supabase Edge Functions.

1. **Candidate pool** — graph traversal from the user, bounded by their allowed degrees of separation.
2. **Narrow** — pgvector similarity over profile embeddings, filtered by cost, travel distance, and availability.
3. **Form groups** — Gemini takes the narrowed candidates and assembles a group, honoring each member's **group size range as a soft constraint** — best effort, not a hard cut. It returns the group plus a human-readable reason.
4. **Propose an activity** — Gemini with **Maps grounding** returns one concrete plan fitting the group's combined constraints. Ticketmaster supplies real ticketed events as a secondary source.

**Group size is the key anti-dating-app lever.** Nobody gets matched one-to-one by default.

---

## 5. Post-event feedback

After a hangout, each member submits:

- a **rating** of the event on a simple scale
- **"would you meet these people again?"** — captured per person, not just per group
- **optional free text** about how it went, which Gemini analyzes

This is the memory-building step, and it's cheap by design — one tap plus an optional sentence. PRD v2 asked users to write notes about each person they met; that was homework nobody does. The rematch toggle carries most of the same signal for a fraction of the friction.

---

## 6. Chat

Lightweight, in-app, **matched groups only**, and scoped to coordinating the meetup. Not a messaging product. No phone number exchange (possible future feature).

---

## 7. Demo arc

1. **Join** — two people meet at HackGT, scan a QR, an edge forms live.
2. **Match** — the server runs matching; Gemini forms a group and explains *why*, showing the degrees path ("you and Maya both know Chris").
3. **Plan** — a real, Maps-grounded activity with a real venue and price.
4. **Feedback → better match** — submit a rating and a rematch signal, then show the next match visibly shift because of it.

Beat 4 is the point: the app gets smarter from real use, on stage.

---

## 8. Naming

**Degrees.** Domain `degrees.tech` (free .tech for a year); server IP is an acceptable fallback for the demo. *Spheres* was floated as an alternative and set aside.

---

## 9. Still open

- **Resend usage** — assumed transactional only (password reset), with **email verification off** for the demo so venue signups aren't blocked. Confirm.
- **Graph view** — a visible "people you've met" network is the strongest answer to "is this social media?" for the Meta track. Build if ahead.
- **Frequency preference** (daily/weekly/monthly) has no scheduler in a 36-hour build. Store it, honor it in copy, don't build cron.
