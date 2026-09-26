# Data model

**Degrees** · Postgres via Supabase, with pgvector.

Owned by Sahith. Argue with it at H0, then freeze — four people build against it.

Implemented in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql). Its header lists every addition beyond this doc (UUID defaults, `event_attendees` FKs, enum checks, indexes, RLS policies, the Realtime publication).

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

-- Events (icebreakers) ----------------------------------------------------
events (
  id                uuid primary key,
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

-- Matching output ---------------------------------------------------------
groups (
  id            uuid primary key,
  formed_at     timestamptz default now(),
  reasoning     text,              -- Gemini's explanation, shown in the UI
  status        text,              -- 'proposed' | 'confirmed' | 'completed'
  completed_at  timestamptz        -- CHANGED Sep 26: chat + photos go read-only 24h after this
)

group_members (
  group_id      uuid references groups,
  user_id       uuid references profiles,
  degree        int,               -- degrees of separation from the requesting user
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
  reasoning     text
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

**CHANGED Sep 26 — attending a hangout forms the edge.** `POST /api/groups/:id/complete` (host or any member marks the hangout done) now inserts a `connections` row for every pair of confirmed `group_members`, `met_context = 'group'`. This is in addition to the existing QR/event-join paths, and is what makes newly-revealed groupmates show up in `GET /api/graph/me` afterward.

**Added Sep 26 — the event lobby is a display-only exception, not a graph exception.** `POST /api/events/:roomCode/join` returns real name/bio/photo for every attendee regardless of the connections graph (Charles: co-presence at an event is enough to show basic info in the lobby). It deliberately does **not** insert `connections` rows for the whole room — that stays the explicit, one-at-a-time "We met" action (`JoinRoomScreen` → `POST /api/connections`, `met_context: 'event'`), which is what Circle's degree math and the redaction rule above actually depend on. Considered and rejected: auto-connecting every co-attendee pair on join, which would make Circle show people you never actually talked to as "met."

**Contact exchange never has client grants.** `contact_exchanges` has RLS enabled but zero policies — every read and write goes through the API server (service-role), because whether a phone number is revealed must be computed server-side from both `a_accepted`/`b_accepted` flags, never trusted from the client.

**`event_photos`' bucket is a manual step.** The table above only stores the pointer; creating the Supabase Storage bucket (e.g. `event-photos`) and its access policy is a dashboard/CLI action, not something this migration does.

---

## Seed data

Built **first**, at H0–H2, before any UI exists. Needs to contain:

- ~12 profiles with real-looking interests, embedded
- **a connection graph with genuine 2nd-degree paths** — first-degree alone does not demonstrate *degrees*
- 2 completed groups with feedback already submitted, so the "matching improved because of feedback" beat is demonstrable
- one event with a room code the demo can join live
