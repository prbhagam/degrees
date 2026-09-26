#!/usr/bin/env bash
# Owner: Sahith (Data & Matching) — applies 0001 + 0003-0006 to a throwaway local Postgres and runs matching.sql + privacy.sql.
# Never touches the shared Supabase project. Requires Homebrew postgresql + pgvector.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"
work="$(mktemp -d)"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"

cleanup() {
  pg_ctl -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

initdb -D "$work/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/pg.log" -w start >/dev/null

psql_run() { psql -h "$work" -p "$port" -U postgres -d degrees -v ON_ERROR_STOP=1 -q "$@"; }
psql -h "$work" -p "$port" -U postgres -d postgres -q -c 'create database degrees'

if ! psql_run -tAc "select 1 from pg_available_extensions where name = 'vector'" | grep -q 1; then
  echo "pgvector is not installed for this Postgres. Run: brew install pgvector" >&2
  exit 1
fi

# Supabase shim: roles, auth schema, Realtime publication, and pgvector in `extensions` (as Supabase does).
psql_run <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as 'select null::uuid';
create schema extensions;
create extension vector schema extensions;
grant usage on schema public, extensions to anon, authenticated, service_role;
alter database degrees set search_path = "$user", public, extensions;
set client_min_messages = error;
create publication supabase_realtime;
SQL

psql_run -f "$migrations/0001_init.sql"
psql_run -f "$migrations/0003_matching_functions.sql"
psql_run -f "$migrations/0004_meet_again_boost.sql"
psql_run -f "$migrations/0005_profile_location_privacy.sql"
psql_run -f "$migrations/0006_contact_events_photos_notifications.sql"
psql_run -f "$here/matching.sql"
echo "matching.sql: all assertions passed"
psql_run -f "$here/privacy.sql"
echo "privacy.sql: all assertions passed"
