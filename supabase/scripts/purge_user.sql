-- Purge ONE account by username, and every trace of it, from the Degrees database.
-- Set v_username below, then run the whole thing in the Supabase SQL Editor (as postgres). One DO block = one
-- transaction: all of it applies or none of it does. Errors (and changes nothing) if the username doesn't exist.
--
-- Removes: the auth user (identities/sessions cascade; audit log, refresh tokens, flow state cleared) and profile,
-- tags, embedding, preferences; their memberships, messages, photo rows, feedback written or received, contact
-- exchanges, connections, time proposals/votes, and notifications; meetups/groups they hosted (for everyone in them);
-- groups left with no one else (meetups) or fewer than two others (matched), with those groups' chat, plans, photos,
-- icebreakers, feedback; anyone's notifications pointing at them or a deleted group/event. In groups that survive,
-- their name becomes "someone" in the stored reasoning, group name, plan reasoning, icebreakers, and time notes
-- (unless another account shares the name), and icebreakers of groups they were in are cleared.
-- Left: other people's own chat/feedback text (counted in the notice), and Storage files (count in the notice;
-- delete avatars/<user id>/ from the dashboard). Needs migrations 0010 + 0011.

do $purge$
declare
  v_username constant text := 'CHANGE_ME';   -- <- the username to purge (without the @)
  v_dry_run constant boolean := false;       -- true = only report what would be removed
  v_users uuid[];
  v_emails text[];
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
    raise exception '%: apply migrations 0010 and 0011 first (connection_contacts, group_members.accepted_at)', 'purge_user'
      using hint = 'Nothing was changed.';
  end if;

  -- The profile with that username, plus any auth user signed up under it whose profile row never got created.
  select coalesce(array_agg(distinct id), '{}') into v_users
  from (
    select p.id from public.profiles p where p.username = lower(trim(v_username))
    union
    select u.id from auth.users u where lower(u.raw_user_meta_data ->> 'username') = lower(trim(v_username))
  ) matched;

  if cardinality(v_users) = 0 then
    raise exception 'purge_user: no account with username %', v_username
      using hint = 'Usernames are lowercase, without the @. Nothing was changed.';
  end if;

  select coalesce(array_agg(lower(email)), '{}') into v_emails
  from auth.users where id = any(v_users) and email is not null;

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

  -- An event they hosted goes with its backing group, and vice versa.
  select coalesce(array_agg(e.id), '{}') into v_events
  from public.events e
  where e.created_by = any(v_users) or e.group_id = any(v_groups);

  select v_groups || coalesce(array_agg(e.group_id), '{}') into v_groups
  from public.events e
  where e.id = any(v_events) and e.group_id is not null and not (e.group_id = any(v_groups));

  -- Surviving groups they leave behind (their generated text may name this person).
  select coalesce(array_agg(distinct m.group_id), '{}') into v_affected
  from public.group_members m
  where m.user_id = any(v_users) and not (m.group_id = any(v_groups));

  -- Every id a notification payload could point at.
  v_ids := v_users::text[] || v_groups::text[] || v_events::text[];

  -- Their names, safe to redact: full display name, plus first name if 3+ letters, unless another account has the
  -- same full name or first name. Longest first so "Maya Chen" goes before "Maya".
  with target_names as (
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
    select d.full_name as name from target_names d
    where lower(d.full_name) not in (select r.full_name from real_names r)
    union
    select d.first_name from target_names d
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

  raise notice 'purging @% (%): groups: %, events: %, surviving groups losing a member: %, storage objects left behind: %',
    v_username, array_to_string(v_emails, ', '),
    cardinality(v_groups), cardinality(v_events), cardinality(v_affected), v_storage_objects;
  raise notice 'other people''s messages/feedback that mention their name (left as written): %', v_real_mentions;

  if v_dry_run then
    raise notice 'dry run: nothing deleted';
    return;
  end if;

  -- Children first: there are no ON DELETE CASCADEs in public (supabase/AGENTS.md).
  delete from public.group_icebreakers where group_id = any(v_groups) or group_id = any(v_affected);

  -- 0012 time polls: votes by the accounts, and times they proposed or in deleted groups (with those times' votes).
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

  -- Their own notifications, and anyone's that points at them or a deleted group/event anywhere in the
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

  -- Wave 4 (0011): a matched group confirms once every remaining member has accepted. Removing a member who
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
         or lower(payload ->> 'actor_username') = any($2)
         or lower(payload #>> '{traits,user_email}') = any($2)
    $sql$ using v_users::text[], v_emails;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = any($1)' using v_users::text[];
  end if;
  if to_regclass('auth.flow_state') is not null then
    execute 'delete from auth.flow_state where user_id = any($1)' using v_users;
  end if;

  delete from auth.users where id = any(v_users);
  get diagnostics n = row_count;
  raise notice 'purged @%: % auth user(s) removed', v_username, n;
end;
$purge$;
