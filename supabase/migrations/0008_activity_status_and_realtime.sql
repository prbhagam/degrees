-- Owner: Christian (Server & Infra) — PR #22, async activity generation. Renumbered 0007 → 0008 while merging into
-- Sahith's wave-2 branch, whose 0007 (meetups, icebreakers, storage) landed first. Apply after 0007.
--
-- Adds a status column to public.activities ('generating' | 'ready' | 'failed') — POST /groups/:id/activity writes
-- a 'generating' placeholder and a Netlify Background Function replaces it with the real plan — and puts the
-- table in the Realtime publication so the app learns the moment the row flips. Idempotent.

alter table public.activities
  add column if not exists status text default 'ready' check (status in ('generating', 'ready', 'failed'));

-- The app filters on group_id (not the primary key); with FULL replica identity UPDATE/DELETE events carry the
-- whole old row so that filter matches. (saveActivity deletes the placeholder, then inserts the real plan.)
alter table public.activities replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activities'
  ) then
    alter publication supabase_realtime add table public.activities;
  end if;
end $$;
