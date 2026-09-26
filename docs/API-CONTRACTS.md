# API contracts

**Degrees** · lock these at H0, before anyone writes a line.

This file is what makes four people concurrent. It is implemented as TypeScript types + Zod schemas in [`packages/shared`](../packages/shared/src) — change both together. Frontend builds against stubs matching these shapes; the server fills them in. Nobody blocks after H2.

**Base:** `https://api.degrees.tech`
**Auth:** every endpoint requires `Authorization: Bearer <supabase-jwt>`. The server derives `userId` from the verified token — **never from the request body**.

---

## Client → Server

```ts
// ---- Profile & preferences ------------------------------------------------
GET  /api/me
  → { id, username, displayName, bio, city, hasCompletedProfile: boolean }

PUT  /api/profile
  { displayName, bio, aiParagraph, city, tags: { label, kind }[] }
  → { ok: true }                 // triggers re-embedding server-side

PUT  /api/preferences
  { costMinCents, costMaxCents, maxTravelMi,
    frequency: "daily"|"weekly"|"monthly",
    groupSizeMin, groupSizeMax, maxDegrees }
  → { ok: true }

// ---- The graph ------------------------------------------------------------
POST /api/connections
  { peerId: string, context: "qr"|"event"|"group"|"manual", eventId?: string }
  → { ok: true, edgeCreated: boolean }   // idempotent; re-scanning is harmless

GET  /api/graph/me
  → { nodes: { id, displayName, degree }[],
      edges: { a: string, b: string }[] }   // for the network view

// ---- Events ---------------------------------------------------------------
POST /api/events/:roomCode/join
  → { eventId, name, attendees: { id, displayName }[] }

// ---- Matching -------------------------------------------------------------
POST /api/match/run
  → { groupId: string,
      members: GroupMember[],
      reasoning: string }          // Gemini's explanation, shown in the UI

GET  /api/groups/:id
  → { id, status, reasoning, members: GroupMember[], activity: Activity | null }
  // degree, sharedInterests, and via are relative to the viewer (the JWT user)

type GroupMember = {
  id: string; displayName: string;
  degree: number;                  // 0 = you, 1 = met in person, 2 = mutual, 3 = network
  sharedInterests: string[];
  via?: { id, displayName }[];     // the degrees path: people between you and them, nearest you first.
}                                  // [] for you and 1st degree; absent if not computed. Added Sep 26.

// ---- Activity -------------------------------------------------------------
POST /api/groups/:id/activity
  → Activity

type Activity = {
  title: string; venue: string; address: string;
  lat: number; lng: number;
  priceCents: number | null; startsAt: string | null;
  source: "maps" | "ticketmaster"; sourceUrl: string | null;
  reasoning: string;
}

// ---- Chat -----------------------------------------------------------------
GET  /api/groups/:id/messages?since=<iso>
  → { messages: { id, senderId, senderName, body, createdAt }[] }

POST /api/groups/:id/messages
  { body: string } → { id, createdAt }

// ---- Feedback -------------------------------------------------------------
POST /api/groups/:id/feedback
  { rating: 1|2|3|4|5,
    peers: { peerId: string, wouldMeetAgain: boolean }[],
    freeText?: string }
  → { ok: true, derivedTags: string[] }   // what Gemini pulled from freeText
```

---

## Internal AI services

Server-side only. Never exposed to the client, never called from the app.

```ts
embedProfile(userId: string): Promise<void>
  // interests + aiParagraph + derived tags → gemini-embedding-001 @ 768 dims
  // → upsert profile_embeddings

formGroups(input: {
  requesterId: string;
  candidates: { id, displayName, degree, interests, prefs }[];
  sizeRange: { min: number; max: number };
}): Promise<{ memberIds: string[]; reasoning: string }>
  // Gemini Flash. Size range is a SOFT constraint — best effort, not a hard cut.
  // On failure: fall back to top-N by vector similarity. Matching never hard-fails.

generateActivity(input: {
  members: { displayName, interests }[];
  constraints: { maxCostCents, maxTravelMi, city, lat, lng };
}): Promise<Activity>
  // Gemini Flash + Maps grounding. Ticketmaster is a secondary source.

analyzeFeedback(freeText: string): Promise<{
  tags: { label: string; kind: "derived" }[];
  sentiment: "positive" | "neutral" | "negative";
}>
  // Output feeds profile_tags, then triggers re-embedding. This is the loop.
```

---

## Reads that bypass the server

The client reads these **directly from Supabase** with the anon key, under RLS — no server round-trip:

- own profile and preferences
- group member list for groups you belong to
- chat messages (via Supabase Realtime subscription)

**Everything else, and every write, goes through the API server.**

---

## Conventions

- All timestamps ISO 8601 UTC.
- Money in **integer cents**. No floats.
- Errors: `{ error: { code: string, message: string } }` with a real HTTP status.
- `POST /api/connections` and `POST /api/events/:code/join` are **idempotent** — people will scan twice.
