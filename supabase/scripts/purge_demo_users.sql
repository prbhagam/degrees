-- Owner: Sahith (Data & Matching) — remove every demo account, for a real (prod) environment on demand.
-- Undo with restore_demo_users.sql. Run in the Supabase SQL Editor (or psql) as postgres / service role.
--
-- A demo account is any auth user whose email ends in @degrees.demo. That domain is reserved: signup refuses it
-- (signupEmailSchema in packages/shared), so real accounts can never match. NOTE: every account created before the
-- Sep 27 email-login change was <username>@degrees.demo, so those test signups are demo accounts too and are removed.
-- Only the 60 seeded ones come back with restore_demo_users.sql.
--
-- What goes, besides the accounts and their profile/tags/embedding/preferences:
--   * groups a demo account created (hosted meetups, e.g. HACKGT) and the events backing them;
--   * groups left with no real member (meetups) or fewer than two real members (matched groups) once demo
--     members are removed — plus each doomed group's plans, chat, photos rows, icebreakers, feedback, contacts;
--   * everything else a demo account touched in a surviving group: its membership, messages, photos rows,
--     feedback it wrote or received, contact exchanges, and its connections.
-- Real people's connections to each other survive; one formed at a deleted meetup keeps the edge but loses the
-- event link (connections.event_id -> null).
--
-- Not removed: Storage files. Deleting storage.objects rows from SQL wouldn't delete the files (and newer Supabase
-- projects refuse it), so the notice below counts what's left to clear from the dashboard or Storage API
-- (avatars/<user id>/ and event-photos/<group id>/).
--
-- Needs migrations 0010 and 0011 (refuses otherwise).
-- One DO block, so it's a single transaction: it all applies or none of it does. Safe to re-run (a second run finds
-- nothing). Set v_dry_run := true to only report what would be removed.

do $purge$
declare
  v_dry_run constant boolean := false;
  v_users uuid[];
  v_groups uuid[];
  v_events uuid[];
  v_storage_objects bigint := 0;
  n bigint;
begin
  if to_regclass('public.connection_contacts') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'group_members' and column_name = 'accepted_at'
     ) then
    raise exception '%: apply migrations 0010 and 0011 first (connection_contacts, group_members.accepted_at)', 'purge_demo_users'
      using hint = 'Nothing was changed.';
  end if;

  select coalesce(array_agg(id), '{}') into v_users
  from auth.users
  where lower(email) like '%@degrees.demo';

  -- Groups to delete outright (see header).
  select coalesce(array_agg(g.id), '{}') into v_groups
  from public.groups g
  where g.created_by = any(v_users)
     or (
       exists (
         select 1 from public.group_members m
         where m.group_id = g.id and m.user_id = any(v_users)
       )
       and (
         select count(*) from public.group_members m
         where m.group_id = g.id and not (m.user_id = any(v_users))
       ) < case when g.kind = 'meetup' then 1 else 2 end
     );

  -- A demo-hosted event goes with its backing group, and vice versa.
  select coalesce(array_agg(e.id), '{}') into v_events
  from public.events e
  where e.created_by = any(v_users) or e.group_id = any(v_groups);

  select v_groups || coalesce(array_agg(e.group_id), '{}') into v_groups
  from public.events e
  where e.id = any(v_events) and e.group_id is not null and not (e.group_id = any(v_groups));

  if to_regclass('storage.objects') is not null then
    select count(*) into v_storage_objects
    from storage.objects o
    where (o.bucket_id = 'avatars' and split_part(o.name, '/', 1) = any(v_users::text[]))
       or (o.bucket_id = 'event-photos' and split_part(o.name, '/', 1) = any(v_groups::text[]));
  end if;

  raise notice 'demo accounts: %, groups: %, events: %, storage objects left behind: %',
    cardinality(v_users), cardinality(v_groups), cardinality(v_events), v_storage_objects;

  if v_dry_run then
    raise notice 'dry run: nothing deleted';
    return;
  end if;

  -- Children first: there are no ON DELETE CASCADEs in public (supabase/AGENTS.md).
  delete from public.group_icebreakers where group_id = any(v_groups);

  delete from public.event_photos
  where group_id = any(v_groups) or uploader_id = any(v_users);

  delete from public.messages
  where group_id = any(v_groups) or sender_id = any(v_users);

  delete from public.feedback_peers
  where peer_id = any(v_users)
     or feedback_id in (
       select f.id from public.event_feedback f
       where f.group_id = any(v_groups) or f.author_id = any(v_users)
     );

  delete from public.event_feedback
  where group_id = any(v_groups) or author_id = any(v_users);

  delete from public.contact_exchanges
  where group_id = any(v_groups) or user_a = any(v_users) or user_b = any(v_users);

  delete from public.connection_contacts
  where user_a = any(v_users) or user_b = any(v_users);

  delete from public.activities where group_id = any(v_groups);

  delete from public.notifications where user_id = any(v_users);

  delete from public.connections
  where user_a = any(v_users) or user_b = any(v_users);
  get diagnostics n = row_count;
  raise notice 'connections removed: %', n;

  update public.connections set event_id = null where event_id = any(v_events);

  delete from public.event_attendees
  where event_id = any(v_events) or user_id = any(v_users);

  delete from public.events where id = any(v_events);

  delete from public.group_members
  where group_id = any(v_groups) or user_id = any(v_users);

  delete from public.groups where id = any(v_groups);

  -- Wave 4 (0011): a matched group confirms once every remaining member has accepted. Removing a demo member who
  -- hadn't answered can complete that condition, so settle it here the way the server does after an accept.
  update public.groups g
  set status = 'confirmed'
  where g.kind = 'matched'
    and g.status = 'proposed'
    and (select count(*) from public.group_members m where m.group_id = g.id) >= 2
    and not exists (
      select 1 from public.group_members m where m.group_id = g.id and m.accepted_at is null
    );

  delete from public.profile_tags where user_id = any(v_users);
  delete from public.profile_embeddings where user_id = any(v_users);
  delete from public.preferences where user_id = any(v_users);
  delete from public.profiles where id = any(v_users);

  -- auth.identities, sessions, refresh tokens, and MFA factors cascade from auth.users in Supabase's auth schema.
  delete from auth.users where id = any(v_users);
  get diagnostics n = row_count;
  raise notice 'demo accounts removed: %', n;
end;
$purge$;

-- Verification: every count must be 0.
select
  (select count(*) from auth.users where lower(email) like '%@degrees.demo') as demo_auth_users,
  (
    select count(*) from public.profiles p
    where not exists (select 1 from auth.users u where u.id = p.id)
  ) as profiles_without_auth_user,
  (select count(*) from public.events where room_code = 'HACKGT') as hackgt_events;
