-- Owner: Sahith (Data & Matching) — generated from docs/DATA-MODEL.md; embeddings are 768 dimensions.
-- Additions beyond DATA-MODEL.md (review):
--   * gen_random_uuid() defaults on UUID primary keys other than profiles.id
--   * events created before connections to satisfy connections.event_id
--   * event_attendees foreign keys and joined_at default
--   * checks for documented enums, rating 1–5, max_degrees 1–3, and canonical edges
--   * traversal/tag/message/HNSW indexes
--   * RLS, minimal read policies, and the security-definer membership helper
--   * messages added to the Supabase Realtime publication
-- RLS cannot hide only profiles.bio; shared-group row access exposes the whole profile row. Review at H0.

create extension if not exists vector;

create table public.profiles (
  id uuid primary key references auth.users(id),
  username text unique not null,
  display_name text,
  bio text,
  ai_paragraph text,
  city text,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

create table public.profile_tags (
  id bigserial primary key,
  user_id uuid references public.profiles(id),
  label text not null,
  kind text not null check (kind in ('hobby', 'activity', 'derived'))
);

create table public.profile_embeddings (
  user_id uuid primary key references public.profiles(id),
  embedding vector(768) not null,
  updated_at timestamptz default now()
);

create table public.preferences (
  user_id uuid primary key references public.profiles(id),
  cost_min_cents int,
  cost_max_cents int,
  max_travel_mi int,
  frequency text check (frequency in ('daily', 'weekly', 'monthly')),
  group_size_min int,
  group_size_max int,
  max_degrees int check (max_degrees between 1 and 3)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  name text,
  city text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.connections (
  user_a uuid references public.profiles(id),
  user_b uuid references public.profiles(id),
  met_at timestamptz default now(),
  met_context text check (met_context in ('qr', 'event', 'group', 'manual')),
  event_id uuid references public.events(id),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table public.event_attendees (
  event_id uuid references public.events(id),
  user_id uuid references public.profiles(id),
  joined_at timestamptz default now(),
  primary key (event_id, user_id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  formed_at timestamptz default now(),
  reasoning text,
  status text check (status in ('proposed', 'confirmed', 'completed'))
);

create table public.group_members (
  group_id uuid references public.groups(id),
  user_id uuid references public.profiles(id),
  degree int,
  primary key (group_id, user_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id),
  title text,
  venue text,
  address text,
  lat double precision,
  lng double precision,
  price_cents int,
  starts_at timestamptz,
  source text check (source in ('maps', 'ticketmaster')),
  source_url text,
  reasoning text
);

create table public.messages (
  id bigserial primary key,
  group_id uuid references public.groups(id),
  sender_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz default now()
);

create table public.event_feedback (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id),
  author_id uuid references public.profiles(id),
  rating int check (rating between 1 and 5),
  free_text text,
  analyzed_tags jsonb,
  created_at timestamptz default now(),
  unique (group_id, author_id)
);

create table public.feedback_peers (
  feedback_id uuid references public.event_feedback(id),
  peer_id uuid references public.profiles(id),
  would_meet_again boolean not null,
  primary key (feedback_id, peer_id)
);

create index connections_user_b_idx on public.connections(user_b);
create index profile_tags_user_id_idx on public.profile_tags(user_id);
create index messages_group_id_created_at_idx on public.messages(group_id, created_at);
create index profile_embeddings_embedding_hnsw_idx
  on public.profile_embeddings using hnsw (embedding vector_cosine_ops);

create function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = gid
      and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.profile_tags enable row level security;
alter table public.profile_embeddings enable row level security;
alter table public.preferences enable row level security;
alter table public.events enable row level security;
alter table public.connections enable row level security;
alter table public.event_attendees enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.activities enable row level security;
alter table public.messages enable row level security;
alter table public.event_feedback enable row level security;
alter table public.feedback_peers enable row level security;

create policy "profiles_select_own_or_shared_group"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.group_members as target_membership
    where target_membership.user_id = profiles.id
      and public.is_group_member(target_membership.group_id)
  )
);

create policy "profile_tags_select_own"
on public.profile_tags for select to authenticated
using (user_id = (select auth.uid()));

create policy "preferences_select_own"
on public.preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy "groups_select_member"
on public.groups for select to authenticated
using (public.is_group_member(id));

create policy "group_members_select_member"
on public.group_members for select to authenticated
using (public.is_group_member(group_id));

create policy "activities_select_member"
on public.activities for select to authenticated
using (public.is_group_member(group_id));

create policy "messages_select_member"
on public.messages for select to authenticated
using (public.is_group_member(group_id));

alter publication supabase_realtime add table public.messages;
