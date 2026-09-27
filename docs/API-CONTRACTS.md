# API contracts

**Degrees** · lock these at H0, before anyone writes a line.

This file is what makes four people concurrent. It is implemented as TypeScript types + Zod schemas in [`packages/shared`](../packages/shared/src) — change both together. Frontend builds against stubs matching these shapes; the server fills them in. Nobody blocks after H2.

**CHANGED Sep 26 (wave 2, Sahith's branch `sahith/wave2-fixes`)** — additive unless marked: `GET /api/hangouts`, `POST /api/groups/:id/leave`, `POST /api/groups/:id/icebreakers`; `GroupResponse` gains `kind`/`name`/`hostId`/`scheduledAt`/`roomCode`/`codeExpiresAt`/`icebreakers`; `GroupMember.met`; `JoinEventResponse` gains `groupId`/`hostId`/`scheduledAt`/`codeExpiresAt`/`endedAt` and `attendees[].alreadyMet`; `MeResponse` gains `profileStatus` + `preferences`; `Photo.url`; phone numbers are validated as US and stored E.164; `POST /api/match/run` returns 409 `profile_incomplete` until onboarding is done; `POST /api/events/:roomCode/join` returns 410 `event_code_expired`. Every response carries an `x-request-id` header that matches the server's log line.

**CHANGED Sep 26 (wave 3, Sahith's branch `sahith/wave3-testing-fixes`)** — additive: `GroupResponse.activityHistory` (earlier plans, newest first) and `Activity.id`/`createdAt` on saved plans; `POST /api/groups/:id/activity/restore`; `POST /api/groups/:id/leave` on a live meetup now undoes only the connections that meetup created for the leaver (edges with its `event_id`), never pre-existing ones — and a lobby "We met" sends `eventId` so it counts; `GET /api/graph/me` nodes carry `contact` and `POST /api/graph/exchange` is the pair-keyed contact exchange (the per-group `exchange-*` routes stay for compatibility, the app no longer calls them); `GenerateActivityInput` members carry `avoids` and the input carries `previousVenues`. Needs migration `0010`.

**CHANGED Sep 26 (wave 4, branch `sahith/wave4-polish`)** — additive: per-member acceptance (`GroupMember.accepted`, `GroupResponse.myResponse` + `acceptedCount`, `HangoutSummary.needsResponse` + `acceptedCount`; `POST /groups/:id/respond` now records only the caller's answer and the group confirms once everyone has accepted); `PUT /api/groups/:id` renames; "Why this group" text is redacted per viewer so it never names anyone past 1st degree. Needs migration `0011`.

**CHANGED Sep 26 (wave 5, branch `sahith/wave5-feedback`)** — additive: notifications are finally WRITTEN (`event_changed` joins the type list; `POST /api/notifications/read`; `GET`/`PUT /api/notifications/settings` + `MeResponse.notificationSettings`); the calendar moved from "Host a meetup" to the plan (`GroupResponse.times`, `POST /api/groups/:id/times`, `/times/:timeId/vote`, `/times/:timeId/choose`, `DELETE /times/:timeId`); `HangoutSummary.lastMessage` + `chatOpen` for the Chats tab; `POST /groups/:id/activity/restore` moves the row instead of copying it (no duplicate history); the planner enforces budget and distance. Needs migration `0012`.

**Base:** `https://degrees-api.netlify.app` (`api.degrees.tech` once DNS exists)
**Auth:** every endpoint except `POST /api/auth/signup` requires `Authorization: Bearer <supabase-jwt>`. The server derives `userId` from the verified token — **never from the request body**.

---

## Client → Server

```ts
// ---- Auth (Added Sep 26) ---------------------------------------------------
POST /api/auth/signup            // PUBLIC — no Authorization header
  { email, username, password, displayName, phone, pronouns? }     // CHANGED Sep 27: + email
  → { ok: true, userId }
  // email: trimmed + lowercased; @degrees.demo is rejected (reserved for seeded demo accounts).
  // username: 3–20 of [a-z0-9._], lowercased server-side — the @handle, not a login. password: 8+ chars.
  // The server creates the Supabase auth user already confirmed, with that email, plus the profiles
  // row. The client then signs in with supabase.auth.signInWithPassword({ email, password }). Login
  // is the same call — there is no login route.
  // 409 username_taken · 409 email_taken · 400 invalid_request
  // Why server-side: the Supabase project requires email confirmation (rate-limited mailer; the
  // email isn't verified by us yet), and nothing else creates a new user's profiles row.

// ---- Profile & preferences ------------------------------------------------
GET  /api/me
  → { id, username, displayName, bio, aiParagraph, city,
      phone, pronouns, photoUrl,             // CHANGED Sep 26
      tags: { label, kind }[],               // CHANGED Sep 26 — was write-only; see below
      hasCompletedProfile: boolean,          // CHANGED wave 2: every onboarding step done (was name + city)
      profileStatus: { interests, about, preferences },   // Added wave 2 — what's still missing
      preferences: UpdatePreferencesRequest | null,       // Added wave 2 — so the preferences screen prefills
      notificationSettings: { hangouts, exchange, met, changes } }   // Added wave 5 — per-kind toggles, defaults all true

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
  → { nodes: { id, displayName, bio: string | null, photoUrl: string | null, metAt: string | null,
               contact: { requested: boolean, peerAccepted: boolean, peerPhone: string | null } }[],   // contact: Added wave 3
      edges: { a: string, b: string }[],
      mutualEdges: { a: string, b: string }[] }   // CHANGED Sep 26
  // wave 3: `contact` is the saved phone-exchange state with that person (connection_contacts). `peerPhone` is
  // non-null only once both sides have said yes — computed server-side, never client-set.

// Added wave 3: mutual-consent phone exchange with a 1st-degree connection, keyed on the pair (not a group) so it
// persists. One call marks the caller's side yes; the number comes back once both sides have. 404 peer_not_found
// unless a connections edge exists between the two.
POST /api/graph/exchange
  { peerId: string } → ExchangeResponse
  // CHANGED Sep 26 — BREAKING: this ONLY ever returns 1st-degree connections (people actually
  // met). It is not a directory of the wider matching pool — that stays server-side, used only
  // by /match/run. `metAt` is the event name the connection formed at, if any. `mutualEdges` are
  // edges between two of the viewer's own connections who also know each other (for the "your
  // friends already know each other" view). bio/photoUrl (Added Sep 26) are safe here — every
  // node is already 1st-degree — and back Circle's tap-a-node-to-view-profile card.

// ---- Events / meetups -----------------------------------------------------
// CHANGED wave 2: a joinable event is a *meetup* — a `groups` row with kind 'meetup' — so everything a matched
// group has (chat, plan, photos, leave) works for it. The `events` row is its room-code record.
POST /api/events/:roomCode/join
  → { eventId, groupId, name, hostId, scheduledAt, codeExpiresAt, endedAt,
      attendees: { id, displayName, bio: string | null, photoUrl: string | null, alreadyMet: boolean }[] }
  // 410 event_code_expired once the code is past codeExpiresAt (24h after scheduledAt, or creation) or the
  // meetup has ended. Existing members can always re-open the lobby. Idempotent.
  // bio/photoUrl (Added Sep 26): the event lobby shows everyone present regardless of the
  // connections graph — Charles: "when joining event, all members should be able to see name,
  // bio, pfp." This does NOT auto-form a connection edge; that's still the explicit "We met"
  // per attendee (POST /api/connections), which is what Circle's degree math depends on.

// Added Sep 26 — host-created events (previously events could only be joined, never created).
POST /api/events
  { name, description?, scheduledAt?: string, city?, groupSizeMin, groupSizeMax }
  → { eventId: string, roomCode: string }
  // wave 2: also creates the backing group (kind 'meetup', status 'confirmed') with the host as a member.

// Added wave 2: one list for Home — matched groups and meetups together, active first then past.
GET  /api/hangouts
  → { hangouts: { id, kind: "matched"|"meetup", name, status, reasoning, memberCount, formedAt,
                  scheduledAt, completedAt, roomCode (meetups, while valid), hostId, isPast,
                  needsResponse, acceptedCount,                                  // Added wave 4
                  lastMessage: { body, senderName, createdAt } | null,           // Added wave 5 — the Chats tab preview
                  chatOpen: boolean }[] }                                        // Added wave 5 — meetup, or matched and not 'proposed'
  // wave 5: scheduledAt is set for matched groups too once a time is chosen (see /times below).

// ---- Matching -------------------------------------------------------------
POST /api/match/run          // wave 2: 409 profile_incomplete until interests + home base + preferences exist
  → { groupId: string,
      members: GroupMember[],
      unrevealedCount: number,      // CHANGED Sep 26
      reasoning: string }          // Gemini's explanation, shown in the UI

GET  /api/groups/:id
  → { id, status, reasoning, members: GroupMember[], unrevealedCount: number,
      activity: Activity | null, completedAt: string | null,   // CHANGED Sep 26
      kind, name, eventId, hostId, scheduledAt, roomCode, codeExpiresAt, icebreakers: string[],   // Added wave 2
      activityHistory: Activity[],    // Added wave 3: earlier 'ready' plans, newest first, current one excluded
      myResponse: "pending"|"accepted", acceptedCount: number,    // Added wave 4: per-member acceptance
      times: TimeSlot[] }             // Added wave 5: proposed times for the plan, soonest first
  // wave 5: activityHistory is de-duplicated by venue + title and never contains the current plan.
  // wave 4: `reasoning` is redacted per viewer — anyone not revealed to the viewer is replaced with "someone new".
  // Meetup members are never redacted (they're in the same room); matched groups keep the rule below.
  // degree and sharedInterests are relative to the viewer (the JWT user)

// CHANGED Sep 26 — BREAKING: previously every member's real displayName + a `via` chain was
// sent regardless of degree. The validated design says you never see anyone past 1st degree
// until you've actually met them (an edge exists in connections) — so the server now redacts:
type GroupMember = {
  id: string | null; displayName: string | null;
  bio: string | null; photoUrl: string | null;   // CHANGED Sep 26, null exactly when displayName is
  degree: number;                  // 0 = you, 1 = met in person, 2+ = network (never shown as a number)
  sharedInterests: string[];       // kept even when redacted — not identifying on its own
  revealed: boolean;
  met: boolean;                    // Added wave 2: a connections edge exists with the viewer (drives "We met")
  accepted: boolean;               // Added wave 4: has accepted the proposed group (true in meetups / once confirmed)
  // CHANGED Sep 26: revealed = degree <= 1 OR the group's status is no longer "proposed". Accepting
  // a proposed group is treated as committing to meet, so a still-degree-2 groupmate becomes
  // revealed the moment the group is confirmed — otherwise ChatScreen (which needs a real sender
  // name) would show identity that GroupScreen was redacting for the same person.
}
// `via` is gone — nobody sees the chain to someone they haven't met. `unrevealedCount` on
// GroupResponse/MatchRunResponse is the count of members with revealed: false, for "+N more
// from your wider network" copy.

// Added Sep 26 — a proposed group ("status: proposed") previously had no way to decline.
POST /api/groups/:id/respond
  { accept: boolean }
  → { ok: true }
  // CHANGED wave 4: accept: true records ONLY the caller's acceptance (group_members.accepted_at); the group's
  // status flips to "confirmed" when every remaining member has accepted (the requester counts as accepted from
  // the start). accept: false removes only the caller — others may still want it — and re-checks, so the last
  // holdout declining can confirm the rest. A group left with one member stays proposed (the app says everyone
  // else passed). Idempotent.

// Added wave 4: any member can rename a group or meetup (a meetup's events.name follows).
PUT  /api/groups/:id
  { name: string }              // 1–60 chars
  → { ok: true }

// Added Sep 26 — marks the hangout done; starts the 24h chat/photo archive clock.
// CHANGED wave 2 (team decision): who gets connected depends on the kind. Ending a *meetup* connects every
// pair of members (met_context 'event') and closes its code. Completing a *matched* group connects nobody —
// edges there form only through the per-person "We met" (POST /api/connections, context 'group').
POST /api/groups/:id/complete
  → { ok: true }

// Added wave 2: drop out of a proposed/confirmed group or a live meetup. 409 group_completed once it's history.
// CHANGED wave 3: leaving a live meetup also deletes the leaver's `connections` rows whose event_id is that
// meetup — the edges it made (End meetup, lobby "We met", QR scans while it was active). A connection that
// existed before (different or null event_id) is never touched; both edge writers keep the original row on
// conflict, so event_id always says where an edge was FIRST made.
POST /api/groups/:id/leave
  → { ok: true }

// Added wave 2: Gemini-written conversation starters for exactly who's in the group (text only). Any member
// can regenerate; the set replaces the previous one and comes back on GET /api/groups/:id.
POST /api/groups/:id/icebreakers
  → { icebreakers: string[] }

// ---- Activity -------------------------------------------------------------
// CHANGED Sep 26 (wave 2, legacy Netlify plan): plan generation is a resumable job. The chain (Gemini with Maps
// grounding → Places → Ticketmaster fallback → fixture) can't fit one 10s function and Background Functions aren't
// on the team's plan, so POST /activity only STARTS the job and returns a placeholder Activity with status
// 'generating' (GroupResponse.activityStatus = 'generating'). The app then calls /advance until it's 'ready';
// each advance runs exactly one external call inside its own function budget, and the last one writes the plan.
// Any member's device can advance; an abandoned job resumes when the group is next opened; a fresh running job
// is not restarted by a second POST /activity.
POST /api/groups/:id/activity
  → Activity                     // status 'generating' until the job finishes (mock mode: the finished plan)

POST /api/groups/:id/activity/advance
  → { status: "generating"|"ready"|"failed",
      stage: "grounded"|"grounded_lite"|"places"|"ticketmaster"|"fixture" | null,   // what runs next
      activity: Activity | null }  // the plan once status is 'ready'
  // 404 activity_not_found before any POST /activity. A concurrent advance returns status 'generating' with
  // the current stage and does no work (the running one holds a short lock).

// Added wave 3: plans are kept, not replaced. Bring an earlier one (from GroupResponse.activityHistory) back as
// the current plan. 404 activity_not_found otherwise.
// CHANGED wave 5: the row itself moves to the top (created_at = now) instead of being copied — copying left the
// original in history, so every switch added a duplicate under "Earlier plans". The restored plan keeps its id.
POST /api/groups/:id/activity/restore
  { activityId: string } → Activity

// ---- When (Added wave 5) -----------------------------------------------------
// The calendar moved off "Host a meetup" (you're already with those people) onto the plan: members propose
// times, mark which they're free for, and any member locks one in — that becomes groups.scheduled_at (and the
// meetup's events.scheduled_at), shown on Home and the group screen, and everyone else gets event_changed
// { change: "time" }. Every route returns the full list. Membership required; 403 hangout_archived once
// completedAt + 24h has passed.
POST   /api/groups/:id/times
  { startsAt: string, note?: string }   // ISO 8601; rounded to the minute; idempotent on (group, minute)
  → { times: TimeSlot[] }               // the proposer is automatically free for their own time
POST   /api/groups/:id/times/:timeId/vote
  { available: boolean } → { times: TimeSlot[] }   // idempotent
POST   /api/groups/:id/times/:timeId/choose
  → { times: TimeSlot[] }               // sets scheduledAt; notifies the others
DELETE /api/groups/:id/times/:timeId
  → { times: TimeSlot[] }               // 403 not_proposer unless you proposed it; unschedules if it was chosen

type TimeSlot = {
  id: string; startsAt: string; note: string | null;
  proposedById: string; proposedByName: string;
  availableIds: string[]; availableNames: string[];   // everyone who said they're free
  imAvailable: boolean;                               // the viewer's own answer
  chosen: boolean;                                    // the locked-in one (== GroupResponse.scheduledAt)
}

type Activity = {
  id?: string; createdAt?: string;   // Added wave 3: set on saved plans (history + restore); absent on a fresh model reply
  title: string; venue: string; address: string;
  lat: number; lng: number;
  priceCents: number | null; startsAt: string | null;
  source: "maps" | "ticketmaster"; sourceUrl: string | null;
  reasoning: string;
}

// ---- Chat -----------------------------------------------------------------
GET  /api/groups/:id/messages?since=<iso>
  → { messages: { id, senderId, senderName, body, createdAt }[] }
  // senderName follows the same revealed rule as GroupMember above (via lib/groups.ts's
  // loadGroup) — "Someone" for a still-redacted sender, which in practice only applies to a
  // 'proposed' group (chat is reachable there too, not just confirmed/completed).

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
// CHANGED wave 3: the app no longer uses these per-group routes. Exchange lives on Your Circle (1st degree) and is
// keyed on the connection pair — see POST /api/graph/exchange below. These stay for compatibility.
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
  → { photos: { id, uploaderId, uploaderName, storagePath, url, createdAt }[] }
  // wave 2: `url` is a signed read URL (~1h) for the private `event-photos` bucket; null if signing failed.

POST /api/groups/:id/photos
  { storagePath: string }        // client uploads the image to Supabase Storage first, then
  → { photos: [...] }            // posts the resulting path here — wave 2: must be `<groupId>/<file>` inside
                                 // the event-photos bucket (storage policies in migration 0007 enforce the same)
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
  | "event_changed"                                                    // Added wave 5

// CHANGED wave 5: rows are actually written now (apps/server/src/lib/notify.ts — the only writer). Who gets what:
//   hangout_invited     every other member when a matched group is proposed (POST /match/run, admin batch)
//                       payload { groupId, memberCount }            — no names: the recipient may not have met them
//   hangout_forming     every member when the last person accepts    payload { groupId, name, memberCount }
//   connection_added    the other person when you tap "We met"       payload { peerId, peerName, eventId?, context }
//                       each member when a meetup ends and they gained 1st degrees   payload { groupId, eventId, eventName, count }
//   exchange_requested  the peer, the first time you say yes         payload { peerId, peerName, groupId? }
//   exchange_accepted   the peer, when your yes completes the pair   (same payload; a re-tap never re-notifies)
//   event_changed       every other member of a group or meetup      payload { groupId, name, change, detail? }
//                       change: "renamed" (detail = new name) | "time" (detail = ISO startsAt) | "plan" (detail = title) | "ended"
//   message_received / feedback_prompt: still nothing writes these.
// Each kind is gated by the recipient's settings (below); the server drops rows they turned off.

// Added wave 5: the client has no update grant on notifications, so marking read goes through the server.
POST /api/notifications/read
  → { ok: true }                    // every unread row of the caller

// Added wave 5: per-kind toggles, stored on profiles.notification_settings (also on GET /api/me).
GET  /api/notifications/settings
  → { settings: NotificationSettings }
PUT  /api/notifications/settings
  Partial<NotificationSettings> → { settings: NotificationSettings }   // merged over the current values

type NotificationSettings = {
  hangouts: boolean;   // hangout_invited + hangout_forming
  exchange: boolean;   // exchange_requested + exchange_accepted
  met: boolean;        // connection_added
  changes: boolean;    // event_changed
}
```

---

## Internal AI services

Server-side only. Never exposed to the client, never called from the app.

```ts
embedProfile(userId: string): Promise<void>
  // interests + aiParagraph + derived tags → gemini-embedding-001 @ 768 dims
  // → upsert profile_embeddings
  // wave 3: 'avoid' tags are embedded on their own "Prefers to skip:" line, never under "Interests:".

formGroups(input: {
  requesterId: string;
  candidates: { id, displayName, degree, interests, prefs }[];
  sizeRange: { min: number; max: number };
}): Promise<{ memberIds: string[]; reasoning: string }>
  // Gemini Flash. Size range is a SOFT constraint — best effort, not a hard cut.
  // On failure: fall back to top-N by vector similarity. Matching never hard-fails.

generateActivity(input: {
  members: { displayName, interests, avoids }[];       // avoids: Added wave 3 — the member's 'avoid' tags
  constraints: { maxCostCents, maxTravelMi, city, lat, lng };
  previousVenues: string[];                            // Added wave 3 — never suggested again for this group
}): Promise<Activity>
  // Gemini Flash + Maps grounding. Ticketmaster is a secondary source.
  // wave 3: every member's avoids become HARD RULES in the prompt (e.g. "Alcohol" → no bars/pubs/breweries…), a
  // grounded reply that still names an alcohol-centred venue is rejected before Places, and Ticketmaster events
  // are filtered the same way. Previously avoids were passed as interests, which is why pubs got recommended.
  // wave 5: budget and distance are HARD CONSTRAINTS too (the prompt carries the centre coordinates and the
  // shared interests), and the assembled plan is checked — farther than maxTravelMi (+15%) or dearer than
  // maxCostCents throws a ConstraintError. In the staged job a rejection goes back to the grounded stage with
  // "Rejected — do not pick these…" in the prompt (job.rejected, max 2) before the chain falls through.

analyzeFeedback(freeText: string): Promise<{
  tags: { label: string; kind: "derived" }[];
  sentiment: "positive" | "neutral" | "negative";
}>
  // Output feeds profile_tags, then triggers re-embedding. This is the loop.
```

---

## Writes that bypass the server (Storage only — Added wave 2)

The client uploads image bytes **directly to Supabase Storage** under the storage policies in migration 0007, then tells the API about the object: `event-photos/<groupId>/<file>` (private bucket; only members of that group may write or read the folder; the API returns signed URLs) and `avatars/<userId>/<file>` (public bucket; only the owner may write; the public URL is saved via `PUT /api/profile` `photoUrl`). No client ever writes a database row.

## Reads that bypass the server

The client reads these **directly from Supabase** with the anon key, under RLS — no server round-trip:

- own profile and preferences
- group member list for groups you belong to
- chat messages (via Supabase Realtime subscription) — **wave 2:** the app must call `supabase.realtime.setAuth(session.access_token)` before subscribing. Verified Sep 26 against the shared project: without it the channel reports `SUBSCRIBED` but RLS evaluates as `anon` and no row is ever delivered; with it the insert arrives. That was the "chat never updates live" bug.
- your own notifications (via Supabase Realtime subscription) — Added Sep 26

**Everything else, and every write, goes through the API server.**

---

## Conventions

- All timestamps ISO 8601 UTC.
- Money in **integer cents**. No floats.
- Errors: `{ error: { code: string, message: string } }` with a real HTTP status.
- `POST /api/connections` and `POST /api/events/:code/join` are **idempotent** — people will scan twice.
