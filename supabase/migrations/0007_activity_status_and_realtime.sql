-- Migration 0007: Activity async status and Realtime publication.
-- Adds a status column to public.activities ('generating' | 'ready' | 'failed')
-- and adds the table to supabase_realtime so clients can listen for completed generation.

alter table public.activities
  add column if not exists status text default 'ready' check (status in ('generating', 'ready', 'failed'));

-- Allow Realtime publication for activities
alter publication supabase_realtime add table public.activities;
