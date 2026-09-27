-- Owner: Sahith (Data & Matching) — Sep 26 wave 3 (testing round 2).
--
--   * activities.created_at: plans are kept, not replaced. The newest row per group is the current plan; older
--     'ready' rows are its history (GroupResponse.activityHistory) and the venues the planner is told not to repeat.
--   * group_members + groups join the Realtime publication so everyone already in a meetup sees a new arrival (and
--     an "End meetup") without pulling to refresh. group_members needs FULL replica identity for DELETE events to
--     carry group_id, which the app filters on.
--   * connection_contacts: mutual-consent phone exchange between 1st-degree connections (Your Circle), keyed on the
--     pair rather than a group so it persists. Zero client grants, same as contact_exchanges.
--   * match_narrow: 'avoid' tags no longer count as interests when ranking or explaining a match. Identical to
--     0006's definition otherwise.
-- Additive and idempotent.

-- ---- activities: keep history ------------------------------------------------------------------
alter table public.activities
  add column if not exists created_at timestamptz not null default now();
create index if not exists activities_group_id_created_at_idx on public.activities(group_id, created_at desc);

-- ---- realtime: membership + group state ---------------------------------------------------------
alter table public.group_members replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
end $$;

-- ---- connection_contacts: phone exchange between people who've met ------------------------------
create table if not exists public.connection_contacts (
  user_a uuid references public.profiles(id),
  user_b uuid references public.profiles(id),
  a_accepted boolean not null default false,
  b_accepted boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.connection_contacts enable row level security;
-- No policies and no grants: the server (service role) is the only reader/writer, because whether a phone number
-- may be shown is decided server-side from both acceptances.

-- ---- match_narrow: interests exclude 'avoid' tags -----------------------------------------------
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
    -- wave 3: 'avoid' tags are constraints, not interests; they never count as shared ground.
    where t.kind <> 'avoid'
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

revoke all on function public.match_narrow(uuid, uuid[], int, int, int, int) from public, anon, authenticated;
grant execute on function public.match_narrow(uuid, uuid[], int, int, int, int) to service_role;
