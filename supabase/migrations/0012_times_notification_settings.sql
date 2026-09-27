-- Owner: Sahith (Data & Matching) — Sep 26 wave 5 (third testing round).
--
--   * profiles.notification_settings: per-kind toggles ({ hangouts, exchange, met, changes }; a missing key
--     means on). Read by the server's notify() before it writes a notifications row. Not client-readable
--     (0005's column list stands); the app gets it via GET /api/me and sets it via PUT /api/notifications/settings.
--   * group_times + group_time_votes: the calendar moved off "Host a meetup" onto the generated plan. Members
--     propose times for the plan, mark which they're free for, and any member locks one in
--     (groups.scheduled_at, which already exists from 0007). Readable by group members (so Realtime delivers
--     changes to everyone in the group); written only by the server.
--   * notifications.user_id index: the feed is read per user on every poll.
-- Additive and idempotent.

-- ---- notification settings -----------------------------------------------------------------------
alter table public.profiles
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

create index if not exists notifications_user_id_created_at_idx
  on public.notifications(user_id, created_at desc);

-- ---- proposed times for a plan -------------------------------------------------------------------
create table if not exists public.group_times (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  proposed_by uuid references public.profiles(id),
  starts_at timestamptz not null,
  note text,
  created_at timestamptz default now(),
  unique (group_id, starts_at)
);
create index if not exists group_times_group_id_idx on public.group_times(group_id, starts_at);

create table if not exists public.group_time_votes (
  time_id uuid not null references public.group_times(id),
  -- Denormalised so RLS and the Realtime filter are a plain column check, like group_members.
  group_id uuid not null references public.groups(id),
  user_id uuid not null references public.profiles(id),
  created_at timestamptz default now(),
  primary key (time_id, user_id)
);
create index if not exists group_time_votes_group_id_idx on public.group_time_votes(group_id);

alter table public.group_times enable row level security;
alter table public.group_time_votes enable row level security;
drop policy if exists "group_times_select_member" on public.group_times;
create policy "group_times_select_member"
on public.group_times for select to authenticated
using (public.is_group_member(group_id));
drop policy if exists "group_time_votes_select_member" on public.group_time_votes;
create policy "group_time_votes_select_member"
on public.group_time_votes for select to authenticated
using (public.is_group_member(group_id));
grant select on public.group_times, public.group_time_votes to authenticated;

-- Realtime: the plan screen subscribes so a proposal or a "free" tap shows for everyone. FULL replica identity
-- so DELETE events (a withdrawn "free", a removed time) still carry group_id for the client filter.
alter table public.group_times replica identity full;
alter table public.group_time_votes replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_times'
  ) then
    alter publication supabase_realtime add table public.group_times;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_time_votes'
  ) then
    alter publication supabase_realtime add table public.group_time_votes;
  end if;
end $$;
