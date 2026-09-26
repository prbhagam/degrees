-- Owner: Sahith (Data & Matching) — raises the meet-again boost in match_narrow from 0.1 to 0.25 per "yes".
-- Why: feedback re-embeds the author's profile, and pool-relative similarity then moves by up to ~0.3. Measured on
-- the shared project (Sep 26): Leo said "would meet again" to Ethan, his similarity rescaled from 0.83 to 0.72, and
-- the old +0.1 left Ethan's score lower than before the feedback. Feedback must raise the score of people you'd meet
-- again. Only the weight changes; the signature, filters, and output columns are identical to 0003.
-- Apply after 0003 (SQL editor or psql). Safe to rerun.

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
  -- 0004: the boost is 0.25 per "would meet again" (max 2). Re-embedding after feedback shifts pool-relative
  -- similarity by up to ~0.3, which swamped the old 0.1 and could leave someone you said yes to lower than before.
  -- Max boost 0.5 < 1 keeps the invariant that the least similar candidate can't pass the most similar one.
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
