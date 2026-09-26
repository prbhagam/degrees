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
                              Mark the hangout done → edge forms with
                              every groupmate; chat + photos archive in 24h
                                            │
                                            ▼
                     Post-event feedback (rating + per-person relationship + free text)
                                            │
                              ├──► mutual-consent contact exchange (optional)
                                            │
                                            └──► back into memory, better next match
```

The loop closes at feedback. Every hangout makes the next match better — that's the compounding asset, and it's why memory matters even though users never write essays.

**CHANGED Sep 26:** attending a hangout is now what forms the edge with everyone in it (not just whoever you happen to QR-scan) — see [DATA-MODEL.md](./docs/DATA-MODEL.md). Feedback moved from a per-group "would you meet again" toggle to a per-person relationship signal (see §5). Chat and photos are only live for 24 hours after the hangout is marked done, then go read-only — the app is explicitly not a standing group chat (see §6).

---

## 3. Onboarding

1. **Sign up** — Supabase auth, username + password. No SSO, no Sign in with Google. **(CHANGED Sep 26)** also collects phone (required — confirms attendees at events) and pronouns (optional); profile photo is optional and can be added later.
2. **Interests** — tag-based hobbies and activities (common tags for fast matching, or type your own — a specific tag still saves to your profile, it just may take longer to find a match), plus an optional freeform **"AI paragraph"** the model reads for nuance tags can't carry. Voice input is a nice-to-have, logged as a future direction, not built. Bio is visible **only to 1st-degree connections** (people you've actually met — see §9 on why "matched" no longer means "visible"). **(CHANGED Sep 26)** also an optional **"avoids"** list (e.g. alcohol, late nights, large crowds) the model plans around, same tag pattern as interests.
3. **Preferences** — cost range · home base + travel distance · match frequency (daily / a few times a week / weekly / biweekly / monthly — widened Sep 26) · **group size range** (min–max, not one number) · **degrees of separation** allowed.

**Deliberately avoided:** hard exclusion filters (triggers, religion, personal screens). Degrees is about who you're open to meeting, not who you're filtering out. "Avoids" (above) is about planning around a preference, not screening people out.

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
- **a per-person relationship signal** — "great connection" / "it was fine" / "not for me" for each groupmate — captured per person, not just per group. **(CHANGED Sep 26:** widened from a "would you meet again" boolean to this 3-way signal — same one-tap cost, richer matching input.)
- **optional free text** about how it went, which Gemini analyzes
- **(Added Sep 26) an optional mutual contact exchange** per person: either side can ask, but a phone number is only revealed once *both* sides agree. This is the sanctioned way to take a connection off-app — see §6.

This is the memory-building step, and it's cheap by design — one tap plus an optional sentence. PRD v2 asked users to write notes about each person they met; that was homework nobody does. The relationship signal carries most of the same information for a fraction of the friction.

---

## 6. Chat

Lightweight, in-app, **matched groups only**, and scoped to coordinating the meetup. Not a standing messaging product: chat (and photos — see below) stay open for 24 hours after a hangout is marked done, then go read-only. **(CHANGED Sep 26)** Phone number exchange, previously a "possible future feature," is built: mutual-consent only, offered from post-event feedback (§5), and is the intended way to keep talking to someone once the group chat locks.

**(Added Sep 26) Photos.** Attendees can add photos from the hangout to a shared per-group album, visible only to that group. Same 24h window as chat — uploads close then, the album stays browsable.

---

## 7. Demo arc

1. **Join** — two people meet at HackGT, scan a QR, an edge forms live.
2. **Match** — the server runs matching; Gemini forms a group and explains *why* in prose ("you already know Maya, and two more people share your interests"). **(CHANGED Sep 26)** no longer names or shows a path to anyone past 1st degree — see §9.
3. **Plan** — a real, Maps-grounded activity with a real venue and price.
4. **Feedback → better match** — submit a rating and a per-person relationship signal, then show the next match visibly shift because of it.
5. **(Added Sep 26) Circle** — after the hangout, open Your Circle and show the new groupmate now appears, plus whether they know any of your other connections.

Beat 4 is the point: the app gets smarter from real use, on stage.

---

## 8. Naming

**Degrees.** Domain `degrees.tech` (free .tech for a year); server IP is an acceptable fallback for the demo. *Spheres* was floated as an alternative and set aside.

---

## 9. Still open

- **Resend usage** — assumed transactional only (password reset), with **email verification off** for the demo so venue signups aren't blocked. Confirm.
- **Frequency preference** (daily/few times a week/weekly/biweekly/monthly) has no scheduler in a 36-hour build. Store it, honor it in copy, don't build cron.
- **Login is spec'd as "username + password" but implemented against Supabase Auth's email/password.** No username-based auth bridge was built — confirm with Christian/Sahith whether that's intended or the spec should change.

**Resolved Sep 26 (were open, now decided):**

- **Graph view — built, not just "if ahead."** Previously: "a visible 'people you've met' network is the strongest answer to 'is this social media?' — build if ahead." It's built as **Your Circle**, and it answers that question more precisely than originally scoped: it doesn't just visualize the graph, it **enforces** that you only ever see 1st-degree connections — the app never lets you browse the wider matching pool as people. Circle also shows edges between two of your own connections who know each other (a mutual-friends view), which wasn't in the original graph-view idea. Owner: Pranav (see [ROLES.md](./docs/ROLES.md)).
- **Contact exchange** — was "possible future feature" (§6 v3). Built, mutual-consent only. See §5, §6.
