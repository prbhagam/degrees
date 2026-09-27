-- Owner: Sahith (Data & Matching) — bring the 60 seeded Atlanta demo accounts back, for testing.
-- The inverse of purge_demo_users.sql. Run in the Supabase SQL Editor (or psql) as postgres / service role.
--
-- 0002's 12 Georgia Tech people, graph, completed groups, feedback, and HACKGT meetup (migrations/0002_seed_georgia_tech_demo.sql),
-- plus 48 more accounts (13–60, added Sep 27) across Atlanta campuses in eight friend circles, 76 seeded-random
-- extra connections among them, 10 avoid tags,
-- written against today's schema (0002 predates 0006–0011: feedback_peers.relationship, groups.kind/completed_at,
-- events.group_id, group_members.accepted_at, activities.status/created_at).
-- Differences from what 0002 + the later backfills left on the shared project, on purpose:
--   * HACKGT's room code never expires (code_expires_at null) and is re-opened (ended_at null), so it's always
--     joinable for a demo.
--   * The two completed groups get completed_at (their chat/photo window closed long ago) and positive sentiment.
--
-- Logins: <username>@degrees.demo / DegreesDemo26!  (e.g. maya.chen@degrees.demo)
--
-- Idempotent: re-running resets the seeded rows to canonical values and leaves everything else alone (activity
-- testers added — messages, new groups — is kept). An existing embedding is kept; a missing one gets 0002's
-- placeholder vector. Afterwards run `npm run seed` to replace placeholders with real Gemini embeddings.
-- Needs migrations 0010 and 0011. Refuses (and changes nothing) if a real account now holds one of the seeded usernames or the HACKGT code.

do $seed$
declare
  v_conflicts text;
  v_event_id uuid;
  v_meetup_id uuid;
begin

  if to_regclass('public.connection_contacts') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'group_members' and column_name = 'accepted_at'
     ) then
    raise exception '%: apply migrations 0010 and 0011 first (connection_contacts, group_members.accepted_at)', 'restore_demo_users'
      using hint = 'Nothing was changed.';
  end if;


drop table if exists pg_temp._demo_people, pg_temp._demo_members;

create temp table _demo_people (
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
) on commit drop;

insert into _demo_people values
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
  (12, 'd0000000-0000-4000-8000-000000000012', 'sofia.nguyen@degrees.demo',  'sofia.nguyen',  'Sofia Nguyen',  'Georgia Tech industrial design student collecting zines, recipes, and reasons to host a picnic on Tech Green.', 33.7702, -84.3946, array['design','zines','picnics','cooking'], 1),
  -- Added Sep 27: 48 more (13–60) in eight friend circles, each bridged onto someone 2nd-degree from Maya — so
  -- they're 3rd degree or further for her and the original demo arc (max 2 degrees) is unchanged. 59–60 have no
  -- connections yet.
  (13, 'd0000000-0000-4000-8000-000000000013', 'marcus.hill@degrees.demo', 'marcus.hill', 'Marcus Hill', 'Georgia Tech civil engineering student who route-sets at the CRC and spends weekends at Stone Mountain.', 33.7790, -84.4030, array['rock climbing','hiking','camping','coffee'], 3),
  (14, 'd0000000-0000-4000-8000-000000000014', 'hana.suzuki@degrees.demo', 'hana.suzuki', 'Hana Suzuki', 'Georgia Tech aerospace student, trail runner, and the friend who always has a spare headlamp.', 33.7772, -84.4005, array['trail running','camping','astronomy','podcasts'], 3),
  (15, 'd0000000-0000-4000-8000-000000000015', 'diego.ramos@degrees.demo', 'diego.ramos', 'Diego Ramos', 'Georgia Tech business student who leads Outdoor Rec kayak trips on the Chattahoochee.', 33.7805, -84.3998, array['kayaking','hiking','photography','tacos'], 3),
  (16, 'd0000000-0000-4000-8000-000000000016', 'grace.owens@degrees.demo', 'grace.owens', 'Grace Owens', 'Georgia Tech biology student, birder, and weekend volunteer at the Chattahoochee Nature Center.', 33.7751, -84.3990, array['birding','hiking','volunteering','baking'], 3),
  (17, 'd0000000-0000-4000-8000-000000000017', 'tyler.nash@degrees.demo', 'tyler.nash', 'Tyler Nash', 'Georgia Tech materials science student who bikes to every trailhead within thirty miles.', 33.7812, -84.4040, array['cycling','camping','rock climbing','coffee'], 3),
  (18, 'd0000000-0000-4000-8000-000000000018', 'ivy.lam@degrees.demo', 'ivy.lam', 'Ivy Lam', 'Georgia Tech industrial engineering student who plans every backpacking trip in a spreadsheet.', 33.7760, -84.4022, array['backpacking','board games','hiking','ramen'], 3),
  (19, 'd0000000-0000-4000-8000-000000000019', 'jamal.carter@degrees.demo', 'jamal.carter', 'Jamal Carter', 'Georgia State music technology student who produces beats and knows every small venue in East Atlanta.', 33.7530, -84.3850, array['music production','concerts','vinyl','tacos'], 2),
  (20, 'd0000000-0000-4000-8000-000000000020', 'lucia.fernandez@degrees.demo', 'lucia.fernandez', 'Lucia Fernandez', 'Georgia State film student who runs a monthly short-film screening in Old Fourth Ward.', 33.7640, -84.3720, array['indie film','photography','concerts','coffee'], 2),
  (21, 'd0000000-0000-4000-8000-000000000021', 'ben.walsh@degrees.demo', 'ben.walsh', 'Ben Walsh', 'Georgia State English major, open-mic regular, and bassist in a band that mostly plays basements.', 33.7555, -84.3880, array['live music','poetry','open mics','thrifting'], 2),
  (22, 'd0000000-0000-4000-8000-000000000022', 'keisha.moore@degrees.demo', 'keisha.moore', 'Keisha Moore', 'Georgia State marketing student who DJs campus parties and collects soul records.', 33.7520, -84.3830, array['djing','vinyl','dancing','brunch'], 2),
  (23, 'd0000000-0000-4000-8000-000000000023', 'ryan.park@degrees.demo', 'ryan.park', 'Ryan Park', 'Georgia State graphic design student who screen-prints gig posters for local bands.', 33.7580, -84.3790, array['printmaking','concerts','design','ramen'], 2),
  (24, 'd0000000-0000-4000-8000-000000000024', 'olivia.grant@degrees.demo', 'olivia.grant', 'Olivia Grant', 'Georgia State theatre student, improv troupe member, and reliable karaoke closer.', 33.7545, -84.3865, array['improv','karaoke','theatre','trivia'], 2),
  (25, 'd0000000-0000-4000-8000-000000000025', 'arjun.mehta@degrees.demo', 'arjun.mehta', 'Arjun Mehta', 'Emory neuroscience student who reads a novel a week and plays pickup cricket on Sundays.', 33.7920, -84.3240, array['books','cricket','neuroscience','chai'], 4),
  (26, 'd0000000-0000-4000-8000-000000000026', 'claire.dubois@degrees.demo', 'claire.dubois', 'Claire Dubois', 'Emory French and public health double major, tennis player, and farmers-market regular.', 33.7905, -84.3265, array['tennis','farmers markets','books','cooking'], 4),
  (27, 'd0000000-0000-4000-8000-000000000027', 'kwame.mensah@degrees.demo', 'kwame.mensah', 'Kwame Mensah', 'Emory economics student who hosts debate nights and plays chess in Decatur Square.', 33.7740, -84.2960, array['chess','debate','podcasts','coffee'], 4),
  (28, 'd0000000-0000-4000-8000-000000000028', 'sara.lindqvist@degrees.demo', 'sara.lindqvist', 'Sara Lindqvist', 'Emory nursing student, lap swimmer, and baker of far too many cardamom buns.', 33.7898, -84.3230, array['swimming','baking','books','yoga'], 4),
  (29, 'd0000000-0000-4000-8000-000000000029', 'daniel.levi@degrees.demo', 'daniel.levi', 'Daniel Levi', 'Emory philosophy student who runs a reading group and never misses trivia night.', 33.7935, -84.3280, array['philosophy','trivia','books','jazz'], 4),
  (30, 'd0000000-0000-4000-8000-000000000030', 'mei.tanaka@degrees.demo', 'mei.tanaka', 'Mei Tanaka', 'Emory biology student, amateur violinist, and board-game cafe loyalist.', 33.7880, -84.3210, array['violin','board games','classical music','bubble tea'], 4),
  (31, 'd0000000-0000-4000-8000-000000000031', 'kevin.nguyen@degrees.demo', 'kevin.nguyen', 'Kevin Nguyen', 'Georgia Tech CS student who organizes game jams and speedruns old Zelda games.', 33.7775, -84.3970, array['game dev','video games','hackathons','boba'], 5),
  (32, 'd0000000-0000-4000-8000-000000000032', 'fatima.ali@degrees.demo', 'fatima.ali', 'Fatima Ali', 'Georgia Tech CS student building robots for RoboJackets and learning to skateboard.', 33.7768, -84.3960, array['robotics','skateboarding','coding','coffee'], 5),
  (33, 'd0000000-0000-4000-8000-000000000033', 'josh.miller@degrees.demo', 'josh.miller', 'Josh Miller', 'Georgia Tech computer engineering student who runs a weekly Dungeons and Dragons campaign.', 33.7790, -84.3945, array['tabletop rpgs','video games','fantasy books','pizza'], 5),
  (34, 'd0000000-0000-4000-8000-000000000034', 'anika.rao@degrees.demo', 'anika.rao', 'Anika Rao', 'Georgia Tech HCI masters student who sketches app ideas in cafes and plays competitive Smash.', 33.7760, -84.3890, array['video games','ux design','sketching','coffee'], 5),
  (35, 'd0000000-0000-4000-8000-000000000035', 'owen.fischer@degrees.demo', 'owen.fischer', 'Owen Fischer', 'Georgia Tech math student, puzzle hunter, and Rubiks cube speedsolver.', 33.7783, -84.3978, array['puzzles','hackathons','chess','ramen'], 5),
  (36, 'd0000000-0000-4000-8000-000000000036', 'lena.kowalski@degrees.demo', 'lena.kowalski', 'Lena Kowalski', 'Georgia Tech cybersecurity student who plays CTFs all weekend and boulders on rest days.', 33.7770, -84.3915, array['ctf competitions','bouldering','coding','anime'], 5),
  (37, 'd0000000-0000-4000-8000-000000000037', 'tomas.silva@degrees.demo', 'tomas.silva', 'Tomas Silva', 'Georgia State hospitality student with a ranked list of every taqueria on Buford Highway.', 33.8480, -84.3010, array['food crawls','cooking','soccer','salsa dancing'], 1),
  (38, 'd0000000-0000-4000-8000-000000000038', 'jenny.cho@degrees.demo', 'jenny.cho', 'Jenny Cho', 'Emory chemistry student and Korean barbecue evangelist who hosts a monthly potluck.', 33.8420, -84.3120, array['cooking','potlucks','karaoke','food crawls'], 1),
  (39, 'd0000000-0000-4000-8000-000000000039', 'ahmed.hassan@degrees.demo', 'ahmed.hassan', 'Ahmed Hassan', 'Georgia State accounting student, home coffee roaster, and weekend flatbread baker.', 33.7570, -84.3530, array['coffee','baking','food crawls','soccer'], 1),
  (40, 'd0000000-0000-4000-8000-000000000040', 'rachel.stein@degrees.demo', 'rachel.stein', 'Rachel Stein', 'Agnes Scott environmental science student who forages, pickles, and gardens in Decatur.', 33.7680, -84.2940, array['gardening','cooking','farmers markets','hiking'], 1),
  (41, 'd0000000-0000-4000-8000-000000000041', 'victor.osei@degrees.demo', 'victor.osei', 'Victor Osei', 'Georgia Tech industrial engineering student hunting for Atlantas best jollof and wings.', 33.7700, -84.3880, array['food crawls','basketball','cooking','podcasts'], 1),
  (42, 'd0000000-0000-4000-8000-000000000042', 'nora.byrne@degrees.demo', 'nora.byrne', 'Nora Byrne', 'Georgia State nutrition student who teaches free cooking classes at a community kitchen.', 33.7590, -84.3600, array['cooking','volunteering','yoga','baking'], 1),
  (43, 'd0000000-0000-4000-8000-000000000043', 'maria.gonzalez@degrees.demo', 'maria.gonzalez', 'Maria Gonzalez', 'SCAD Atlanta illustration student who fills a sketchbook every month and never misses a zine fair.', 33.7975, -84.3875, array['illustration','zines','design','coffee'], 1),
  (44, 'd0000000-0000-4000-8000-000000000044', 'elijah.ward@degrees.demo', 'elijah.ward', 'Elijah Ward', 'SCAD Atlanta film student shooting a documentary about Atlantas skate scene.', 33.7960, -84.3860, array['filmmaking','skateboarding','photography','tacos'], 1),
  (45, 'd0000000-0000-4000-8000-000000000045', 'sophie.klein@degrees.demo', 'sophie.klein', 'Sophie Klein', 'SCAD Atlanta fashion student who thrifts, sews, and runs a clothing-swap night.', 33.7985, -84.3890, array['fashion','thrifting','sewing','brunch'], 1),
  (46, 'd0000000-0000-4000-8000-000000000046', 'andre.baptiste@degrees.demo', 'andre.baptiste', 'Andre Baptiste', 'SCAD Atlanta UX student and hobby ceramicist who throws mugs at a Westside studio.', 33.7850, -84.4100, array['ceramics','ux design','design','coffee'], 1),
  (47, 'd0000000-0000-4000-8000-000000000047', 'lily.huang@degrees.demo', 'lily.huang', 'Lily Huang', 'SCAD Atlanta animation student who draws in Piedmont Park and rewatches Studio Ghibli films.', 33.7870, -84.3730, array['animation','illustration','anime','picnics'], 1),
  (48, 'd0000000-0000-4000-8000-000000000048', 'sebastian.cruz@degrees.demo', 'sebastian.cruz', 'Sebastian Cruz', 'SCAD Atlanta photography student who shoots film portraits along the BeltLine.', 33.7690, -84.3640, array['photography','walking','design','concerts'], 1),
  (49, 'd0000000-0000-4000-8000-000000000049', 'brianna.james@degrees.demo', 'brianna.james', 'Brianna James', 'Georgia Tech business student, intramural volleyball captain, and Saturday 5K regular.', 33.7745, -84.4010, array['volleyball','running','brunch','podcasts'], 6),
  (50, 'd0000000-0000-4000-8000-000000000050', 'matt.sullivan@degrees.demo', 'matt.sullivan', 'Matt Sullivan', 'Georgia Tech mechanical engineering student who plays Ultimate and watches every Atlanta United match.', 33.7800, -84.4050, array['ultimate frisbee','soccer','running','wings'], 6),
  (51, 'd0000000-0000-4000-8000-000000000051', 'aisha.bello@degrees.demo', 'aisha.bello', 'Aisha Bello', 'Georgia State kinesiology student, spin instructor, and pickup basketball regular.', 33.7535, -84.3860, array['cycling','basketball','fitness','smoothies'], 6),
  (52, 'd0000000-0000-4000-8000-000000000052', 'jake.henderson@degrees.demo', 'jake.henderson', 'Jake Henderson', 'Georgia Tech civil engineering student training for his first marathon on the BeltLine.', 33.7710, -84.3650, array['running','cycling','hiking','coffee'], 6),
  (53, 'd0000000-0000-4000-8000-000000000053', 'camila.reyes@degrees.demo', 'camila.reyes', 'Camila Reyes', 'Georgia Tech biomedical engineering student, club soccer midfielder, and salsa-night regular.', 33.7755, -84.4000, array['soccer','salsa dancing','running','tacos'], 6),
  (54, 'd0000000-0000-4000-8000-000000000054', 'derek.lee@degrees.demo', 'derek.lee', 'Derek Lee', 'Emory business student who plays pickleball at dawn and golf when he can afford it.', 33.7890, -84.3255, array['pickleball','golf','tennis','brunch'], 6),
  (55, 'd0000000-0000-4000-8000-000000000055', 'imani.jackson@degrees.demo', 'imani.jackson', 'Imani Jackson', 'Spelman English major, spoken-word poet, and organizer of a monthly open mic.', 33.7450, -84.4110, array['poetry','open mics','books','volunteering'], 4),
  (56, 'd0000000-0000-4000-8000-000000000056', 'malik.robinson@degrees.demo', 'malik.robinson', 'Malik Robinson', 'Morehouse music student, jazz pianist, and weekend choir director.', 33.7465, -84.4140, array['jazz','piano','choir','cooking'], 2),
  (57, 'd0000000-0000-4000-8000-000000000057', 'zara.okonkwo@degrees.demo', 'zara.okonkwo', 'Zara Okonkwo', 'Spelman political science student who registers voters and loves a good debate.', 33.7445, -84.4095, array['volunteering','debate','podcasts','brunch'], 4),
  (58, 'd0000000-0000-4000-8000-000000000058', 'terrence.hall@degrees.demo', 'terrence.hall', 'Terrence Hall', 'Morehouse economics student, chess club president, and neo-soul record collector.', 33.7470, -84.4125, array['chess','vinyl','jazz','basketball'], 2),
  (59, 'd0000000-0000-4000-8000-000000000059', 'naomi.fields@degrees.demo', 'naomi.fields', 'Naomi Fields', 'Clark Atlanta journalism student new to Atlanta, looking for a crew for art walks.', 33.7520, -84.4130, array['art walks','writing','photography','coffee'], 4),
  (60, 'd0000000-0000-4000-8000-000000000060', 'caleb.morris@degrees.demo', 'caleb.morris', 'Caleb Morris', 'Transfer student at Georgia Tech who just moved to Midtown and doesnt know anyone yet.', 33.7810, -84.3860, array['basketball','video games','cooking','hiking'], 5);

-- ---- refuse rather than clobber a real account --------------------------------------------------------------
select string_agg(format('username %s (profile %s)', p.username, p.id), ', ') into v_conflicts
from public.profiles p
join _demo_people d on d.username = p.username
where p.id <> d.id;
if v_conflicts is not null then
  raise exception 'restore_demo_users: seeded usernames are taken by other accounts: %', v_conflicts
    using hint = 'Rename or remove those profiles, then re-run. Nothing was changed.';
end if;

select string_agg(format('email %s (user %s)', u.email, u.id), ', ') into v_conflicts
from auth.users u
join _demo_people d on lower(d.email) = lower(u.email)
where u.id <> d.id;
if v_conflicts is not null then
  raise exception 'restore_demo_users: seeded emails belong to other auth users: %', v_conflicts
    using hint = 'Run purge_demo_users.sql first. Nothing was changed.';
end if;

select e.id, e.group_id into v_event_id, v_meetup_id
from public.events e
where e.room_code = 'HACKGT';
if v_event_id is not null
   and not exists (
     select 1 from public.events e
     join _demo_people d on d.id = e.created_by
     where e.id = v_event_id
   ) then
  raise exception 'restore_demo_users: room code HACKGT belongs to a meetup a real account hosts (event %)', v_event_id
    using hint = 'Nothing was changed.';
end if;

-- ---- accounts ---------------------------------------------------------------------------------------------
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
  jsonb_build_object('display_name', display_name, 'username', username),
  now(),
  now(),
  '',
  '',
  '',
  ''
from _demo_people
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
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from _demo_people
on conflict do nothing;

-- ---- profile, tags, embedding, preferences ----------------------------------------------------------------
insert into public.profiles (id, username, display_name, bio, ai_paragraph, city, lat, lng)
select
  id,
  username,
  display_name,
  bio,
  bio || ' They would enjoy meeting people interested in ' || array_to_string(tags, ', ') || '.',
  'Atlanta',
  lat,
  lng
from _demo_people
on conflict (id) do update set
  username = excluded.username,
  display_name = excluded.display_name,
  bio = excluded.bio,
  ai_paragraph = excluded.ai_paragraph,
  city = excluded.city,
  lat = excluded.lat,
  lng = excluded.lng;

delete from public.profile_tags
where user_id in (select id from _demo_people);

insert into public.profile_tags (user_id, label, kind)
select
  person.id,
  tag.label,
  case
    when tag.ordinality <= 2 then 'hobby'
    when tag.ordinality = 3 then 'activity'
    else 'derived'
  end
from _demo_people person
cross join lateral unnest(person.tags) with ordinality as tag(label, ordinality);

-- A few "rather skip" tags, so avoid handling (wave 3) has something to act on.
insert into public.profile_tags (user_id, label, kind)
select person.id, avoid.label, 'avoid'
from (values
  (14, 'bars'),
  (19, 'early mornings'),
  (27, 'loud bars'),
  (28, 'late nights'),
  (33, 'outdoor sports'),
  (38, 'hiking'),
  (45, 'sports bars'),
  (51, 'museums'),
  (54, 'clubs'),
  (57, 'alcohol')
) as avoid(position, label)
join _demo_people person on person.position = avoid.position;

-- Same deterministic placeholder as 0002 (same-cluster people get similar vectors); `npm run seed` replaces it.
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
    )::extensions.vector
    from generate_series(1, 768) as dimensions(dimension)
  ),
  now()
from _demo_people person
on conflict (user_id) do nothing;

insert into public.preferences (
  user_id, cost_min_cents, cost_max_cents, max_travel_mi, frequency, group_size_min, group_size_max, max_degrees
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
from _demo_people
on conflict (user_id) do update set
  cost_min_cents = excluded.cost_min_cents,
  cost_max_cents = excluded.cost_max_cents,
  max_travel_mi = excluded.max_travel_mi,
  frequency = excluded.frequency,
  group_size_min = excluded.group_size_min,
  group_size_max = excluded.group_size_max,
  max_degrees = excluded.max_degrees;

-- ---- HACKGT meetup: the event row (room code) + its backing meetup group (0007) ---------------------------
v_event_id := coalesce(v_event_id, '20000000-0000-4000-8000-000000000001');
v_meetup_id := coalesce(v_meetup_id, '10000000-0000-4000-8000-000000000003');

insert into public.groups (id, kind, name, created_by, status, formed_at)
values (v_meetup_id, 'meetup', 'HackGT 13 at Georgia Tech', 'd0000000-0000-4000-8000-000000000001', 'confirmed', now())
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  created_by = excluded.created_by,
  status = excluded.status,
  completed_at = null;

insert into public.events (id, room_code, name, city, created_by, group_id, code_expires_at, ended_at)
values (
  v_event_id,
  'HACKGT',
  'HackGT 13 at Georgia Tech',
  'Atlanta',
  'd0000000-0000-4000-8000-000000000001',
  v_meetup_id,
  null,
  null
)
on conflict (id) do update set
  room_code = excluded.room_code,
  name = excluded.name,
  city = excluded.city,
  created_by = excluded.created_by,
  group_id = excluded.group_id,
  code_expires_at = null,
  ended_at = null;

-- The original 12 attend HACKGT; the Sep 27 additions (13–60) aren't at the hackathon.
insert into public.event_attendees (event_id, user_id)
select v_event_id, id from _demo_people where position <= 12
on conflict (event_id, user_id) do nothing;

-- Like 0007's backfill: the host is degree 0, other attendees have no degree; meetup members count as accepted.
insert into public.group_members (group_id, user_id, degree, accepted_at)
select v_meetup_id, id, case when position = 1 then 0 else null end, now()
from _demo_people where position <= 12
on conflict (group_id, user_id) do update set
  degree = excluded.degree,
  accepted_at = coalesce(public.group_members.accepted_at, excluded.accepted_at);

-- ---- the connection graph (0002's edges; LEAST/GREATEST keep user_a < user_b) -----------------------------
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
    (10, 12, 'manual'),
    (13, 14, 'manual'),
    (14, 15, 'manual'),
    (15, 16, 'manual'),
    (16, 17, 'manual'),
    (17, 18, 'manual'),
    (13, 16, 'manual'),
    (19, 20, 'manual'),
    (20, 21, 'manual'),
    (21, 22, 'manual'),
    (22, 23, 'manual'),
    (23, 24, 'manual'),
    (19, 22, 'manual'),
    (25, 26, 'manual'),
    (26, 27, 'manual'),
    (27, 28, 'manual'),
    (28, 29, 'manual'),
    (29, 30, 'manual'),
    (25, 28, 'manual'),
    (31, 32, 'manual'),
    (32, 33, 'manual'),
    (33, 34, 'manual'),
    (34, 35, 'manual'),
    (35, 36, 'manual'),
    (31, 34, 'manual'),
    (37, 38, 'manual'),
    (38, 39, 'manual'),
    (39, 40, 'manual'),
    (40, 41, 'manual'),
    (41, 42, 'manual'),
    (37, 40, 'manual'),
    (43, 44, 'manual'),
    (44, 45, 'manual'),
    (45, 46, 'manual'),
    (46, 47, 'manual'),
    (47, 48, 'manual'),
    (43, 46, 'manual'),
    (49, 50, 'manual'),
    (50, 51, 'manual'),
    (51, 52, 'manual'),
    (52, 53, 'manual'),
    (53, 54, 'manual'),
    (49, 52, 'manual'),
    (55, 56, 'manual'),
    (56, 57, 'manual'),
    (57, 58, 'manual'),
    (55, 58, 'manual'),
    (5, 13, 'qr'),
    (4, 19, 'qr'),
    (10, 25, 'qr'),
    (9, 31, 'qr'),
    (7, 37, 'qr'),
    (6, 43, 'qr'),
    (11, 49, 'qr'),
    (8, 55, 'qr'),
    (17, 52, 'qr'),
    (21, 56, 'qr'),
    (27, 58, 'qr'),
    (34, 46, 'qr'),
    (26, 38, 'qr'),
    (15, 53, 'qr')
)
insert into public.connections (user_a, user_b, met_at, met_context, event_id)
select
  least(left_person.id, right_person.id),
  greatest(left_person.id, right_person.id),
  -- 0002's spacing for the original 12; newer edges spread over the last two months (never in the future).
  now() - make_interval(days => case
    when edges.right_position <= 12 then 20 - edges.left_position
    else 1 + (edges.left_position * 7 + edges.right_position) % 60
  end),
  edges.met_context,
  case when edges.met_context = 'event' then v_event_id else null end
from edges
join _demo_people left_person on left_person.position = edges.left_position
join _demo_people right_person on right_person.position = edges.right_position
on conflict (user_a, user_b) do update set
  met_at = excluded.met_at,
  met_context = excluded.met_context,
  event_id = excluded.event_id;

-- ---- extra random connections among the demo accounts (added Sep 27) ------------------------------------
-- 76 more edges on top of the hand-made 72, picked by a seeded md5 roll per pair: repeatable (a re-run gives the
-- same graph) but with no hand-made pattern. People in the same interest cluster connect at 15%, anyone else at 5%.
-- Left out on purpose: Maya (1) and her 1st-degree friends (2, 3), so her default 2-degree demo is unchanged;
-- pairs among the original 12 (their graph stays 0002's); and 59–60, who have no connections yet.
with pairs as (
  select
    a.id as a_id,
    b.id as b_id,
    ('x' || left(md5('degrees-demo-' || a.position || '-' || b.position), 7))::bit(28)::int % 100 as roll,
    ('x' || substr(md5('degrees-demo-' || a.position || '-' || b.position), 8, 7))::bit(28)::int as salt,
    a.embedding_cluster = b.embedding_cluster as same_cluster
  from _demo_people a
  join _demo_people b on a.position < b.position
  where a.position between 4 and 58
    and b.position between 13 and 58
)
insert into public.connections (user_a, user_b, met_at, met_context, event_id)
select
  least(a_id, b_id),
  greatest(a_id, b_id),
  now() - make_interval(days => 1 + salt % 90),
  case when salt % 3 = 0 then 'manual' else 'qr' end,
  null
from pairs
where roll < case when same_cluster then 15 else 5 end
on conflict (user_a, user_b) do nothing;

-- ---- two completed matched groups, with plans and feedback (the "feedback improved matching" beat) --------
insert into public.groups (id, kind, formed_at, reasoning, status, completed_at)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'matched',
    '2026-09-14T19:00:00Z',
    'A creative food-focused student group connected through Maya and Alex on the Georgia Tech campus.',
    'completed',
    '2026-09-14T22:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'matched',
    '2026-09-20T15:00:00Z',
    'An outdoorsy student group with overlapping interests and comfortable second-degree introductions near campus.',
    'completed',
    '2026-09-20T18:00:00Z'
  )
on conflict (id) do update set
  kind = excluded.kind,
  formed_at = excluded.formed_at,
  reasoning = excluded.reasoning,
  status = excluded.status,
  completed_at = excluded.completed_at;

create temp table _demo_members (
  group_id uuid not null,
  person_position integer not null,
  degree integer not null,
  primary key (group_id, person_position)
) on commit drop;

insert into _demo_members values
  ('10000000-0000-4000-8000-000000000001', 1, 0),
  ('10000000-0000-4000-8000-000000000001', 2, 1),
  ('10000000-0000-4000-8000-000000000001', 4, 2),
  ('10000000-0000-4000-8000-000000000001', 6, 2),
  ('10000000-0000-4000-8000-000000000002', 3, 0),
  ('10000000-0000-4000-8000-000000000002', 5, 1),
  ('10000000-0000-4000-8000-000000000002', 7, 1),
  ('10000000-0000-4000-8000-000000000002', 11, 2);

insert into public.group_members (group_id, user_id, degree, accepted_at)
select members.group_id, people.id, members.degree, g.formed_at
from _demo_members members
join _demo_people people on people.position = members.person_position
join public.groups g on g.id = members.group_id
on conflict (group_id, user_id) do update set
  degree = excluded.degree,
  accepted_at = excluded.accepted_at;

insert into public.activities (
  id, group_id, title, venue, address, lat, lng, price_cents, starts_at, source, source_url, reasoning,
  status, job, created_at
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
    'A walkable Tech Square venue with several casual options makes conversation easy and fits student budgets.',
    'ready',
    null,
    '2026-09-14T19:00:00Z'
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
    'A low-cost outdoor plan in the center of campus matches the group''s activity, budget, and travel preferences.',
    'ready',
    null,
    '2026-09-20T15:00:00Z'
  )
on conflict (id) do update set
  group_id = excluded.group_id,
  title = excluded.title,
  venue = excluded.venue,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  price_cents = excluded.price_cents,
  starts_at = excluded.starts_at,
  source = excluded.source,
  source_url = excluded.source_url,
  reasoning = excluded.reasoning,
  status = excluded.status,
  job = excluded.job,
  created_at = excluded.created_at;

with ranked_members as (
  select
    members.*,
    row_number() over (order by members.group_id, members.person_position) as feedback_number
  from _demo_members members
)
insert into public.event_feedback (
  id, group_id, author_id, rating, free_text, analyzed_tags, sentiment, created_at
)
select
  ('40000000-0000-4000-8000-' || lpad(ranked.feedback_number::text, 12, '0'))::uuid,
  ranked.group_id,
  people.id,
  case when ranked.feedback_number % 4 = 1 then 4 else 5 end,
  case
    when ranked.feedback_number % 2 = 0 then 'I would happily hang out with this group again.'
    else 'Easy conversation and a genuinely good activity pick.'
  end,
  case
    when ranked.group_id = '10000000-0000-4000-8000-000000000001' then '["food","creative","easygoing"]'::jsonb
    else '["outdoors","active","friendly"]'::jsonb
  end,
  'positive',
  case
    when ranked.group_id = '10000000-0000-4000-8000-000000000001' then '2026-09-14T22:00:00Z'::timestamptz
    else '2026-09-20T22:00:00Z'::timestamptz
  end
from ranked_members ranked
join _demo_people people on people.position = ranked.person_position
on conflict (group_id, author_id) do update set
  rating = excluded.rating,
  free_text = excluded.free_text,
  analyzed_tags = excluded.analyzed_tags,
  sentiment = excluded.sentiment,
  created_at = excluded.created_at;

-- Everyone in both groups said "great" about everyone else (0002's would_meet_again = true, renamed in 0006).
insert into public.feedback_peers (feedback_id, peer_id, relationship)
select feedback.id, peer.id, 'great'
from public.event_feedback feedback
join _demo_members author_membership on author_membership.group_id = feedback.group_id
join _demo_people author
  on author.position = author_membership.person_position
 and author.id = feedback.author_id
join _demo_members peer_membership
  on peer_membership.group_id = feedback.group_id
 and peer_membership.person_position <> author_membership.person_position
join _demo_people peer on peer.position = peer_membership.person_position
on conflict (feedback_id, peer_id) do update set
  relationship = excluded.relationship;

end;
$seed$;

-- Verification: 60 / 60 / 148 / 2 / 24 / 1 / 12, and invalid_connection_order 0.
select
  (select count(*) from auth.users where lower(email) like '%@degrees.demo') as demo_auth_users,
  (
    select count(*) from public.profiles
    where id::text like 'd0000000-0000-4000-8000-0000000000%'
  ) as demo_profiles,
  (
    select count(*) from public.connections
    where user_a::text like 'd0000000-%' and user_b::text like 'd0000000-%'
  ) as demo_connections,
  (
    select count(*) from public.groups
    where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
      and status = 'completed'
  ) as completed_groups,
  (
    select count(*) from public.feedback_peers fp
    join public.event_feedback f on f.id = fp.feedback_id
    where f.group_id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
  ) as feedback_peer_rows,
  (select count(*) from public.events where room_code = 'HACKGT' and ended_at is null) as hackgt_events,
  (
    select count(*) from public.group_members m
    join public.events e on e.group_id = m.group_id
    where e.room_code = 'HACKGT'
  ) as hackgt_members,
  (select count(*) from public.connections where user_a >= user_b) as invalid_connection_order;
