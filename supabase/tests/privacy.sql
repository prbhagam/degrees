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
