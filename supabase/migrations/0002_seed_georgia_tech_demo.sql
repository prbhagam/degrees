-- Owner: Sahith (Data & Matching) — Georgia Tech demo data for the shared Supabase project.
-- All demo accounts use password: DegreesDemo26!

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
grant all privileges on tables to service_role;

alter default privileges in schema public
grant all privileges on sequences to service_role;

alter default privileges in schema public
grant execute on functions to service_role;

-- Keep all staging-table work in one statement. This matters in the Supabase
-- SQL Editor, whose statement runner may otherwise use different sessions.
do $seed$
begin

drop table if exists public._degrees_seed_people;

create table public._degrees_seed_people (
  position integer primary key,
  id uuid unique not null,
  email text unique not null,
  username text unique not null,
  display_name text not null,
  bio text not null,
  lat double precision not null,
  lng double precision not null,
  tags text[] not null,
  embedding_cluster integer not null
);

insert into public._degrees_seed_people values
  (1,  'd0000000-0000-4000-8000-000000000001', 'maya.chen@degrees.demo',      'maya.chen',      'Maya Chen',     'Georgia Tech architecture student, amateur potter, and regular at the student center who is always looking for Atlanta''s best dumplings.', 33.7756, -84.3963, array['pottery','food crawls','architecture','coffee'], 1),
  (2,  'd0000000-0000-4000-8000-000000000002', 'alex.rivera@degrees.demo',   'alex.rivera',   'Alex Rivera',   'Georgia Tech CS student who balances hackathons, intramural soccer, and live music around Midtown.', 33.7771, -84.3894, array['soccer','live music','coding','tacos'], 2),
  (3,  'd0000000-0000-4000-8000-000000000003', 'priya.patel@degrees.demo',   'priya.patel',   'Priya Patel',   'Georgia Tech biomedical engineering major, weekend trail runner, and enthusiastic campus game-night regular.', 33.7738, -84.3955, array['running','hiking','biomedical engineering','board games'], 3),
  (4,  'd0000000-0000-4000-8000-000000000004', 'jordan.kim@degrees.demo',    'jordan.kim',    'Jordan Kim',    'Georgia Tech computational media student who shoots film for Technique and hunts for tiny concerts and good ramen.', 33.7782, -84.3929, array['photography','concerts','student media','ramen'], 2),
  (5,  'd0000000-0000-4000-8000-000000000005', 'leo.martinez@degrees.demo',  'leo.martinez',  'Leo Martinez',  'Georgia Tech mechanical engineering student, CRC climber, and serial organizer of residence-hall game nights.', 33.7818, -84.4011, array['rock climbing','board games','engineering','coffee'], 3),
  (6,  'd0000000-0000-4000-8000-000000000006', 'zoe.williams@degrees.demo',  'zoe.williams',  'Zoe Williams',  'Georgia Tech industrial design student who illustrates for campus clubs and never says no to karaoke in Midtown.', 33.7731, -84.3917, array['illustration','design','karaoke','baking'], 1),
  (7,  'd0000000-0000-4000-8000-000000000007', 'sam.okafor@degrees.demo',    'sam.okafor',    'Sam Okafor',    'Georgia Tech data science student, home cook, and cyclist who commutes across campus and explores Atlanta on weekends.', 33.7758, -84.3902, array['cycling','cooking','data science','food crawls'], 3),
  (8,  'd0000000-0000-4000-8000-000000000008', 'nina.thompson@degrees.demo', 'nina.thompson', 'Nina Thompson', 'Georgia State journalism student who visits Tech friends for trivia, indie movies, and BeltLine walks.', 33.7764, -84.3881, array['indie film','trivia','walking','podcasts'], 4),
  (9,  'd0000000-0000-4000-8000-000000000009', 'ethan.brooks@degrees.demo',  'ethan.brooks',  'Ethan Brooks',  'Georgia Tech electrical engineering student, jazz drummer, chess beginner, and loyal fan of Tech Square coffee shops.', 33.7769, -84.3832, array['jazz','chess','coffee','concerts'], 2),
  (10, 'd0000000-0000-4000-8000-000000000010', 'amina.yusuf@degrees.demo',   'amina.yusuf',   'Amina Yusuf',   'Emory public health student who comes into Midtown for spoken word, tennis, and community volunteering with Tech friends.', 33.7795, -84.3817, array['poetry','tennis','volunteering','books'], 4),
  (11, 'd0000000-0000-4000-8000-000000000011', 'noah.green@degrees.demo',    'noah.green',    'Noah Green',    'Georgia Tech city planning student, MARTA enthusiast, and weekend kayaker with strong opinions about campus transit.', 33.7796, -84.3987, array['urbanism','kayaking','transit','architecture'], 3),
  (12, 'd0000000-0000-4000-8000-000000000012', 'sofia.nguyen@degrees.demo',  'sofia.nguyen',  'Sofia Nguyen',  'Georgia Tech industrial design student collecting zines, recipes, and reasons to host a picnic on Tech Green.', 33.7702, -84.3946, array['design','zines','picnics','cooking'], 1);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  email,
  extensions.crypt('DegreesDemo26!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', display_name),
  now(),
  now(),
  '',
  '',
  '',
  ''
from public._degrees_seed_people
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  ('a0000000-0000-4000-8000-' || lpad(position::text, 12, '0'))::uuid,
  id::text,
  id,
  jsonb_build_object('sub', id::text, 'email', email),
  'email',
  now(),
  now(),
  now()
from public._degrees_seed_people
on conflict do nothing;

insert into public.profiles (
  id,
  username,
  display_name,
  bio,
  ai_paragraph,
  city,
  lat,
  lng
)
select
  id,
  username,
  display_name,
  bio,
  bio || ' They would enjoy meeting people interested in '
    || array_to_string(tags, ', ') || '.',
  'Atlanta',
  lat,
  lng
from public._degrees_seed_people
on conflict (id) do update set
  username = excluded.username,
  display_name = excluded.display_name,
  bio = excluded.bio,
  ai_paragraph = excluded.ai_paragraph,
  city = excluded.city,
  lat = excluded.lat,
  lng = excluded.lng;

delete from public.profile_tags
where user_id in (select id from public._degrees_seed_people);

insert into public.profile_tags (user_id, label, kind)
select
  person.id,
  tag.label,
  case
    when tag.ordinality <= 2 then 'hobby'
    when tag.ordinality = 3 then 'activity'
    else 'derived'
  end
from public._degrees_seed_people person
cross join lateral unnest(person.tags) with ordinality
  as tag(label, ordinality);

-- Profiles in the same interest cluster receive similar deterministic vectors.
insert into public.profile_embeddings (user_id, embedding, updated_at)
select
  person.id,
  (
    select (
      '[' || string_agg(
        (
          case
            when dimension = person.embedding_cluster then 1.0
            when dimension = 10 + person.embedding_cluster then 0.5
            else sin(dimension * person.position * 0.73) * 0.005
          end
        )::text,
        ',' order by dimension
      ) || ']'
    )::vector
    from generate_series(1, 768) as dimensions(dimension)
  ),
  now()
from public._degrees_seed_people person
on conflict (user_id) do update set
  embedding = excluded.embedding,
  updated_at = excluded.updated_at;

insert into public.preferences (
  user_id,
  cost_min_cents,
  cost_max_cents,
  max_travel_mi,
  frequency,
  group_size_min,
  group_size_max,
  max_degrees
)
select
  id,
  0,
  case when position % 3 = 0 then 2500 else 4000 end,
  5 + (position % 3) * 5,
  case when position % 4 = 0 then 'monthly' else 'weekly' end,
  3,
  5 + (position % 2),
  case when position % 3 = 0 then 3 else 2 end
from public._degrees_seed_people
on conflict (user_id) do update set
  cost_min_cents = excluded.cost_min_cents,
  cost_max_cents = excluded.cost_max_cents,
  max_travel_mi = excluded.max_travel_mi,
  frequency = excluded.frequency,
  group_size_min = excluded.group_size_min,
  group_size_max = excluded.group_size_max,
  max_degrees = excluded.max_degrees;

insert into public.events (id, room_code, name, city, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'HACKGT',
  'HackGT 13 at Georgia Tech',
  'Atlanta',
  'd0000000-0000-4000-8000-000000000001'
)
on conflict (room_code) do update set
  name = excluded.name,
  city = excluded.city,
  created_by = excluded.created_by;

insert into public.event_attendees (event_id, user_id)
select event.id, person.id
from public.events event
cross join public._degrees_seed_people person
where event.room_code = 'HACKGT'
on conflict (event_id, user_id) do nothing;

-- LEAST/GREATEST enforce the canonical user_a < user_b invariant.
with edges(left_position, right_position, met_context) as (
  values
    (1, 2, 'event'),
    (1, 3, 'event'),
    (2, 4, 'event'),
    (2, 6, 'event'),
    (3, 5, 'event'),
    (3, 7, 'event'),
    (4, 8, 'manual'),
    (5, 9, 'manual'),
    (6, 10, 'manual'),
    (7, 11, 'manual'),
    (8, 12, 'manual'),
    (10, 12, 'manual')
)
insert into public.connections (
  user_a,
  user_b,
  met_at,
  met_context,
  event_id
)
select
  least(left_person.id, right_person.id),
  greatest(left_person.id, right_person.id),
  now() - make_interval(days => 20 - edges.left_position),
  edges.met_context,
  case
    when edges.met_context = 'event'
      then (select id from public.events where room_code = 'HACKGT')
    else null
  end
from edges
join public._degrees_seed_people left_person
  on left_person.position = edges.left_position
join public._degrees_seed_people right_person
  on right_person.position = edges.right_position
on conflict (user_a, user_b) do update set
  met_at = excluded.met_at,
  met_context = excluded.met_context,
  event_id = excluded.event_id;

insert into public.groups (id, formed_at, reasoning, status)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '2026-09-14T19:00:00Z',
    'A creative food-focused student group connected through Maya and Alex on the Georgia Tech campus.',
    'completed'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '2026-09-20T15:00:00Z',
    'An outdoorsy student group with overlapping interests and comfortable second-degree introductions near campus.',
    'completed'
  )
on conflict (id) do update set
  formed_at = excluded.formed_at,
  reasoning = excluded.reasoning,
  status = excluded.status;

drop table if exists public._degrees_seed_members;

create table public._degrees_seed_members (
  group_id uuid not null,
  person_position integer not null,
  degree integer not null,
  primary key (group_id, person_position)
);

insert into public._degrees_seed_members values
  ('10000000-0000-4000-8000-000000000001', 1, 0),
  ('10000000-0000-4000-8000-000000000001', 2, 1),
  ('10000000-0000-4000-8000-000000000001', 4, 2),
  ('10000000-0000-4000-8000-000000000001', 6, 2),
  ('10000000-0000-4000-8000-000000000002', 3, 0),
  ('10000000-0000-4000-8000-000000000002', 5, 1),
  ('10000000-0000-4000-8000-000000000002', 7, 1),
  ('10000000-0000-4000-8000-000000000002', 11, 2);

insert into public.group_members (group_id, user_id, degree)
select members.group_id, people.id, members.degree
from public._degrees_seed_members members
join public._degrees_seed_people people
  on people.position = members.person_position
on conflict (group_id, user_id) do update set
  degree = excluded.degree;

insert into public.activities (
  id,
  group_id,
  title,
  venue,
  address,
  lat,
  lng,
  price_cents,
  starts_at,
  source,
  source_url,
  reasoning
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Tech Square dinner crawl',
    'The Collective Food Hall at Coda',
    '756 W Peachtree St NW, Atlanta, GA',
    33.7759,
    -84.3873,
    2200,
    '2026-09-14T19:30:00Z',
    'maps',
    'https://maps.google.com/?q=The+Collective+Food+Hall+at+Coda',
    'A walkable Tech Square venue with several casual options makes conversation easy and fits student budgets.'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'Tech Green picnic and lawn games',
    'Tech Green',
    '350 Ferst Dr NW, Atlanta, GA',
    33.7747,
    -84.3974,
    1200,
    '2026-09-20T15:30:00Z',
    'maps',
    'https://maps.google.com/?q=Tech+Green+Georgia+Tech',
    'A low-cost outdoor plan in the center of campus matches the group''s activity, budget, and travel preferences.'
  )
on conflict (id) do update set
  title = excluded.title,
  venue = excluded.venue,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  price_cents = excluded.price_cents,
  starts_at = excluded.starts_at,
  source = excluded.source,
  source_url = excluded.source_url,
  reasoning = excluded.reasoning;

with ranked_members as (
  select
    members.*,
    row_number() over (
      order by members.group_id, members.person_position
    ) as feedback_number
  from public._degrees_seed_members members
)
insert into public.event_feedback (
  id,
  group_id,
  author_id,
  rating,
  free_text,
  analyzed_tags,
  created_at
)
select
  (
    '40000000-0000-4000-8000-'
    || lpad(ranked.feedback_number::text, 12, '0')
  )::uuid,
  ranked.group_id,
  people.id,
  case when ranked.feedback_number % 4 = 1 then 4 else 5 end,
  case
    when ranked.feedback_number % 2 = 0
      then 'I would happily hang out with this group again.'
    else 'Easy conversation and a genuinely good activity pick.'
  end,
  case
    when ranked.group_id = '10000000-0000-4000-8000-000000000001'
      then '["food","creative","easygoing"]'::jsonb
    else '["outdoors","active","friendly"]'::jsonb
  end,
  case
    when ranked.group_id = '10000000-0000-4000-8000-000000000001'
      then '2026-09-14T22:00:00Z'::timestamptz
    else '2026-09-20T22:00:00Z'::timestamptz
  end
from ranked_members ranked
join public._degrees_seed_people people
  on people.position = ranked.person_position
on conflict (group_id, author_id) do update set
  rating = excluded.rating,
  free_text = excluded.free_text,
  analyzed_tags = excluded.analyzed_tags,
  created_at = excluded.created_at;

insert into public.feedback_peers (
  feedback_id,
  peer_id,
  would_meet_again
)
select
  feedback.id,
  peer.id,
  true
from public.event_feedback feedback
join public._degrees_seed_members author_membership
  on author_membership.group_id = feedback.group_id
join public._degrees_seed_people author
  on author.position = author_membership.person_position
 and author.id = feedback.author_id
join public._degrees_seed_members peer_membership
  on peer_membership.group_id = feedback.group_id
 and peer_membership.person_position <> author_membership.person_position
join public._degrees_seed_people peer
  on peer.position = peer_membership.person_position
where feedback.group_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
)
on conflict (feedback_id, peer_id) do update set
  would_meet_again = excluded.would_meet_again;

drop table public._degrees_seed_members;
drop table public._degrees_seed_people;

end;
$seed$;

-- Verification: invalid_connection_order must be 0 and second_degree_pairs positive.
with undirected_edges as (
  select user_a as source, user_b as target
  from public.connections

  union all

  select user_b as source, user_a as target
  from public.connections
),
second_degree_pairs as (
  select distinct
    least(first_edge.source, second_edge.target) as user_a,
    greatest(first_edge.source, second_edge.target) as user_b
  from undirected_edges first_edge
  join undirected_edges second_edge
    on second_edge.source = first_edge.target
  where first_edge.source <> second_edge.target
    and not exists (
      select 1
      from undirected_edges direct_edge
      where direct_edge.source = first_edge.source
        and direct_edge.target = second_edge.target
    )
)
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profile_embeddings) as embeddings,
  (select count(*) from public.connections) as connections,
  (select count(*) from second_degree_pairs) as second_degree_pairs,
  (select count(*) from public.groups where status = 'completed') as completed_groups,
  (select count(distinct group_id) from public.event_feedback) as groups_with_feedback,
  (select count(*) from public.events where room_code = 'HACKGT') as hackgt_events,
  (
    select count(*)
    from public.connections
    where user_a >= user_b
  ) as invalid_connection_order;
