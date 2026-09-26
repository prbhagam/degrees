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
  → { id, username, displayName, bio, aiParagraph, city,
      phone, pronouns, photoUrl,             // CHANGED Sep 26
      tags: { label, kind }[],               // CHANGED Sep 26 — was write-only; see below
      hasCompletedProfile: boolean }

PUT  /api/profile
  { displayName, bio, aiParagraph, city,
    phone, pronouns?, photoUrl?,             // CHANGED Sep 26 — phone required, rest optional
    tags: { label, kind: "hobby"|"activity"|"derived"|"avoid" }[] }   // "avoid" added Sep 26
  → { ok: true }                 // triggers re-embedding server-side
  // CHANGED Sep 26: GET /api/me now returns aiParagraph + tags too, so a client that fetches
  // then re-PUTs (e.g. edit profile) can round-trip the full shape without wiping fields it
  // doesn't show in its own form.

PUT  /api/preferences
  { costMinCents, costMaxCents, maxTravelMi,
    frequency: "daily"|"few_times_week"|"weekly"|"biweekly"|"monthly",  // widened Sep 26
    groupSizeMin, groupSizeMax, maxDegrees }
  → { ok: true }

// ---- The graph ------------------------------------------------------------
POST /api/connections
  { peerId: string, context: "qr"|"event"|"group"|"manual", eventId?: string }
  → { ok: true, edgeCreated: boolean }   // idempotent; re-scanning is harmless
  // "qr" connections should always carry eventId — the validated design ties every QR-formed
  // edge to the hangout both people were at; the app refuses to show a scannable code otherwise.

GET  /api/graph/me
  → { nodes: { id, displayName, metAt: string | null }[],   // CHANGED Sep 26
      edges: { a: string, b: string }[],
      mutualEdges: { a: string, b: string }[] }   // CHANGED Sep 26
  // CHANGED Sep 26 — BREAKING: this ONLY ever returns 1st-degree connections (people actually
  // met). It is not a directory of the wider matching pool — that stays server-side, used only
  // by /match/run. `metAt` is the event name the connection formed at, if any. `mutualEdges` are
  // edges between two of the viewer's own connections who also know each other (for the "your
  // friends already know each other" view).

// ---- Events ---------------------------------------------------------------
POST /api/events/:roomCode/join
  → { eventId, name, attendees: { id, displayName }[] }

// Added Sep 26 — host-created events (previously events could only be joined, never created).
POST /api/events
  { name, description?, scheduledAt?: string, city?, groupSizeMin, groupSizeMax }
  → { eventId: string, roomCode: string }

// ---- Matching -------------------------------------------------------------
POST /api/match/run
  → { groupId: string,
      members: GroupMember[],
      unrevealedCount: number,      // CHANGED Sep 26
      reasoning: string }          // Gemini's explanation, shown in the UI

GET  /api/groups/:id
  → { id, status, reasoning, members: GroupMember[], unrevealedCount: number,
      activity: Activity | null, completedAt: string | null }   // CHANGED Sep 26
  // degree and sharedInterests are relative to the viewer (the JWT user)

// CHANGED Sep 26 — BREAKING: previously every member's real displayName + a `via` chain was
// sent regardless of degree. The validated design says you never see anyone past 1st degree
// until you've actually met them (an edge exists in connections) — so the server now redacts:
type GroupMember = {
  id: string | null; displayName: string | null;
  degree: number;                  // 0 = you, 1 = met in person, 2+ = network (never shown as a number)
  sharedInterests: string[];       // kept even when redacted — not identifying on its own
  revealed: boolean;               // degree <= 1. When false, id/displayName are null.
}
// `via` is gone — nobody sees the chain to someone they haven't met. `unrevealedCount` on
// GroupResponse/MatchRunResponse is the count of members with revealed: false, for "+N more
// from your wider network" copy.

// Added Sep 26 — a proposed group ("status: proposed") previously had no way to decline.
POST /api/groups/:id/respond
  { accept: boolean }
  → { ok: true }
  // accept: true sets status "confirmed". accept: false removes only the caller from
  // group_members — other members may still want the hangout.

// Added Sep 26 — marks the hangout done; starts the 24h chat/photo archive clock, and forms a
// connections edge between every pair of confirmed members (attending together is how an edge
// forms — see PRD).
POST /api/groups/:id/complete
  → { ok: true }

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
    peers: { peerId: string, relationship: "great"|"fine"|"not_for_me" }[],  // CHANGED Sep 26
    freeText?: string }
  → { ok: true, derivedTags: string[] }   // what Gemini pulled from freeText
  // CHANGED Sep 26 — BREAKING: peers[].wouldMeetAgain (boolean) replaced by a 3-way
  // relationship signal — richer matching input, and the trigger for contact exchange below.
  // peers should only include revealed (1st-degree) members — the client can't name anyone else.

// ---- Contact exchange (Added Sep 26) ---------------------------------------
// Mutual consent: a phone number is only ever included once BOTH sides have called one of
// these for the same pair. Computed server-side from apps/server's contact_exchanges table —
// never trust a client-supplied "accepted" flag. The two routes exist for clearer client copy
// ("ask" vs "accept"); the server-side action is identical either way.
POST /api/groups/:id/exchange-request
  { peerId: string } → ExchangeResponse

POST /api/groups/:id/exchange-accept
  { peerId: string } → ExchangeResponse

type ExchangeResponse = {
  requesterAccepted: boolean;   // the caller's own side
  peerAccepted: boolean;        // the other person's side
  peerPhone: string | null;     // non-null only once both sides are true
}

// ---- Photos (Added Sep 26) --------------------------------------------------
GET  /api/groups/:id/photos
  → { photos: { id, uploaderId, uploaderName, storagePath, createdAt }[] }

POST /api/groups/:id/photos
  { storagePath: string }        // client uploads the image to Supabase Storage first, then
  → { photos: [...] }            // posts the resulting path here
  // Locked (both read the list and post) once completedAt + 24h has passed — see docs/DATA-MODEL.md.
  // Uploads close at the 24h mark; the list itself stays browsable after that.

// ---- Notifications (Added Sep 26) -------------------------------------------
// Mock mode only: GET /api/notifications. In real mode this is a "read that bypasses the
// server" — the client reads the notifications table directly under RLS (user_id = auth.uid())
// and subscribes via Supabase Realtime, the same pattern as chat messages. See below.
GET  /api/notifications   // mock mode only
  → { notifications: { id, type, payload, read, createdAt }[] }

type NotificationType =
  | "hangout_invited" | "hangout_forming" | "message_received"
  | "feedback_prompt" | "exchange_requested" | "exchange_accepted" | "connection_added"
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
- your own notifications (via Supabase Realtime subscription) — Added Sep 26

**Everything else, and every write, goes through the API server.**

---

## Conventions

- All timestamps ISO 8601 UTC.
- Money in **integer cents**. No floats.
- Errors: `{ error: { code: string, message: string } }` with a real HTTP status.
- `POST /api/connections` and `POST /api/events/:code/join` are **idempotent** — people will scan twice.
