-- Owner: Sahith (Data & Matching) — Sep 26 wave 2: one model for groups and meetups, icebreakers, image storage.
--
-- Product decision (Sahith, Sep 26): a *meetup* is the joinable, in-person thing (room code, QR, host) and a
-- *group* is the matched, non-joinable thing — but they are the same kind of container: people, chat, a plan,
-- photos, "leave". So they share the `groups` table, told apart by `groups.kind`. The `events` table stays as the
-- meetup's room-code record (it's what `connections.event_id` points at), and gains `group_id` pointing at the
-- backing group row. Joining a meetup adds a `group_members` row (and, for backward compatibility with the seed
-- and SQL tests, still an `event_attendees` row).
--
-- Additive only. Backfills a backing group for every existing event. Idempotent: safe to re-run.

-- ---- groups: kind + the meetup-facing fields ------------------------------------------------
alter table public.groups
  add column if not exists kind text not null default 'matched',
  add column if not exists name text,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists scheduled_at timestamptz;
alter table public.groups
  drop constraint if exists groups_kind_check;
alter table public.groups
  add constraint groups_kind_check check (kind in ('matched', 'meetup'));

-- ---- events: link to the backing group, expiry, ended --------------------------------------
-- code_expires_at: a room code stops accepting joins 24h after the meetup's scheduled time (or its creation
-- when unscheduled). ended_at: the host (or any attendee) ended the meetup, which also closes the code.
alter table public.events
  add column if not exists group_id uuid references public.groups(id),
  add column if not exists code_expires_at timestamptz,
  add column if not exists ended_at timestamptz;
create unique index if not exists events_group_id_key on public.events(group_id);

update public.events
  set code_expires_at = coalesce(scheduled_at, created_at, now()) + interval '24 hours'
  where code_expires_at is null;

-- Backfill: every existing event gets a backing meetup group with its attendees as members.
do $$
declare
  ev record;
  gid uuid;
begin
  for ev in select * from public.events where group_id is null loop
    insert into public.groups (kind, name, created_by, scheduled_at, status, reasoning, formed_at)
    values ('meetup', ev.name, ev.created_by, ev.scheduled_at, 'confirmed', null, ev.created_at)
    returning id into gid;
    update public.events set group_id = gid where id = ev.id;
    insert into public.group_members (group_id, user_id, degree)
    select gid, a.user_id, null from public.event_attendees a where a.event_id = ev.id
    on conflict do nothing;
    -- The host is always a member, even if they never "joined" their own code.
    if ev.created_by is not null then
      insert into public.group_members (group_id, user_id, degree)
      values (gid, ev.created_by, 0)
      on conflict do nothing;
    end if;
  end loop;
end $$;

-- ---- icebreakers: Gemini-written conversation starters for a meetup (or any group) ----------
create table if not exists public.group_icebreakers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  position int not null,
  prompt text not null,
  created_at timestamptz default now(),
  unique (group_id, position)
);
alter table public.group_icebreakers enable row level security;
drop policy if exists "group_icebreakers_select_member" on public.group_icebreakers;
create policy "group_icebreakers_select_member"
on public.group_icebreakers for select to authenticated
using (public.is_group_member(group_id));
grant select on public.group_icebreakers to authenticated;

-- ---- storage: event photos (private, per-group folder) + avatars (public, per-user folder) --
-- The client uploads directly (docs/API-CONTRACTS.md: "client uploads the image to Supabase Storage first, then
-- posts the resulting path") under these policies; the server records the pointer and signs read URLs.
-- Object paths: event-photos/<group_id>/<uuid>.jpg · avatars/<user_id>/<uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-photos', 'event-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event_photos_insert_member" on storage.objects;
create policy "event_photos_insert_member"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-photos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.is_group_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "event_photos_select_member" on storage.objects;
create policy "event_photos_select_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'event-photos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.is_group_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Public bucket: reads go through the public URL, no select policy needed.
