-- Owner: Sahith (Data & Matching) — matching RPCs called by apps/server/src/matching via the service role.
-- Functions:
--   * match_traverse(requester, max_degrees)   stage 1: everyone within max_degrees (capped 1–3), shortest degree
--                                               per person, one deterministic path requester → … → candidate
--   * match_narrow(requester, candidates, …)   stage 2: cosine similarity vs the requester's embedding (rescaled 0–1
--                                               within the pool), soft cost/travel filters, meet-again boost;
--                                               missing data never excludes
--   * match_create_group(reasoning, members)   persists a proposed group and its members in one transaction
-- These read other users' bios, embeddings, and feedback, so they are service-role only: execute is revoked from
-- public/anon/authenticated (Supabase exposes public functions through PostgREST).
-- search_path includes `extensions` because Supabase may install pgvector there instead of public; table names
-- are fully qualified.

create or replace function public.match_traverse(p_requester uuid, p_max_degrees int)
returns table (id uuid, degree int, path uuid[])
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with recursive edges as (
    select c.user_a as source, c.user_b as target from public.connections c
    union all
    select c.user_b as source, c.user_a as target from public.connections c
  ),
  walk (person, depth, route) as (
    select p_requester, 0, array[p_requester]
    union all
    select e.target, w.depth + 1, w.route || e.target
    from walk w
    join edges e on e.source = w.person
    where w.depth < least(greatest(coalesce(p_max_degrees, 2), 1), 3)
      and not e.target = any(w.route)
  ),
  shortest as (
    select distinct on (w.person) w.person, w.depth, w.route
    from walk w
    where w.person <> p_requester
    order by w.person, w.depth, w.route
  )
  select s.person, s.depth, s.route
  from shortest s
  order by s.depth, s.person;
$$;

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
      (count(*) filter (where fp.would_meet_again))::int as yes_count,
      bool_or(not fp.would_meet_again) as any_no
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
  -- Embedding similarities are anisotropic (every pair lands ~0.85–0.95), so rank on similarity rescaled to 0–1
  -- within this pool; the meet-again boost is then weighed against the pool's real spread, not a fixed constant.
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
    (r.rel_sim + 0.1 * least(r.yes_count, 2))::double precision as rank_score
  from ranked r
  order by rank_score desc, r.person
  limit greatest(coalesce(p_limit, 12), 1);
$$;

create or replace function public.match_create_group(p_reasoning text, p_members jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_group_id uuid;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'match_create_group: p_members must be a non-empty array' using errcode = '22023';
  end if;

  insert into public.groups (reasoning, status)
  values (p_reasoning, 'proposed')
  returning public.groups.id into v_group_id;

  -- A duplicate user or unknown user id raises here and rolls back the groups insert above.
  insert into public.group_members (group_id, user_id, degree)
  select v_group_id, (m ->> 'user_id')::uuid, (m ->> 'degree')::int
  from jsonb_array_elements(p_members) as m;

  return v_group_id;
end;
$$;

-- Self-contained privileges: don't depend on the broad demo grants in 0002.
grant select on
  public.connections,
  public.profiles,
  public.profile_embeddings,
  public.profile_tags,
  public.preferences,
  public.event_feedback,
  public.feedback_peers
to service_role;
grant select, insert on public.groups, public.group_members to service_role;

revoke all on function public.match_traverse(uuid, int) from public, anon, authenticated;
revoke all on function public.match_narrow(uuid, uuid[], int, int, int, int) from public, anon, authenticated;
revoke all on function public.match_create_group(text, jsonb) from public, anon, authenticated;
grant execute on function public.match_traverse(uuid, int) to service_role;
grant execute on function public.match_narrow(uuid, uuid[], int, int, int, int) to service_role;
grant execute on function public.match_create_group(text, jsonb) to service_role;
