-- Owner: Sahith (Data & Matching) — generated from docs/DATA-MODEL.md's Sep 26 update.
-- Renumbered 0003 -> 0006 while rebasing onto main: main had independently added
-- 0003_matching_functions.sql, 0004_meet_again_boost.sql, and 0005_profile_location_privacy.sql,
-- which collided with this file's original number and, for feedback_peers, its assumptions below.
-- Additive only: no column is dropped or renamed on an existing row's data, per this folder's own
-- rule to never edit 0001 once applied. Two exceptions, called out explicitly:
--   * feedback_peers.would_meet_again -> relationship: packages/shared's feedbackRequestSchema
--     changed shape in the same PR (see docs/API-CONTRACTS.md). Unlike the original draft of this
--     migration, 0002_seed_georgia_tech_demo.sql DOES seed this column (two completed demo
--     groups' feedback) and 0004_meet_again_boost.sql's match_narrow reads it for the meet-again
--     boost — so this backfills relationship from the existing boolean instead of dropping it
--     blind, and redefines match_narrow to match (signature, filters, and other output columns
--     are identical to 0004; only pair_feedback's boolean check becomes a relationship check).
--   * preferences.frequency and profile_tags.kind check constraints are replaced (widened, not
--     narrowed) to accept the new enum values from packages/shared/src/schemas.ts.
-- UNVERIFIED against a real Postgres/Supabase project from this change — apply to a dev project
-- first. Constraint names below assume Postgres's default `<table>_<column>_check` naming for an
-- unnamed inline CHECK, as used in 0001; confirm before applying to the shared project.

-- ---- profiles: phone (required going forward, nullable here since existing rows have none yet),
--      pronouns (optional), photo_url (optional) ---------------------------------------------
alter table public.profiles
  add column if not exists phone text,
  add column if not exists pronouns text,
  add column if not exists photo_url text;

-- ---- profile_tags: 'avoid' joins hobby/activity/derived as a tag kind ------------------------
alter table public.profile_tags
  drop constraint if exists profile_tags_kind_check;
alter table public.profile_tags
  add constraint profile_tags_kind_check
  check (kind in ('hobby', 'activity', 'derived', 'avoid'));

-- ---- preferences: frequency gains biweekly + few_times_week ----------------------------------
alter table public.preferences
  drop constraint if exists preferences_frequency_check;
alter table public.preferences
  add constraint preferences_frequency_check
  check (frequency in ('daily', 'few_times_week', 'weekly', 'biweekly', 'monthly'));

-- ---- groups: when the hangout wrapped up. Chat and photos go read-only 24h after this. -------
alter table public.groups
  add column if not exists completed_at timestamptz;

-- ---- events: host-set fields, previously only settable by seed/manual insert -----------------
alter table public.events
  add column if not exists description text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists group_size_min int,
  add column if not exists group_size_max int;

-- ---- event_feedback: sentiment (previously computed but never stored) ------------------------
alter table public.event_feedback
  add column if not exists sentiment text check (sentiment in ('positive', 'neutral', 'negative'));

-- ---- feedback_peers: would_meet_again (boolean) -> relationship (3-way) ----------------------
-- BREAKING, see header. Backfills existing rows (0002's demo feedback) rather than dropping blind:
-- true -> 'great', false -> 'not_for_me'. 'fine' has no boolean equivalent and only appears for
-- feedback submitted after this migration.
alter table public.feedback_peers
  add column if not exists relationship text;
update public.feedback_peers
  set relationship = case when would_meet_again then 'great' else 'not_for_me' end
  where relationship is null;
alter table public.feedback_peers
  drop constraint if exists feedback_peers_relationship_check;
alter table public.feedback_peers
  add constraint feedback_peers_relationship_check
  check (relationship in ('great', 'fine', 'not_for_me'));
alter table public.feedback_peers
  alter column relationship set not null;
alter table public.feedback_peers
  drop column if exists would_meet_again;

-- match_narrow's pair_feedback CTE reads would_meet_again directly (0003/0004) — redefine it against
-- relationship. Identical to 0004 in every other respect (signature, filters, output columns, the
-- 0.25-per-yes boost).
create or replace function public.match_narrow(
  p_requester uuid,
  p_candidate_ids uuid[],
  p_cost_min_cents int,
  p_cost_max_cents int,
  p_max_travel_mi int,
  p_limit int default 12
)
returns table (
  id uuid,
  display_name text,
  interests text[],
  similarity double precision,
  distance_mi double precision,
  meet_again_score int,
  cost_min_cents int,
  cost_max_cents int,
  max_travel_mi int,
  frequency text,
  group_size_min int,
  group_size_max int,
  max_degrees int,
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with requester as (
    select p.lat, p.lng, e.embedding
    from public.profiles p
    left join public.profile_embeddings e on e.user_id = p.id
    where p.id = p_requester
  ),
  candidates as (
    select distinct c.person
    from unnest(p_candidate_ids) as c(person)
    where c.person is not null and c.person <> p_requester
  ),
  -- Tags and feedback are aggregated per candidate before joining so neither multiplies the other.
  tags as (
    select t.user_id, array_agg(distinct t.label order by t.label) as labels
    from public.profile_tags t
    join candidates c on c.person = t.user_id
    group by t.user_id
  ),
  pair_feedback as (
    select
      case when f.author_id = p_requester then fp.peer_id else f.author_id end as person,
      (count(*) filter (where fp.relationship = 'great'))::int as yes_count,
      bool_or(fp.relationship = 'not_for_me') as any_no
    from public.feedback_peers fp
    join public.event_feedback f on f.id = fp.feedback_id
    where (f.author_id = p_requester and fp.peer_id = any(p_candidate_ids))
       or (fp.peer_id = p_requester and f.author_id = any(p_candidate_ids))
    group by 1
  ),
  scored as (
    select
      c.person,
      p.display_name,
      coalesce(t.labels, '{}'::text[]) as labels,
      (1 - (e.embedding <=> r.embedding))::double precision as sim,
      case
        when r.lat is null or r.lng is null or p.lat is null or p.lng is null then null
        else (3958.8 * 2 * asin(sqrt(
          power(sin(radians(p.lat - r.lat) / 2), 2)
          + cos(radians(r.lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - r.lng) / 2), 2)
        )))::double precision
      end as dist,
      coalesce(pf.yes_count, 0) as yes_count,
      coalesce(pf.any_no, false) as any_no,
      pr.cost_min_cents as c_min,
      pr.cost_max_cents as c_max,
      pr.max_travel_mi as c_travel,
      pr.frequency as c_frequency,
      pr.group_size_min as c_size_min,
      pr.group_size_max as c_size_max,
      pr.max_degrees as c_max_degrees
    from candidates c
    join public.profiles p on p.id = c.person
    left join requester r on true
    left join public.profile_embeddings e on e.user_id = c.person
    left join public.preferences pr on pr.user_id = c.person
    left join tags t on t.user_id = c.person
    left join pair_feedback pf on pf.person = c.person
  ),
  kept as (
    select s.*
    from scored s
    -- `is not false` keeps rows where either side of a comparison is NULL; least() ignores a NULL argument.
    where not s.any_no
      and (p_cost_min_cents <= s.c_max and s.c_min <= p_cost_max_cents) is not false
      and (s.dist <= least(p_max_travel_mi, s.c_travel)) is not false
  ),
  ranked as (
    select k.*,
      case
        when k.sim is null then 0
        when max(k.sim) over () - min(k.sim) over () < 1e-9 then 0.5
        else (k.sim - min(k.sim) over ()) / (max(k.sim) over () - min(k.sim) over ())
      end as rel_sim
    from kept k
  )
  select
    r.person,
    r.display_name,
    r.labels,
    r.sim,
    r.dist,
    r.yes_count,
    r.c_min,
    r.c_max,
    r.c_travel,
    r.c_frequency,
    r.c_size_min,
    r.c_size_max,
    r.c_max_degrees,
    (r.rel_sim + 0.25 * least(r.yes_count, 2))::double precision as rank_score
  from ranked r
  order by rank_score desc, r.person
  limit greatest(coalesce(p_limit, 12), 1);
$$;

-- create or replace keeps existing privileges; restated so this file stands alone.
revoke all on function public.match_narrow(uuid, uuid[], int, int, int, int) from public, anon, authenticated;
grant execute on function public.match_narrow(uuid, uuid[], int, int, int, int) to service_role;

-- ---- contact_exchanges: mutual-consent phone reveal, gated in the API, never client-readable -
create table if not exists public.contact_exchanges (
  group_id uuid references public.groups(id),
  user_a uuid references public.profiles(id),
  user_b uuid references public.profiles(id),
  a_accepted boolean not null default false,
  b_accepted boolean not null default false,
  created_at timestamptz default now(),
  primary key (group_id, user_a, user_b),
  check (user_a < user_b)
);
alter table public.contact_exchanges enable row level security;
-- No policies: this table has zero client grants. The server (service-role key) is the only
-- reader/writer, because revealing a phone number must be computed server-side, never trusted
-- from a client-supplied "both accepted" flag.

-- ---- event_photos: per-event, per-group photo uploads ----------------------------------------
create table if not exists public.event_photos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id),
  uploader_id uuid references public.profiles(id),
  storage_path text not null,
  created_at timestamptz default now()
);
alter table public.event_photos enable row level security;
create policy "event_photos_select_member"
on public.event_photos for select to authenticated
using (public.is_group_member(group_id));
grant select on public.event_photos to authenticated;
-- The actual image bytes live in Supabase Storage, not this table (storage_path points at a
-- bucket object). Creating the bucket + its policies is a manual/dashboard or CLI step, not
-- something a SQL migration does on its own — see docs/ARCHITECTURE.md.

-- ---- notifications: read directly by the client (RLS below), written only by the server ------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
create policy "notifications_select_own"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.notifications to authenticated;
alter publication supabase_realtime add table public.notifications;
