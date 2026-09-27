-- Owner: Sahith (Data & Matching) — assertions for supabase/scripts/{restore,purge}_demo_users.sql; run via
-- supabase/tests/run-local.sh on a fresh database (60 seeded accounts) (0001 + 0003–0011, no 0002). Restore twice (idempotent), mix in
-- real accounts, purge twice, restore again, then check restore refuses to clobber a real username.

create function pg_temp.pid(n int) returns uuid language sql immutable
as $$ select ('d0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.rid(n int) returns uuid language sql immutable
as $$ select ('e0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

create function pg_temp.assert_eq(label text, actual bigint, expected bigint) returns void language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception '%: expected %, got %', label, expected, actual;
  end if;
end $$;

-- Everything restore_demo_users.sql promises, checked as a unit.
create function pg_temp.assert_demo_seeded() returns void language plpgsql
as $$
declare
  v_meetup uuid;
begin
  perform pg_temp.assert_eq('demo auth users', (select count(*) from auth.users where email like '%@degrees.demo'), 60);
  perform pg_temp.assert_eq('demo identities', (select count(*) from auth.identities where user_id::text like 'd0000000-%'), 60);
  perform pg_temp.assert_eq('password is DegreesDemo26!', (
    select count(*) from auth.users
    where email like '%@degrees.demo'
      and encrypted_password = extensions.crypt('DegreesDemo26!', encrypted_password)
  ), 60);
  perform pg_temp.assert_eq('demo profiles', (select count(*) from public.profiles where id::text like 'd0000000-%'), 60);
  perform pg_temp.assert_eq('demo tags', (select count(*) from public.profile_tags where user_id::text like 'd0000000-%'), 250);
  perform pg_temp.assert_eq('demo avoid tags', (
    select count(*) from public.profile_tags where user_id::text like 'd0000000-%' and kind = 'avoid'
  ), 10);
  perform pg_temp.assert_eq('demo embeddings', (select count(*) from public.profile_embeddings where user_id::text like 'd0000000-%'), 60);
  perform pg_temp.assert_eq('demo preferences', (select count(*) from public.preferences where user_id::text like 'd0000000-%'), 60);
  perform pg_temp.assert_eq('demo connections', (
    select count(*) from public.connections where user_a::text like 'd0000000-%' and user_b::text like 'd0000000-%'
  ), 148);
  perform pg_temp.assert_eq('second-degree path 1-2-4 exists', (
    select count(*) from public.connections
    where (user_a, user_b) in ((pg_temp.pid(1), pg_temp.pid(2)), (pg_temp.pid(2), pg_temp.pid(4)))
  ), 2);
  perform pg_temp.assert_eq('every account 4-58 has at least 2 connections', (
    select count(*) from generate_series(4, 58) n
    where (select count(*) from public.connections c where pg_temp.pid(n) in (c.user_a, c.user_b)) < 2
  ), 0);
  perform pg_temp.assert_eq('59 and 60 have no connections yet', (
    select count(*) from public.connections
    where pg_temp.pid(59) in (user_a, user_b) or pg_temp.pid(60) in (user_a, user_b)
  ), 0);
  perform pg_temp.assert_eq('newer accounts are 3rd degree or further from Maya', (
    select count(*) from public.connections
    where pg_temp.pid(1) in (user_a, user_b) or pg_temp.pid(2) in (user_a, user_b) or pg_temp.pid(3) in (user_a, user_b)
  ), 6);
  perform pg_temp.assert_eq('no connection met in the future', (select count(*) from public.connections where met_at > now()), 0);
  perform pg_temp.assert_eq('invalid connection order', (select count(*) from public.connections where user_a >= user_b), 0);

  select group_id into v_meetup from public.events where room_code = 'HACKGT' and ended_at is null and code_expires_at is null;
  if v_meetup is null then
    raise exception 'HACKGT should exist, open, never expiring, with a backing group';
  end if;
  perform pg_temp.assert_eq('HACKGT group is a meetup', (select count(*) from public.groups where id = v_meetup and kind = 'meetup'), 1);
  perform pg_temp.assert_eq('HACKGT demo members, all accepted', (
    select count(*) from public.group_members
    where group_id = v_meetup and user_id::text like 'd0000000-%' and accepted_at is not null
  ), 12);
  perform pg_temp.assert_eq('HACKGT host is degree 0', (
    select count(*) from public.group_members where group_id = v_meetup and user_id = pg_temp.pid(1) and degree = 0
  ), 1);
  perform pg_temp.assert_eq('HACKGT demo attendees', (
    select count(*) from public.event_attendees a join public.events e on e.id = a.event_id
    where e.room_code = 'HACKGT' and a.user_id::text like 'd0000000-%'
  ), 12);

  perform pg_temp.assert_eq('completed matched groups', (
    select count(*) from public.groups
    where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
      and kind = 'matched' and status = 'completed' and completed_at is not null
  ), 2);
  perform pg_temp.assert_eq('completed group members, all accepted', (
    select count(*) from public.group_members
    where group_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
      and accepted_at is not null
  ), 8);
  perform pg_temp.assert_eq('ready plans', (
    select count(*) from public.activities
    where group_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') and status = 'ready'
  ), 2);
  perform pg_temp.assert_eq('feedback rows', (
    select count(*) from public.event_feedback
    where group_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
  ), 8);
  perform pg_temp.assert_eq('feedback peers, all great', (
    select count(*) from public.feedback_peers fp join public.event_feedback f on f.id = fp.feedback_id
    where f.group_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
      and fp.relationship = 'great'
  ), 24);
end $$;

\o /dev/null
\ir ../scripts/restore_demo_users.sql
\o
select pg_temp.assert_demo_seeded();

-- Maya's demo arc is unchanged by the 48 additions: at her default 2 degrees she only reaches the original 12;
-- at 3 degrees the new circles come in (via their bridges onto her 2nd-degree people).
do $$
begin
  perform pg_temp.assert_eq('Maya at 2 degrees reaches only the original 12', (
    select count(*) from public.match_traverse(pg_temp.pid(1), 2) t
    where t.id not in (select pg_temp.pid(n) from generate_series(1, 12) n)
  ), 0);
  perform pg_temp.assert_eq('Maya at 2 degrees', (select count(*) from public.match_traverse(pg_temp.pid(1), 2)), 6);
  if (select count(*) from public.match_traverse(pg_temp.pid(1), 3) t
      where t.id not in (select pg_temp.pid(n) from generate_series(1, 12) n)) < 4 then
    raise exception 'Maya at 3 degrees should reach the new circles';
  end if;
end $$;

-- Idempotent: a second run changes no counts and duplicates nothing.
\o /dev/null
\ir ../scripts/restore_demo_users.sql
\o
select pg_temp.assert_demo_seeded();
select pg_temp.assert_eq('one HACKGT meetup group after re-run',
  (select count(*) from public.groups where kind = 'meetup'), 1);

-- ---- real accounts mixed in with the demo ones ---------------------------------------------------------------
insert into auth.users (id, email) values
  (pg_temp.rid(1), 'riley@example.com'),
  (pg_temp.rid(2), 'sam@example.com'),
  (pg_temp.rid(3), 'taylor@example.com');
insert into public.profiles (id, username, display_name) values
  (pg_temp.rid(1), 'riley', 'Riley'),
  (pg_temp.rid(2), 'sam', 'Sam'),
  (pg_temp.rid(3), 'taylor', 'Taylor');

-- Riley joined HACKGT and met Maya (demo) and Sam (real) there.
insert into public.event_attendees (event_id, user_id)
select id, pg_temp.rid(1) from public.events where room_code = 'HACKGT';
insert into public.group_members (group_id, user_id, degree, accepted_at)
select group_id, pg_temp.rid(1), null, now() from public.events where room_code = 'HACKGT';
insert into public.connections (user_a, user_b, met_context, event_id)
select least(pg_temp.rid(1), x), greatest(pg_temp.rid(1), x), 'event', (select id from public.events where room_code = 'HACKGT')
from unnest(array[pg_temp.pid(1), pg_temp.rid(2)]) as x;
insert into public.connection_contacts (user_a, user_b, a_accepted)
values (least(pg_temp.pid(1), pg_temp.rid(1)), greatest(pg_temp.pid(1), pg_temp.rid(1)), true);

insert into public.groups (id, kind, status, created_by, name) values
  ('f0000000-0000-4000-8000-000000000001', 'matched', 'confirmed', null, 'mixed: 2 real + demo'),
  ('f0000000-0000-4000-8000-000000000002', 'matched', 'proposed', null, 'one real left'),
  ('f0000000-0000-4000-8000-000000000003', 'meetup', 'confirmed', pg_temp.rid(1), 'hosted by a real person'),
  ('f0000000-0000-4000-8000-000000000004', 'matched', 'proposed', null, 'demo member never answered'),
  ('f0000000-0000-4000-8000-000000000005', 'matched', 'proposed', null, 'real member never answered');
insert into public.group_members (group_id, user_id, degree, accepted_at) values
  ('f0000000-0000-4000-8000-000000000001', pg_temp.rid(1), 0, now()),
  ('f0000000-0000-4000-8000-000000000001', pg_temp.rid(2), 1, now()),
  ('f0000000-0000-4000-8000-000000000001', pg_temp.pid(2), 2, now()),
  ('f0000000-0000-4000-8000-000000000002', pg_temp.rid(1), 0, now()),
  ('f0000000-0000-4000-8000-000000000002', pg_temp.pid(1), 1, null),
  ('f0000000-0000-4000-8000-000000000002', pg_temp.pid(2), 2, null),
  ('f0000000-0000-4000-8000-000000000003', pg_temp.rid(1), 0, now()),
  ('f0000000-0000-4000-8000-000000000003', pg_temp.pid(3), null, now()),
  ('f0000000-0000-4000-8000-000000000004', pg_temp.rid(1), 0, now()),
  ('f0000000-0000-4000-8000-000000000004', pg_temp.rid(3), 1, now()),
  ('f0000000-0000-4000-8000-000000000004', pg_temp.pid(4), 2, null),
  ('f0000000-0000-4000-8000-000000000005', pg_temp.rid(1), 0, now()),
  ('f0000000-0000-4000-8000-000000000005', pg_temp.rid(2), 1, null),
  ('f0000000-0000-4000-8000-000000000005', pg_temp.pid(5), 2, now());
insert into public.messages (group_id, sender_id, body) values
  ('f0000000-0000-4000-8000-000000000001', pg_temp.rid(1), 'real message'),
  ('f0000000-0000-4000-8000-000000000001', pg_temp.pid(2), 'demo message'),
  ('f0000000-0000-4000-8000-000000000002', pg_temp.rid(1), 'message in a group that goes');
insert into public.event_feedback (id, group_id, author_id, rating) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', pg_temp.rid(1), 5),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', pg_temp.pid(2), 5);
insert into public.feedback_peers (feedback_id, peer_id, relationship) values
  ('f1000000-0000-4000-8000-000000000001', pg_temp.rid(2), 'great'),
  ('f1000000-0000-4000-8000-000000000001', pg_temp.pid(2), 'great'),
  ('f1000000-0000-4000-8000-000000000002', pg_temp.rid(1), 'great');
insert into public.activities (group_id, title) values
  ('f0000000-0000-4000-8000-000000000001', 'kept plan'),
  ('f0000000-0000-4000-8000-000000000002', 'plan that goes');
insert into public.notifications (user_id, type) values (pg_temp.pid(1), 'demo'), (pg_temp.rid(1), 'real');

-- Mentions of demo people outside ID-linked rows (Sep 27).
insert into public.groups (id, kind, status, name) values
  ('f0000000-0000-4000-8000-000000000006', 'matched', 'confirmed', 'real only');
insert into public.group_members (group_id, user_id, degree, accepted_at) values
  ('f0000000-0000-4000-8000-000000000006', pg_temp.rid(1), 0, now()),
  ('f0000000-0000-4000-8000-000000000006', pg_temp.rid(2), 1, now());
update public.groups
set reasoning = 'Riley and Sam met Alex Rivera and Sam Okafor; Alex picked coffee.', name = 'Alex fan club'
where id = 'f0000000-0000-4000-8000-000000000001';
update public.activities set reasoning = 'Alex suggested it.' where title = 'kept plan';
insert into public.group_icebreakers (group_id, position, prompt) values
  ('f0000000-0000-4000-8000-000000000001', 0, 'Alex and Riley both love coffee.'),
  ('f0000000-0000-4000-8000-000000000006', 0, 'Ask Maya about pottery.');
insert into public.messages (group_id, sender_id, body) values
  ('f0000000-0000-4000-8000-000000000001', pg_temp.rid(1), 'has anyone heard from Alex?');
insert into public.group_times (id, group_id, proposed_by, starts_at, note) values
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', pg_temp.pid(2), now() + interval '1 day', null),
  ('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', pg_temp.rid(1), now() + interval '2 days', 'works for Alex?'),
  ('f2000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002', pg_temp.rid(1), now() + interval '3 days', null);
insert into public.group_time_votes (time_id, group_id, user_id) values
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', pg_temp.rid(1)),
  ('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', pg_temp.rid(2)),
  ('f2000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', pg_temp.pid(2)),
  ('f2000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002', pg_temp.rid(1));
insert into public.notifications (user_id, type, payload) values
  (pg_temp.rid(1), 'exchange_requested', jsonb_build_object('peerId', pg_temp.pid(1), 'peerName', 'Maya Chen')),
  (pg_temp.rid(1), 'plan_changed', jsonb_build_object('groupId', 'f0000000-0000-4000-8000-000000000002')),
  (pg_temp.rid(1), 'nested', jsonb_build_object('meta', jsonb_build_object('people', jsonb_build_array(pg_temp.pid(3))))),
  (pg_temp.rid(1), 'kept_group_ping', jsonb_build_object('groupId', 'f0000000-0000-4000-8000-000000000001'));

-- ---- purge --------------------------------------------------------------------------------------------------
\o /dev/null
\ir ../scripts/purge_demo_users.sql
\o

do $$
begin
  perform pg_temp.assert_eq('demo auth users gone', (select count(*) from auth.users where email like '%@degrees.demo'), 0);
  perform pg_temp.assert_eq('demo identities cascade', (select count(*) from auth.identities), 0);
  perform pg_temp.assert_eq('demo-owned rows gone', (
    (select count(*) from public.profiles where id::text like 'd0000000-%')
    + (select count(*) from public.profile_tags where user_id::text like 'd0000000-%')
    + (select count(*) from public.profile_embeddings where user_id::text like 'd0000000-%')
    + (select count(*) from public.preferences where user_id::text like 'd0000000-%')
    + (select count(*) from public.group_members where user_id::text like 'd0000000-%')
    + (select count(*) from public.connections where user_a::text like 'd0000000-%' or user_b::text like 'd0000000-%')
    + (select count(*) from public.connection_contacts)
    + (select count(*) from public.event_feedback where author_id::text like 'd0000000-%')
    + (select count(*) from public.feedback_peers where peer_id::text like 'd0000000-%')
    + (select count(*) from public.messages where sender_id::text like 'd0000000-%')
    + (select count(*) from public.notifications where user_id::text like 'd0000000-%')
  ), 0);
  perform pg_temp.assert_eq('HACKGT and demo groups gone', (
    select count(*) from public.events where room_code = 'HACKGT'
  ) + (
    select count(*) from public.groups where id::text like '10000000-%'
  ), 0);

  perform pg_temp.assert_eq('real accounts kept', (select count(*) from public.profiles where id::text like 'e0000000-%'), 3);
  perform pg_temp.assert_eq('real-real edge kept, event link cleared', (
    select count(*) from public.connections
    where user_a = least(pg_temp.rid(1), pg_temp.rid(2)) and user_b = greatest(pg_temp.rid(1), pg_temp.rid(2))
      and event_id is null
  ), 1);
  perform pg_temp.assert_eq('mixed group kept with its 2 real members', (
    select count(*) from public.group_members where group_id = 'f0000000-0000-4000-8000-000000000001'
  ), 2);
  perform pg_temp.assert_eq('real message, feedback, peer, plan kept', (
    (select count(*) from public.messages where body = 'real message')
    + (select count(*) from public.event_feedback where id = 'f1000000-0000-4000-8000-000000000001')
    + (select count(*) from public.feedback_peers where feedback_id = 'f1000000-0000-4000-8000-000000000001')
    + (select count(*) from public.activities where title = 'kept plan')
    + (select count(*) from public.notifications where type = 'real')
  ), 5);
  perform pg_temp.assert_eq('group left with one real member removed, with its chat and plan', (
    (select count(*) from public.groups where id = 'f0000000-0000-4000-8000-000000000002')
    + (select count(*) from public.messages where group_id = 'f0000000-0000-4000-8000-000000000002')
    + (select count(*) from public.activities where group_id = 'f0000000-0000-4000-8000-000000000002')
  ), 0);
  perform pg_temp.assert_eq('real-hosted meetup kept with just its host', (
    select count(*) from public.group_members where group_id = 'f0000000-0000-4000-8000-000000000003'
  ), 1);
  -- Wave 4: the unanswered demo member was the only thing holding this group at 'proposed'.
  perform pg_temp.assert_eq('group confirms once the pending demo member is gone', (
    select count(*) from public.groups where id = 'f0000000-0000-4000-8000-000000000004' and status = 'confirmed'
  ), 1);
  perform pg_temp.assert_eq('notifications pointing at demo people or deleted groups gone; others kept', (
    select count(*) from public.notifications where user_id = pg_temp.rid(1)
  ), 2);
  if not exists (select 1 from public.notifications where type = 'kept_group_ping') then
    raise exception 'a notification about a surviving group should stay';
  end if;
  if (select reasoning from public.groups where id = 'f0000000-0000-4000-8000-000000000001')
     <> 'Riley and Sam met someone and someone; someone picked coffee.' then
    raise exception 'reasoning not redacted as expected (the real Sam must stay): %',
      (select reasoning from public.groups where id = 'f0000000-0000-4000-8000-000000000001');
  end if;
  perform pg_temp.assert_eq('group name, plan reasoning, and time note redacted', (
    (select count(*) from public.groups where id = 'f0000000-0000-4000-8000-000000000001' and name = 'someone fan club')
    + (select count(*) from public.activities where title = 'kept plan' and reasoning = 'someone suggested it.')
    + (select count(*) from public.group_times where id = 'f2000000-0000-4000-8000-000000000002' and note = 'works for someone?')
  ), 3);
  perform pg_temp.assert_eq('icebreakers cleared in a group that lost a member', (
    select count(*) from public.group_icebreakers where group_id = 'f0000000-0000-4000-8000-000000000001'
  ), 0);
  perform pg_temp.assert_eq('icebreaker elsewhere redacted', (
    select count(*) from public.group_icebreakers
    where group_id = 'f0000000-0000-4000-8000-000000000006' and prompt = 'Ask someone about pottery.'
  ), 1);
  perform pg_temp.assert_eq('a real person''s own message is left as written', (
    select count(*) from public.messages where body = 'has anyone heard from Alex?'
  ), 1);
  perform pg_temp.assert_eq('demo-proposed time and deleted group''s time gone, with their votes', (
    (select count(*) from public.group_times)
    + (select count(*) from public.group_time_votes)
  ), 1 + 1);
  perform pg_temp.assert_eq('the surviving time keeps only its real vote', (
    select count(*) from public.group_time_votes
    where time_id = 'f2000000-0000-4000-8000-000000000002' and user_id = pg_temp.rid(2)
  ), 1);
  perform pg_temp.assert_eq('group still waiting on a real member stays proposed', (
    select count(*) from public.groups where id = 'f0000000-0000-4000-8000-000000000005' and status = 'proposed'
  ), 1);
end $$;

-- A second purge finds nothing and doesn't fail.
\o /dev/null
\ir ../scripts/purge_demo_users.sql
\o
select pg_temp.assert_eq('real accounts still kept', (select count(*) from public.profiles), 3);

-- ---- restore after a purge: everything comes back, real data untouched --------------------------------------
\o /dev/null
\ir ../scripts/restore_demo_users.sql
\o
select pg_temp.assert_demo_seeded();
select pg_temp.assert_eq('real accounts untouched by restore', (select count(*) from public.profiles where id::text like 'e0000000-%'), 3);

-- ---- restore refuses to clobber a real account holding a seeded username ------------------------------------
\o /dev/null
\ir ../scripts/purge_demo_users.sql
\o
update public.profiles set username = 'maya.chen' where id = pg_temp.rid(3);
\set ON_ERROR_STOP off
\o /dev/null
\ir ../scripts/restore_demo_users.sql
\o
\set ON_ERROR_STOP on
select set_config('demo_test.last_error', :'LAST_ERROR_MESSAGE', false);
do $$
begin
  if current_setting('demo_test.last_error') not like '%seeded usernames are taken%' then
    raise exception 'restore should refuse a taken username, got: %', current_setting('demo_test.last_error');
  end if;
  perform pg_temp.assert_eq('refused restore changed nothing', (select count(*) from auth.users where email like '%@degrees.demo'), 0);
end $$;
