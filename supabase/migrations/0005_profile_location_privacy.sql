-- Owner: Sahith (Data & Matching) — hides profiles.lat/lng from signed-in clients.
-- RLS lets you read a groupmate's whole profile row (policy profiles_select_own_or_shared_group), and RLS can't hide
-- single columns. Bio being visible to groupmates is intended (matching only reveals it once you share a group), but
-- lat/lng is a precise location, so anyone you were grouped with could read where you live. Column grants close it:
-- `authenticated` keeps SELECT on every other column. The server reads location with the service role, and the app
-- never selects lat/lng (or `*`) from profiles directly, so nothing else changes.
-- Apply after 0001 (SQL editor or psql). Safe to rerun.

-- Table-level SELECT (from 0001, and from Supabase's default privileges) covers every column; column grants only
-- restrict once it is gone.
revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, bio, ai_paragraph, city, created_at)
  on public.profiles to authenticated;
