-- Owner: Sahith (Data & Matching) — assertions for 0005 (profile location privacy); run via supabase/tests/run-local.sh.
do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'select') then
    raise exception 'authenticated should not have table-level select on profiles';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'lat', 'select')
     or has_column_privilege('authenticated', 'public.profiles', 'lng', 'select') then
    raise exception 'authenticated must not read profiles.lat/lng';
  end if;
  if not (
    has_column_privilege('authenticated', 'public.profiles', 'id', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'bio', 'select')
    and has_column_privilege('authenticated', 'public.profiles', 'city', 'select')
  ) then
    raise exception 'authenticated should still read the non-location profile columns';
  end if;
  if not has_table_privilege('authenticated', 'public.group_members', 'select') then
    raise exception '0005 must not touch other tables';
  end if;
end $$;

-- A select that names lat now fails for a signed-in client; naming only granted columns works.
set role authenticated;
do $$
begin
  begin
    perform lat from public.profiles limit 1;
    raise exception 'selecting lat as authenticated should be denied';
  exception when insufficient_privilege then
    null;
  end;
  perform id, display_name, bio from public.profiles limit 1;
end $$;
reset role;

-- Wave 3 (0010): connection_contacts has zero client grants; activities.created_at exists; membership is in Realtime.
do $$
begin
  if has_table_privilege('authenticated', 'public.connection_contacts', 'select')
     or has_table_privilege('anon', 'public.connection_contacts', 'select') then
    raise exception 'connection_contacts must not be client-readable';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'created_at'
  ) then
    raise exception 'activities.created_at missing (0010)';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('group_members', 'groups')
    having count(*) = 2
  ) then
    raise exception 'group_members and groups must be in supabase_realtime (0010)';
  end if;
end $$;
