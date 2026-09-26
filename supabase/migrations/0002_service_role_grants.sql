-- Owner: Sahith (Data & Matching) — added by Pranav Sep 26; review.
-- 0001 grants SELECT to `authenticated` but nothing to `service_role`. On this project Supabase no longer grants
-- table privileges by default, so the API server's service-role key got "permission denied for table profiles"
-- (42501) on every table. The server is the only write path, so it needs full access; RLS still governs clients.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables and sequences created by later migrations get the same access.
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
