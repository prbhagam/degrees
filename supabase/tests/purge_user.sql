-- Owner: Sahith (Data & Matching) — assertions for supabase/scripts/purge_user.sql; run via supabase/tests/run-local.sh
-- on a fresh database (pgvector in public, like the shared project). Restores the 60 demo accounts, purges alex.rivera,
-- then a signup that never got a profile row (found by auth metadata), then an unknown username (must error).
-- run-local.sh passes :purge_alex / :purge_ghost / :purge_nobody — copies of the script with v_username filled in.
create function pg_temp.pid(n int) returns uuid language sql immutable
as $$ select ('d0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.assert_eq(label text, actual bigint, expected bigint) returns void language plpgsql
as $$ begin if actual is distinct from expected then raise exception '%: expected %, got %', label, expected, actual; end if; end $$;

\o /dev/null
\ir ../scripts/restore_demo_users.sql
\o

-- Things that point at Alex (pid 2) without being his own rows.
insert into public.notifications (user_id, type, payload)
values (pg_temp.pid(1), 'exchange_requested', jsonb_build_object('peerId', pg_temp.pid(2), 'peerName', 'Alex Rivera'));
insert into public.messages (group_id, sender_id, body) values
  ('10000000-0000-4000-8000-000000000001', pg_temp.pid(2), 'alex says hi'),
  ('10000000-0000-4000-8000-000000000001', pg_temp.pid(1), 'where is Alex?');
insert into public.group_icebreakers (group_id, position, prompt)
values ('10000000-0000-4000-8000-000000000001', 0, 'Ask Alex about soccer.');

create temp table before as
select
  (select count(*) from public.connections) as edges,
  (select count(*) from public.connections where pg_temp.pid(2) in (user_a, user_b)) as alex_edges;

-- An auth user whose profile never got created (a half-finished signup).
insert into auth.users (id, email, raw_user_meta_data)
values ('e0000000-0000-4000-8000-000000000099', 'ghost@example.com', '{"username":"ghost.user"}');

\o /dev/null
\i :purge_alex
\o

do $$
begin
  perform pg_temp.assert_eq('alex profile gone', (select count(*) from public.profiles where username = 'alex.rivera'), 0);
  perform pg_temp.assert_eq('alex auth user gone', (select count(*) from auth.users where id = pg_temp.pid(2)), 0);
  perform pg_temp.assert_eq('alex identity gone', (select count(*) from auth.identities where user_id = pg_temp.pid(2)), 0);
  perform pg_temp.assert_eq('everyone else kept', (select count(*) from public.profiles), 59);
  perform pg_temp.assert_eq('only alex''s edges removed', (select count(*) from public.connections),
    (select edges - alex_edges from before));
  perform pg_temp.assert_eq('alex everywhere else', (
    (select count(*) from public.group_members where user_id = pg_temp.pid(2))
    + (select count(*) from public.messages where sender_id = pg_temp.pid(2))
    + (select count(*) from public.event_feedback where author_id = pg_temp.pid(2))
    + (select count(*) from public.feedback_peers where peer_id = pg_temp.pid(2))
    + (select count(*) from public.event_attendees where user_id = pg_temp.pid(2))
    + (select count(*) from public.profile_tags where user_id = pg_temp.pid(2))
    + (select count(*) from public.preferences where user_id = pg_temp.pid(2))
    + (select count(*) from public.profile_embeddings where user_id = pg_temp.pid(2))
  ), 0);
  perform pg_temp.assert_eq('notification pointing at alex gone', (
    select count(*) from public.notifications where payload ->> 'peerId' = pg_temp.pid(2)::text
  ), 0);
  -- Group 1 (Maya, Alex, Jordan, Zoe) keeps 3 people, so it survives with Alex's name redacted.
  if (select reasoning from public.groups where id = '10000000-0000-4000-8000-000000000001')
     <> 'A creative food-focused student group connected through Maya and someone on the Georgia Tech campus.' then
    raise exception 'reasoning: %', (select reasoning from public.groups where id = '10000000-0000-4000-8000-000000000001');
  end if;
  perform pg_temp.assert_eq('group 1 keeps its other 3', (
    select count(*) from public.group_members where group_id = '10000000-0000-4000-8000-000000000001'
  ), 3);
  perform pg_temp.assert_eq('icebreakers cleared in a group alex left', (
    select count(*) from public.group_icebreakers where group_id = '10000000-0000-4000-8000-000000000001'
  ), 0);
  perform pg_temp.assert_eq('maya''s own message kept as written', (
    select count(*) from public.messages where body = 'where is Alex?'
  ), 1);
  perform pg_temp.assert_eq('HACKGT (hosted by Maya) survives without alex', (
    select count(*) from public.group_members m join public.events e on e.group_id = m.group_id where e.room_code = 'HACKGT'
  ), 11);
  perform pg_temp.assert_eq('the ghost signup is untouched by alex''s purge', (
    select count(*) from auth.users where email = 'ghost@example.com'
  ), 1);
end $$;

-- A signup with no profile row is found by its auth metadata username.
\o /dev/null
\i :purge_ghost
\o
select pg_temp.assert_eq('ghost auth user gone', (select count(*) from auth.users where email = 'ghost@example.com'), 0);

-- An unknown username errors and changes nothing.
\set ON_ERROR_STOP off
\o /dev/null
\i :purge_nobody
\o
\set ON_ERROR_STOP on
select set_config('t.err', :'LAST_ERROR_MESSAGE', false);
do $$
begin
  if current_setting('t.err') not like '%no account with username nobody.here%' then
    raise exception 'expected not-found error, got: %', current_setting('t.err');
  end if;
  perform pg_temp.assert_eq('nothing changed', (select count(*) from public.profiles), 59);
end $$;
