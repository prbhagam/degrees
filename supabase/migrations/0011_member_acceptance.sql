-- Owner: Sahith (Data & Matching) — Sep 26 wave 4: every member accepts or declines a proposed group individually.
--
-- Before: one member tapping Accept flipped groups.status to 'confirmed' for everyone (team decision 2 from
-- Sep 26, revisited after testing — "BIG ISSUE"). Now each membership carries its own accepted_at; the server
-- confirms the group only once every remaining member has accepted, and a decline removes just that member.
--   * group_members.accepted_at: null = hasn't answered yet.
--   * Backfill: meetup members, members of already confirmed/completed groups, and the requester of a proposed
--     group (they asked for it) count as accepted.
--   * match_create_group: the requester's row is created already accepted. Identical to 0003 otherwise.
-- Additive and idempotent.

alter table public.group_members
  add column if not exists accepted_at timestamptz;

update public.group_members gm
  set accepted_at = coalesce(g.formed_at, now())
  from public.groups g
  where g.id = gm.group_id
    and gm.accepted_at is null
    and (g.status in ('confirmed', 'completed') or g.kind = 'meetup' or gm.degree = 0);

create or replace function public.match_create_group(p_reasoning text, p_members jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_group_id uuid;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 then
    raise exception 'match_create_group: p_members must be a non-empty array' using errcode = '22023';
  end if;

  insert into public.groups (reasoning, status)
  values (p_reasoning, 'proposed')
  returning public.groups.id into v_group_id;

  -- A duplicate user or unknown user id raises here and rolls back the groups insert above.
  -- wave 4: the requester (degree 0) has implicitly accepted; everyone else answers from the app.
  insert into public.group_members (group_id, user_id, degree, accepted_at)
  select
    v_group_id,
    (m ->> 'user_id')::uuid,
    (m ->> 'degree')::int,
    case when (m ->> 'degree')::int = 0 then now() else null end
  from jsonb_array_elements(p_members) as m;

  return v_group_id;
end;
$$;

revoke all on function public.match_create_group(text, jsonb) from public, anon, authenticated;
grant execute on function public.match_create_group(text, jsonb) to service_role;
grant update on public.groups, public.group_members to service_role;
