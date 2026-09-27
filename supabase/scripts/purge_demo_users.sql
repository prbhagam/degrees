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
--     feedback it wrote or received, contact exchanges, proposed times and votes (0012), and its connections;
--   * mentions of them elsewhere (Sep 27): any notification whose payload points at a demo account or a deleted
--     group/event (e.g. a real person's "Maya wants to swap numbers"); in surviving groups, their names in the stored
--     "why this group" text, group names, plan reasoning, icebreakers, and time notes become "someone" (the app's
--     redaction only hides current members, so a removed person's name would otherwise show in plain text), and
--     icebreakers of groups that lost a member are cleared (any member can regenerate them); and their auth
--     audit-log entries, refresh tokens, and flow state.
--   A name is only redacted if no real account shares it (full name, or first name for first-name matches), so a
--   real "Sam" is never touched.
--   Left as written: what real people typed themselves (chat messages, feedback text) that mentions a demo name.
--   The notice counts those rows.
-- Real people's connections to each other survive; one formed at a deleted meetup keeps the edge but loses the
-- event link (connections.event_id -> null).
--
-- Not removed: Storage files. Deleting storage.objects rows from SQL wouldn't delete the files (and newer Supabase
-- projects refuse it), so the notice below counts what's left to clear from the dashboard or Storage API
-- (avatars/<user id>/ and event-photos/<group id>/).
--
-- Needs migrations 0010 and 0011 (refuses otherwise); 0012's time-poll tables are cleaned when present.
-- One DO block, so it's a single transaction: it all applies or none of it does. Safe to re-run (a second run finds
-- nothing). Set v_dry_run := true to only report what would be removed.

do $purge$
declare
  v_dry_run constant boolean := false;
  v_users uuid[];
  v_groups uuid[];
  v_events uuid[];
  v_affected uuid[];
  v_ids text[];
  v_names text[];
  v_name text;
  v_pattern text;
  v_storage_objects bigint := 0;
  v_real_mentions bigint := 0;
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

  -- Surviving groups that lose a demo member (their generated text may name that person).
  select coalesce(array_agg(distinct m.group_id), '{}') into v_affected
  from public.group_members m
  where m.user_id = any(v_users) and not (m.group_id = any(v_groups));

  -- Every id a notification payload could point at.
  v_ids := v_users::text[] || v_groups::text[] || v_events::text[];

  -- Demo names safe to redact: full display names, plus first names of 3+ letters, unless a real account has the
  -- same full name or first name. Longest first so "Maya Chen" goes before "Maya".
  with demo_names as (
    select distinct trim(p.display_name) as full_name, split_part(trim(p.display_name), ' ', 1) as first_name
    from public.profiles p
    where p.id = any(v_users) and coalesce(trim(p.display_name), '') <> ''
  ),
  real_names as (
    select lower(trim(p.display_name)) as full_name, lower(split_part(trim(p.display_name), ' ', 1)) as first_name
    from public.profiles p
    where not (p.id = any(v_users)) and p.display_name is not null
  ),
  candidates as (
    select d.full_name as name from demo_names d
    where lower(d.full_name) not in (select r.full_name from real_names r)
    union
    select d.first_name from demo_names d
    where length(d.first_name) >= 3 and lower(d.first_name) not in (select r.first_name from real_names r)
  )
  select coalesce(array_agg(name order by length(name) desc, name), '{}') into v_names from candidates;

  if cardinality(v_names) > 0 then
    select
      (select count(*) from public.messages msg
       where not (msg.sender_id = any(v_users)) and not (msg.group_id = any(v_groups))
         and exists (select 1 from unnest(v_names) nm where msg.body ~* ('\m' || regexp_replace(nm, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M')))
      + (select count(*) from public.event_feedback f
         where not (f.author_id = any(v_users)) and not (f.group_id = any(v_groups)) and f.free_text is not null
           and exists (select 1 from unnest(v_names) nm where f.free_text ~* ('\m' || regexp_replace(nm, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M')))
    into v_real_mentions;
  end if;

  if to_regclass('storage.objects') is not null then
    select count(*) into v_storage_objects
    from storage.objects o
    where (o.bucket_id = 'avatars' and split_part(o.name, '/', 1) = any(v_users::text[]))
       or (o.bucket_id = 'event-photos' and split_part(o.name, '/', 1) = any(v_groups::text[]));
  end if;

  raise notice 'demo accounts: %, groups: %, events: %, surviving groups losing a member: %, storage objects left behind: %',
    cardinality(v_users), cardinality(v_groups), cardinality(v_events), cardinality(v_affected), v_storage_objects;
  raise notice 'real messages/feedback that mention a demo name (left as written): %', v_real_mentions;

  if v_dry_run then
    raise notice 'dry run: nothing deleted';
    return;
  end if;

  -- Children first: there are no ON DELETE CASCADEs in public (supabase/AGENTS.md).
  delete from public.group_icebreakers where group_id = any(v_groups) or group_id = any(v_affected);

  -- 0012 time polls: votes by demo accounts, and times they proposed or in deleted groups (with those times' votes).
  if to_regclass('public.group_times') is not null then
    delete from public.group_time_votes
    where group_id = any(v_groups)
       or user_id = any(v_users)
       or time_id in (
         select t.id from public.group_times t
         where t.group_id = any(v_groups) or t.proposed_by = any(v_users)
       );
    delete from public.group_times
    where group_id = any(v_groups) or proposed_by = any(v_users);
  end if;

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

  -- Their own notifications, and anyone's that points at a demo account or a deleted group/event anywhere in the
  -- payload (peerId, groupId, eventId, …).
  delete from public.notifications nt
  where nt.user_id = any(v_users)
     or exists (
       select 1 from jsonb_path_query(nt.payload, 'lax $.**') as v(value)
       where jsonb_typeof(v.value) = 'string' and (v.value #>> '{}') = any(v_ids)
     );
  get diagnostics n = row_count;
  raise notice 'notifications removed: %', n;

  -- Names in surviving groups' generated or group-level text (see header).
  foreach v_name in array v_names loop
    v_pattern := '\m' || regexp_replace(v_name, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M';
    update public.groups set reasoning = regexp_replace(reasoning, v_pattern, 'someone', 'gi')
    where not (id = any(v_groups)) and reasoning ~* v_pattern;
    update public.groups set name = regexp_replace(name, v_pattern, 'someone', 'gi')
    where not (id = any(v_groups)) and name ~* v_pattern;
    update public.activities set reasoning = regexp_replace(reasoning, v_pattern, 'someone', 'gi')
    where not (group_id = any(v_groups)) and reasoning ~* v_pattern;
    update public.group_icebreakers set prompt = regexp_replace(prompt, v_pattern, 'someone', 'gi')
    where not (group_id = any(v_groups)) and prompt ~* v_pattern;
    if to_regclass('public.group_times') is not null then
      update public.group_times set note = regexp_replace(note, v_pattern, 'someone', 'gi')
      where not (group_id = any(v_groups)) and note ~* v_pattern;
    end if;
  end loop;

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

  -- auth.identities, sessions, and MFA factors cascade from auth.users in Supabase's auth schema. These don't (no
  -- foreign key), so clear them explicitly when present; the audit log records each account's email.
  if to_regclass('auth.audit_log_entries') is not null then
    execute $sql$
      delete from auth.audit_log_entries
      where payload ->> 'actor_id' = any($1)
         or lower(payload ->> 'actor_username') like '%@degrees.demo'
         or lower(payload #>> '{traits,user_email}') like '%@degrees.demo'
    $sql$ using v_users::text[];
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = any($1)' using v_users::text[];
  end if;
  if to_regclass('auth.flow_state') is not null then
    execute 'delete from auth.flow_state where user_id = any($1)' using v_users;
  end if;

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
  (select count(*) from public.events where room_code = 'HACKGT') as hackgt_events,
  (
    select count(*) from public.notifications nt
    where exists (
      select 1 from jsonb_path_query(nt.payload, 'lax $.**') as v(value)
      where jsonb_typeof(v.value) = 'string' and (v.value #>> '{}') like 'd0000000-0000-4000-8000-%'
    )
  ) as notifications_naming_seeded_ids;
