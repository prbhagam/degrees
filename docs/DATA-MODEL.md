# Data model

**Degrees** · Postgres via Supabase, with pgvector.

Owned by Sahith. Argue with it at H0, then freeze — four people build against it.

Implemented in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql). Its header lists every addition beyond this doc (UUID defaults, `event_attendees` FKs, enum checks, indexes, RLS policies, the Realtime publication).

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
  created_at    timestamptz default now()
)

profile_tags (
  id            bigserial primary key,
  user_id       uuid references profiles,
  label         text not null,
  kind          text not null      -- 'hobby' | 'activity' | 'derived'
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
  frequency       text,            -- 'daily' | 'weekly' | 'monthly'
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
  id            uuid primary key,
  room_code     text unique not null,
  name          text,
  city          text,
  created_by    uuid references profiles,
  created_at    timestamptz default now()
)

event_attendees (event_id uuid, user_id uuid, joined_at timestamptz,
                 primary key (event_id, user_id))

-- Matching output ---------------------------------------------------------
groups (
  id            uuid primary key,
  formed_at     timestamptz default now(),
  reasoning     text,              -- Gemini's explanation, shown in the UI
  status        text               -- 'proposed' | 'confirmed' | 'completed'
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
  would_meet_again  boolean not null,
  primary key (feedback_id, peer_id)
)
```

---

## Notes

**`connections` is the whole product.** Canonical ordering (`user_a < user_b`) keeps each edge stored once. Always insert with the pair pre-sorted, or you get duplicate edges and the degree math breaks.

**Degree traversal** is a recursive CTE over `connections`, depth-capped by the requester's `max_degrees`. Cap at 3 — beyond that the pool stops being meaningful and the query stops being fast.

**`feedback_peers` is separate from `event_feedback`** because the rematch signal is per person while the rating is per event. That split is what makes "would meet again" usable as a matching input rather than a vanity metric.

**Embedding source** is interests + AI paragraph + `derived` tags from feedback. Re-embed a profile after feedback is analyzed — that's the loop that makes matches improve.

**`vector(768)`**, not 3072 — see [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-ai-call-inventory).

**RLS:** on for every table the client reads. Own profile always readable; another user's `bio` readable only when a shared `group_members` row exists.

---

## Seed data

Built **first**, at H0–H2, before any UI exists. Needs to contain:

- ~12 profiles with real-looking interests, embedded
- **a connection graph with genuine 2nd-degree paths** — first-degree alone does not demonstrate *degrees*
- 2 completed groups with feedback already submitted, so the "matching improved because of feedback" beat is demonstrable
- one event with a room code the demo can join live
