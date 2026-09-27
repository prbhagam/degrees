# Data model

**Degrees** · Postgres via Supabase, with pgvector.

Owned by Sahith. Argue with it at H0, then freeze — four people build against it.

Implemented in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql). Its header lists every addition beyond this doc (UUID defaults, `event_attendees` FKs, enum checks, indexes, RLS policies, the Realtime publication).

**CHANGED Sep 26 (wave 2)** — one model for groups and meetups: `groups.kind` (`'matched' | 'meetup'`); every `events` row (the room code) now has a backing `groups` row (`events.group_id`), attendees are `group_members`, codes expire (`events.code_expires_at`) and close on `events.ended_at`; `group_icebreakers`; Storage buckets `event-photos` (private) and `avatars` (public) with policies. Implemented in [`0007_meetups_icebreakers_storage.sql`](../supabase/migrations/0007_meetups_icebreakers_storage.sql), which backfills a group for every existing event. Verified on a throwaway Postgres (`supabase/tests/run-local.sh`); **not yet applied to the shared project** — apply it together with deploying the wave-2 server, since the new join route requires `events.group_id`.

**CHANGED Sep 26** — validated design work added phone/pronouns/photo to profiles, host-created events, mutual-consent contact exchange, event photos, and notifications; redefined `feedback_peers` and widened `preferences.frequency`. Implemented additively in [`supabase/migrations/0006_contact_events_photos_notifications.sql`](../supabase/migrations/0006_contact_events_photos_notifications.sql) (renumbered from 0003 while rebasing onto main, which had independently added 0003–0005; this migration also redefines `match_narrow` to score the renamed `relationship` field instead of `would_meet_again`) — **unverified against a real Postgres/Supabase project**; apply to a dev project before the shared one. Every change below is marked inline.

---

## Schema

```sql
-- People ------------------------------------------------------------------
profiles (
  id            uuid primary key references auth.users,
  username      text unique not null,
  display_name  text,
  bio           text,              -- visible only to matched users
  ai_paragraph  text,              -- freeform onboarding input, embedded
  city          text,
  lat, lng      double precision,
  phone         text,              -- CHANGED Sep 26: collected at signup, event day-of confirmation
  pronouns      text,              -- CHANGED Sep 26: optional
  photo_url     text,              -- CHANGED Sep 26: optional, Supabase Storage
  created_at    timestamptz default now()
)

profile_tags (
  id            bigserial primary key,
  user_id       uuid references profiles,
  label         text not null,
  kind          text not null      -- 'hobby' | 'activity' | 'derived' | 'avoid' (avoid: CHANGED Sep 26)
)                                  -- 'derived' = inferred by Gemini from feedback

profile_embeddings (
  user_id       uuid primary key references profiles,
  embedding     vector(768) not null,
  updated_at    timestamptz default now()
)

preferences (
  user_id         uuid primary key references profiles,
  cost_min_cents  int,
  cost_max_cents  int,
  max_travel_mi   int,
  frequency       text,            -- 'daily' | 'few_times_week' | 'weekly' | 'biweekly' | 'monthly' (widened Sep 26)
  group_size_min  int,
  group_size_max  int,
  max_degrees     int              -- 1 = met in person only, 2 = mutuals, 3+ = network
)

-- The graph ---------------------------------------------------------------
connections (
  user_a        uuid references profiles,
  user_b        uuid references profiles,
  met_at        timestamptz default now(),
  met_context   text,              -- 'qr' | 'event' | 'group' | 'manual'
  event_id      uuid references events,
  primary key (user_a, user_b),
  check (user_a < user_b)          -- canonical ordering: store each edge once
)

-- Events = meetups' room-code records (CHANGED wave 2) ----------------------
events (
  id                uuid primary key,
  group_id          uuid references groups unique,   -- wave 2: the backing kind='meetup' group
  code_expires_at   timestamptz,   -- wave 2: joins refused after this (24h past scheduled_at, else creation)
  ended_at          timestamptz,   -- wave 2: set by POST /groups/:id/complete on a meetup; closes the code
  room_code         text unique not null,
  name              text,
  city              text,
  created_by        uuid references profiles,
  description       text,          -- CHANGED Sep 26: host's plan, shown before people join
  scheduled_at      timestamptz,   -- CHANGED Sep 26
  group_size_min    int,           -- CHANGED Sep 26: host's target range
  group_size_max    int,           -- CHANGED Sep 26
  created_at        timestamptz default now()
)

event_attendees (event_id uuid, user_id uuid, joined_at timestamptz,
                 primary key (event_id, user_id))

-- Groups: matched (auto-generated, non-joinable) AND meetups (joinable) ---
groups (
  id            uuid primary key,
  kind          text not null default 'matched',   -- wave 2: 'matched' | 'meetup'
  name          text,              -- wave 2: meetups carry the host's name for it
  created_by    uuid references profiles,          -- wave 2: meetup host
  scheduled_at  timestamptz,       -- wave 2: when the meetup happens
  formed_at     timestamptz default now(),
  reasoning     text,              -- Gemini's explanation, shown in the UI (matched only)
  status        text,              -- 'proposed' | 'confirmed' | 'completed' (meetups start 'confirmed')
  completed_at  timestamptz        -- CHANGED Sep 26: chat + photos go read-only 24h after this
)

-- wave 2: activities also carries `status` ('generating' | 'ready' | 'failed', migration 0008) and `job` jsonb
-- (migration 0009) — the resumable stage state of a plan being generated one function call at a time.

-- wave 2: Gemini-written conversation starters, one ordered set per group (regenerating replaces it)
group_icebreakers (
  id            uuid primary key,
  group_id      uuid references groups,
  position      int,
  prompt        text not null,
  created_at    timestamptz default now(),
  unique (group_id, position)
)

group_members (
  group_id      uuid references groups,
  user_id       uuid references profiles,
  degree        int,               -- degrees of separation from the requesting user
  accepted_at   timestamptz,       -- wave 4 (0011): null until this member accepts; the group confirms when none are null
  primary key (group_id, user_id)
)

activities (
  id            uuid primary key,
  group_id      uuid references groups,
  title         text,
  venue         text,
  address       text,
  lat, lng      double precision,
  price_cents   int,
  starts_at     timestamptz,
  source        text,              -- 'maps' | 'ticketmaster'
  source_url    text,
  reasoning     text,
  created_at    timestamptz default now()   -- wave 3 (0010): plans are kept; newest row = current, older 'ready' rows = history
)

-- Chat --------------------------------------------------------------------
messages (
  id            bigserial primary key,
  group_id      uuid references groups,
  sender_id     uuid references profiles,
  body          text not null,
  created_at    timestamptz default now()
)

-- Feedback (the memory-building step) -------------------------------------
event_feedback (
  id                uuid primary key,
  group_id          uuid references groups,
  author_id         uuid references profiles,
  rating            int,           -- simple scale, 1-5
  free_text         text,          -- optional; analyzed by Gemini
  analyzed_tags     jsonb,         -- Gemini output, feeds profile_tags as 'derived'
  created_at        timestamptz default now(),
  unique (group_id, author_id)
)

feedback_peers (
  feedback_id       uuid references event_feedback,
  peer_id           uuid references profiles,
  relationship      text not null,  -- CHANGED Sep 26 — BREAKING: replaces would_meet_again boolean.
                                     -- 'great' | 'fine' | 'not_for_me'
  primary key (feedback_id, peer_id)
)

-- Added Sep 26 -------------------------------------------------------------

-- Mutual-consent phone reveal. No client grants at all — the API computes and
-- returns a phone number only once both sides have accepted; the client never
-- reads this table directly.
contact_exchanges (
  group_id          uuid references groups,
  user_a            uuid references profiles,
  user_b            uuid references profiles,
  a_accepted        boolean not null default false,
  b_accepted        boolean not null default false,
  created_at        timestamptz default now(),
  primary key (group_id, user_a, user_b),
  check (user_a < user_b)          -- same canonical-ordering convention as connections
)

-- wave 3 (0010): the same idea keyed on the connection pair instead of a group, for Your Circle. Zero client grants.
connection_contacts (
  user_a            uuid references profiles,
  user_b            uuid references profiles,
  a_accepted        boolean not null default false,
  b_accepted        boolean not null default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
)

-- Actual image bytes live in Supabase Storage; this is just the pointer + who/when.
event_photos (
  id                uuid primary key,
  group_id          uuid references groups,
  uploader_id       uuid references profiles,
  storage_path      text not null,
  created_at        timestamptz default now()
)

-- Client-readable (RLS: user_id = auth.uid()), server-written only. In the
-- Realtime publication like messages, so the client subscribes rather than polls.
notifications (
  id                uuid primary key,
  user_id           uuid references profiles,
  type              text not null,   -- hangout_invited | hangout_forming | message_received |
                                      -- feedback_prompt | exchange_requested | exchange_accepted |
                                      -- connection_added
  payload           jsonb not null default '{}',
  read              boolean not null default false,
  created_at        timestamptz default now()
)
```

---

## Notes

**`connections` is the whole product.** Canonical ordering (`user_a < user_b`) keeps each edge stored once. Always insert with the pair pre-sorted, or you get duplicate edges and the degree math breaks.

**Degree traversal** is a recursive CTE over `connections`, depth-capped by the requester's `max_degrees`. Cap at 3 — beyond that the pool stops being meaningful and the query stops being fast.

**`feedback_peers` is separate from `event_feedback`** because the rematch signal is per person while the rating is per event. That split is what makes "would meet again" usable as a matching input rather than a vanity metric.

**Embedding source** is interests + AI paragraph + `derived` tags from feedback. Re-embed a profile after feedback is analyzed — that's the loop that makes matches improve.

**`vector(768)`**, not 3072 — see [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-ai-call-inventory).

**RLS:** on for every table the client reads. Own profile always readable; another user's `bio` readable only when a shared `group_members` row exists. `lat`/`lng` are never readable by clients (column grants, migration 0005) — only the server reads location.

**CHANGED Sep 26 — identity is redacted past 1st degree, at the API layer, not RLS.** `group_members.degree` is unchanged (matching still reasons over the full graph up to `max_degrees`), but `GET /api/groups/:id` and `POST /api/match/run` now null out `id`/`displayName`/`bio`/`photoUrl` for any member with `degree > 1` **and** whose group is still `status: 'proposed'` — `revealed = degree <= 1 || status !== 'proposed'`. Accepting a proposed group is treated as committing to meet, so a still-degree-2 groupmate is revealed the moment the group is confirmed (otherwise chat, which needs a real sender name to coordinate, would show identity that the group view was redacting for the same person). `GET /api/groups/:id/messages`' `senderName` follows this same computed set. See [API-CONTRACTS.md](./API-CONTRACTS.md). This is enforced in `apps/server/src/lib/groups.ts`, not a new RLS policy, since the redaction is per-viewer, per-request, and (for the status half) per-group-state, not a fixed row-level rule.

**CHANGED Sep 26 (wave 2) — which hangouts form edges.** Team decision: a *meetup* is people who scanned a code in the same room, so ending it (`POST /api/groups/:id/complete` on a kind='meetup' group) inserts a `connections` row for every pair of members (`met_context = 'event'`, `event_id` set) and stamps `events.ended_at`. A *matched* group is auto-generated, so completing it connects nobody; its edges form only through the explicit per-person "We met" (`POST /api/connections`, `met_context = 'group'`), which the group screen offers once the group is confirmed. (This reverses the earlier "completing a matched group connects everyone" rule.)

**Meetup codes expire.** `events.code_expires_at` is 24h after `scheduled_at` (or after creation when unscheduled); `POST /api/events/:code/join` answers 410 after that or once `ended_at` is set. Existing members can still open the lobby.

**Added Sep 26 — the event lobby is a display-only exception, not a graph exception.** `POST /api/events/:roomCode/join` returns real name/bio/photo for every attendee regardless of the connections graph (Charles: co-presence at an event is enough to show basic info in the lobby). It deliberately does **not** insert `connections` rows for the whole room — that stays the explicit, one-at-a-time "We met" action (`JoinRoomScreen` → `POST /api/connections`, `met_context: 'event'`), which is what Circle's degree math and the redaction rule above actually depend on. Considered and rejected: auto-connecting every co-attendee pair on join, which would make Circle show people you never actually talked to as "met."

**Contact exchange never has client grants.** `contact_exchanges` and `connection_contacts` (wave 3) have RLS enabled but zero policies — every read and write goes through the API server (service-role), because whether a phone number is revealed must be computed server-side from both `a_accepted`/`b_accepted` flags, never trusted from the client. Wave 3 moved the feature to Your Circle and keyed it on the pair, so a swapped number outlives the group it happened in.

**`profile_tags.kind = 'avoid'` is a constraint, not an interest (wave 3).** Every reader splits by kind: the planner turns avoids into hard rules, icebreakers and the match reasoning ignore them, `match_narrow` (redefined in 0010) leaves them out of `interests`, and the embedding puts them on their own "Prefers to skip:" line. Before 0010 they were aggregated with everything else, which is how "avoid alcohol" produced pub recommendations.

**Every member accepts for themselves (wave 4).** `groups.status` stays `proposed` until every `group_members.accepted_at` is set; `match_create_group` (redefined in 0011) creates the requester's row already accepted, meetup joins set it on insert, and `POST /api/groups/:id/respond` sets the caller's. One person's yes no longer confirms the group for everyone. Redaction is unchanged: names past 1st degree unlock when the group confirms, i.e. when everyone is in.

**"Why this group" is redacted per viewer (wave 4).** The reasoning is stored once per group but served through `redactReasoning()` (lib/groups.ts) in `GET /groups/:id`, `POST /match/run`, and `GET /hangouts`, replacing the full and first names of anyone the viewer hasn't met with "someone new". `formGroups` is also told never to name a degree-2+ member and falls back to the deterministic text if it does; the deterministic text now describes the group's shape (who you know, how many are new and through whom, shared ground).

**Leaving a meetup undoes only its own edges (wave 3).** `POST /api/groups/:id/leave` on a live meetup deletes the leaver's `connections` rows where `event_id` is that meetup's event. Because `POST /api/connections` and the end-of-meetup upsert both `ON CONFLICT DO NOTHING`, an edge's `event_id` records where it was first made — so a pair that already knew each other keeps their original row and is unaffected. Lobby "We met" taps send `eventId` for exactly this reason. Completed hangouts still can't be left.

**Plans are kept (wave 3).** `activities` holds every plan a group generated; the newest row is the current plan and older `ready` rows are `GroupResponse.activityHistory`. `saveActivity` deletes only `generating`/`failed` placeholders. The planner is told the previous venues so "Suggest something else" can't repeat one.

**Realtime (wave 3):** `group_members` (FULL replica identity, so DELETE events carry `group_id`) and `groups` are in `supabase_realtime`, alongside `messages`, `notifications`, and `activities`. The group screen subscribes to all three with the JWT set on the socket, so a join, a leave, or "End meetup" reaches everyone already there without a refresh.

**Storage (wave 2, migration 0007).** Two buckets, created and policed by SQL: `event-photos` (private; objects live at `<group_id>/<file>`; `storage.objects` policies let `authenticated` insert/select only where `is_group_member(<folder>)`; the API returns signed URLs) and `avatars` (public; `<user_id>/<file>`; only the owner may insert/update/delete; the public URL is stored in `profiles.photo_url`). Avatars are public by design: the URL is unguessable and the app shows photos to groupmates and 1st-degree connections anyway.

---

## Seed data

Built **first**, at H0–H2, before any UI exists. Needs to contain:

- ~12 profiles with real-looking interests, embedded
- **a connection graph with genuine 2nd-degree paths** — first-degree alone does not demonstrate *degrees*
- 2 completed groups with feedback already submitted, so the "matching improved because of feedback" beat is demonstrable
- one event with a room code the demo can join live
