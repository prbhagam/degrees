-- Owner: Sahith (Data & Matching) — assertions for 0003/0006 matching functions; run via supabase/tests/run-local.sh.
-- Fixture mirrors 0002's 12-person graph (same edges), plus edge cases: missing embedding (p8), missing prefs (p7),
-- missing cost (p3), missing location (p11), far away (p9), expensive (p5), and a "not for me" relationship (p1 → p4).

create function pg_temp.pid(n int) returns uuid language sql immutable
as $$ select ('d0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- 768-dim vector with weight on the person's interest-cluster dimension, like 0002's synthetic seed.
create function pg_temp.vec(cluster int, n int) returns extensions.vector language sql immutable
as $$
  select ('[' || string_agg(
    case when d = cluster then '1.0' when d = 10 + cluster then '0.5' else (sin(d * n * 0.73) * 0.005)::text end,
    ',' order by d) || ']')::extensions.vector
  from generate_series(1, 768) as d
$$;

insert into auth.users (id) select pg_temp.pid(n) from generate_series(1, 12) as n;

insert into public.profiles (id, username, display_name, lat, lng)
select pg_temp.pid(n), 'person' || n, 'Person ' || n,
  case when n = 11 then null when n = 9 then 34.5 else 33.775 + n * 0.0005 end,
  case when n = 11 then null else -84.39 end
from generate_series(1, 12) as n;

insert into public.profile_tags (user_id, label, kind) values
  (pg_temp.pid(1), 'coffee', 'hobby'), (pg_temp.pid(1), 'design', 'hobby'),
  (pg_temp.pid(2), 'soccer', 'hobby'), (pg_temp.pid(2), 'coffee', 'hobby'), (pg_temp.pid(2), 'coffee', 'derived'),
  (pg_temp.pid(6), 'design', 'hobby');

insert into public.profile_embeddings (user_id, embedding)
select pg_temp.pid(n), pg_temp.vec(cluster, n)
from (values (1, 1), (2, 2), (3, 3), (4, 2), (5, 3), (6, 1), (7, 3), (9, 2), (10, 4), (11, 3), (12, 1))
  as v(n, cluster);

insert into public.preferences (user_id, cost_min_cents, cost_max_cents, max_travel_mi, frequency,
  group_size_min, group_size_max, max_degrees)
select pg_temp.pid(n),
  case when n = 3 then null when n = 5 then 10000 else 0 end,
  case when n = 3 then null when n = 5 then 20000 when n = 1 then 2500 else 4000 end,
  case when n = 1 then 5 else 10 end,
  'weekly', 3, 5, 3
from generate_series(1, 12) as n
where n <> 7;

insert into public.connections (user_a, user_b, met_context)
select least(pg_temp.pid(a), pg_temp.pid(b)), greatest(pg_temp.pid(a), pg_temp.pid(b)), 'manual'
from (values (1, 2), (1, 3), (2, 4), (2, 6), (3, 5), (3, 7), (4, 8), (5, 9), (6, 10), (7, 11), (8, 12), (10, 12))
  as e(a, b);

insert into public.groups (id, status) values ('10000000-0000-4000-8000-000000000001', 'completed');
insert into public.event_feedback (id, group_id, author_id, rating) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', pg_temp.pid(1), 5),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', pg_temp.pid(6), 5);
insert into public.feedback_peers (feedback_id, peer_id, relationship) values
  ('40000000-0000-4000-8000-000000000001', pg_temp.pid(2), 'great'),
  ('40000000-0000-4000-8000-000000000001', pg_temp.pid(4), 'not_for_me'),
  ('40000000-0000-4000-8000-000000000001', pg_temp.pid(6), 'great'),
  ('40000000-0000-4000-8000-000000000002', pg_temp.pid(1), 'great');

-- Privileges: clients can't call the RPCs; the service role can.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.match_traverse(uuid, integer)',
    'public.match_narrow(uuid, uuid[], integer, integer, integer, integer)',
    'public.match_create_group(text, jsonb)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'client role can execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'service_role cannot execute %', fn;
    end if;
  end loop;
end $$;

set role authenticated;
do $$
begin
  perform * from public.match_traverse(pg_temp.pid(1), 3);
  raise exception 'authenticated was able to call match_traverse';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Everything below runs as the service role, with only 0003's grants (0002's broad grants are not applied).
set role service_role;

-- Stage 1: traverse.
do $$
declare
  got text;
begin
  select string_agg(replace(id::text, 'd0000000-0000-4000-8000-', '') || ':' || degree, ',' order by id)
  into got from public.match_traverse(pg_temp.pid(1), 3);
  if got is distinct from '000000000002:1,000000000003:1,000000000004:2,000000000005:2,000000000006:2,'
      || '000000000007:2,000000000008:3,000000000009:3,000000000010:3,000000000011:3' then
    raise exception 'traverse(p1, 3) degrees wrong: %', got;
  end if;

  if (select count(*) from public.match_traverse(pg_temp.pid(1), 1)) <> 2 then
    raise exception 'traverse(p1, 1) should return only direct connections';
  end if;
  if (select count(*) from public.match_traverse(pg_temp.pid(1), 99)) <> 10 then
    raise exception 'traverse depth must cap at 3';
  end if;
  if (select count(*) from public.match_traverse(pg_temp.pid(1), null)) <> 6 then
    raise exception 'traverse with null max_degrees should default to 2';
  end if;
  if exists (
    select 1 from public.match_traverse(pg_temp.pid(1), 3)
    where path[1] <> pg_temp.pid(1) or path[array_length(path, 1)] <> id or array_length(path, 1) <> degree + 1
  ) then
    raise exception 'traverse paths must run requester → candidate with degree + 1 entries';
  end if;
  if exists (select 1 from public.match_traverse(pg_temp.pid(1), 3) where id = pg_temp.pid(1)) then
    raise exception 'traverse must exclude the requester';
  end if;

  -- Diamond: p2 reaches p12 via p4→p8 and via p6→p10 (both degree 3). One row, lowest path wins.
  select string_agg(replace(x::text, 'd0000000-0000-4000-8000-', ''), '>' order by ord) into got
  from public.match_traverse(pg_temp.pid(2), 3) t, unnest(t.path) with ordinality as u(x, ord)
  where t.id = pg_temp.pid(12);
  if got is distinct from '000000000002>000000000004>000000000008>000000000012' then
    raise exception 'diamond path should be deterministic, got %', got;
  end if;
  if (select count(*) from public.match_traverse(pg_temp.pid(2), 3)) <>
     (select count(distinct id) from public.match_traverse(pg_temp.pid(2), 3)) then
    raise exception 'traverse must return one row per person';
  end if;
end $$;

-- Stage 2: narrow.
create temp table narrowed as
select * from public.match_narrow(
  pg_temp.pid(1),
  (select array_agg(id) from public.match_traverse(pg_temp.pid(1), 3)),
  0, 2500, 5
);

do $$
declare
  got text;
begin
  select string_agg(replace(id::text, 'd0000000-0000-4000-8000-', ''), ',' order by id) into got from narrowed;
  -- Excluded: p4 (would not meet again), p5 (cost), p9 (distance). Kept despite NULLs: p3, p7, p8, p11.
  if got is distinct from '000000000002,000000000003,000000000006,000000000007,000000000008,000000000010,000000000011' then
    raise exception 'narrow(p1) candidate set wrong: %', got;
  end if;

  if (select id from narrowed order by score desc, id limit 1) <> pg_temp.pid(6) then
    raise exception 'p6 (same cluster + 2 meet-again) should rank first';
  end if;
  if (select meet_again_score from narrowed where id = pg_temp.pid(6)) <> 2
     or (select meet_again_score from narrowed where id = pg_temp.pid(2)) <> 1 then
    raise exception 'meet_again_score wrong';
  end if;
  if (select similarity from narrowed where id = pg_temp.pid(8)) is not null then
    raise exception 'missing candidate embedding should give null similarity';
  end if;
  if (select interests from narrowed where id = pg_temp.pid(2)) <> array['coffee', 'soccer'] then
    raise exception 'interests should be distinct and sorted';
  end if;
  if (select similarity < 0.95 from narrowed where id = pg_temp.pid(6)) then
    raise exception 'p1 and p6 share a cluster vector, similarity should be > 0.95';
  end if;
  -- Pool-relative score: the most similar candidate gets 1 (+ boost), the least similar with an embedding gets 0.
  if (select min(score) from narrowed where similarity is not null and meet_again_score = 0) <> 0
     or (select max(score) from narrowed) <> 1 + 0.25 * 2 then
    raise exception 'score should be similarity rescaled 0–1 within the pool plus 0.25 per meet-again (max 2)';
  end if;
end $$;

do $$
begin
  -- Requester without an embedding: every similarity is null, nothing errors.
  if exists (
    select 1 from public.match_narrow(pg_temp.pid(8), array[pg_temp.pid(4), pg_temp.pid(12)], 0, 4000, 10)
    where similarity is not null
  ) or (select count(*) from public.match_narrow(pg_temp.pid(8), array[pg_temp.pid(4), pg_temp.pid(12)], 0, 4000, 10)) <> 2 then
    raise exception 'narrow for a requester without an embedding should return rows with null similarity';
  end if;

  -- Requester without a location: no distance filtering, so far-away p9 stays.
  if not exists (
    select 1 from public.match_narrow(pg_temp.pid(11), array[pg_temp.pid(9), pg_temp.pid(7)], 0, 100000, 1)
    where id = pg_temp.pid(9) and distance_mi is null
  ) then
    raise exception 'missing requester location must not exclude by distance';
  end if;

  -- Null requester constraints don't filter on their own (p5's cost is kept), but a candidate's own travel radius
  -- still applies: p9 is ~50 mi away with max_travel_mi 10, so least(null, 10) = 10 excludes them.
  if (select string_agg(right(id::text, 2), ',' order by id)
      from public.match_narrow(pg_temp.pid(1), array[pg_temp.pid(5), pg_temp.pid(9)], null, null, null))
     is distinct from '05' then
    raise exception 'null requester constraints: expected only p5';
  end if;

  -- Ordering and limit.
  if exists (
    select 1 from (select score, lag(score) over (order by score desc, id) as prev from narrowed) s
    where s.prev < s.score
  ) then
    raise exception 'narrow results must be ordered by score desc';
  end if;
  if (select count(*) from public.match_narrow(pg_temp.pid(1), (select array_agg(id) from narrowed), 0, 2500, 5, 3)) <> 3 then
    raise exception 'p_limit should cap the result';
  end if;
  if exists (select 1 from public.match_narrow(pg_temp.pid(1), array[pg_temp.pid(1), pg_temp.pid(2)], 0, 2500, 5) where id = pg_temp.pid(1)) then
    raise exception 'narrow must exclude the requester';
  end if;
end $$;

-- Group persistence is atomic.
do $$
declare
  gid uuid;
  before_count int;
begin
  gid := public.match_create_group('test reasoning', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.pid(1), 'degree', 0),
    jsonb_build_object('user_id', pg_temp.pid(6), 'degree', 2)
  ));
  if (select count(*) from public.group_members where group_id = gid) <> 2
     or (select status from public.groups where id = gid) <> 'proposed' then
    raise exception 'match_create_group should insert a proposed group with its members';
  end if;

  select count(*) into before_count from public.groups;
  begin
    perform public.match_create_group('bad', jsonb_build_array(
      jsonb_build_object('user_id', pg_temp.pid(1), 'degree', 0),
      jsonb_build_object('user_id', 'e0000000-0000-4000-8000-000000000999', 'degree', 1)
    ));
    raise exception 'unknown member should fail';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.match_create_group('dup', jsonb_build_array(
      jsonb_build_object('user_id', pg_temp.pid(1), 'degree', 0),
      jsonb_build_object('user_id', pg_temp.pid(1), 'degree', 0)
    ));
    raise exception 'duplicate member should fail';
  exception when unique_violation then null;
  end;
  begin
    perform public.match_create_group('empty', '[]'::jsonb);
    raise exception 'empty members should fail';
  exception when invalid_parameter_value then null;
  end;
  if (select count(*) from public.groups) <> before_count then
    raise exception 'failed match_create_group calls left orphan groups';
  end if;
end $$;

reset role;
