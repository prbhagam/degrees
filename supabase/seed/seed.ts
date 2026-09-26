// Owner: Sahith (Data & Matching) — deterministic demo seed; see docs/ROLES.md.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

function getSeedClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Seeding requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const profiles = [
  { username: 'maya.chen', name: 'Maya Chen', bio: 'Georgia Tech architecture student, amateur potter, and regular at the student center who is always looking for Atlanta\'s best dumplings.', city: 'Atlanta', lat: 33.7756, lng: -84.3963, tags: ['pottery', 'food crawls', 'architecture', 'coffee'] },
  { username: 'alex.rivera', name: 'Alex Rivera', bio: 'Georgia Tech CS student who balances hackathons, intramural soccer, and live music around Midtown.', city: 'Atlanta', lat: 33.7771, lng: -84.3894, tags: ['soccer', 'live music', 'coding', 'tacos'] },
  { username: 'priya.patel', name: 'Priya Patel', bio: 'Georgia Tech biomedical engineering major, weekend trail runner, and enthusiastic campus game-night regular.', city: 'Atlanta', lat: 33.7738, lng: -84.3955, tags: ['running', 'hiking', 'biomedical engineering', 'board games'] },
  { username: 'jordan.kim', name: 'Jordan Kim', bio: 'Georgia Tech computational media student who shoots film for Technique and hunts for tiny concerts and good ramen.', city: 'Atlanta', lat: 33.7782, lng: -84.3929, tags: ['photography', 'concerts', 'student media', 'ramen'] },
  { username: 'leo.martinez', name: 'Leo Martinez', bio: 'Georgia Tech mechanical engineering student, CRC climber, and serial organizer of residence-hall game nights.', city: 'Atlanta', lat: 33.7818, lng: -84.4011, tags: ['rock climbing', 'board games', 'engineering', 'coffee'] },
  { username: 'zoe.williams', name: 'Zoe Williams', bio: 'Georgia Tech industrial design student who illustrates for campus clubs and never says no to karaoke in Midtown.', city: 'Atlanta', lat: 33.7731, lng: -84.3917, tags: ['illustration', 'design', 'karaoke', 'baking'] },
  { username: 'sam.okafor', name: 'Sam Okafor', bio: 'Georgia Tech data science student, home cook, and cyclist who commutes across campus and explores Atlanta on weekends.', city: 'Atlanta', lat: 33.7758, lng: -84.3902, tags: ['cycling', 'cooking', 'data science', 'food crawls'] },
  { username: 'nina.thompson', name: 'Nina Thompson', bio: 'Georgia State journalism student who visits Tech friends for trivia, indie movies, and BeltLine walks.', city: 'Atlanta', lat: 33.7764, lng: -84.3881, tags: ['indie film', 'trivia', 'walking', 'podcasts'] },
  { username: 'ethan.brooks', name: 'Ethan Brooks', bio: 'Georgia Tech electrical engineering student, jazz drummer, chess beginner, and loyal fan of Tech Square coffee shops.', city: 'Atlanta', lat: 33.7769, lng: -84.3832, tags: ['jazz', 'chess', 'coffee', 'concerts'] },
  { username: 'amina.yusuf', name: 'Amina Yusuf', bio: 'Emory public health student who comes into Midtown for spoken word, tennis, and community volunteering with Tech friends.', city: 'Atlanta', lat: 33.7795, lng: -84.3817, tags: ['poetry', 'tennis', 'volunteering', 'books'] },
  { username: 'noah.green', name: 'Noah Green', bio: 'Georgia Tech city planning student, MARTA enthusiast, and weekend kayaker with strong opinions about campus transit.', city: 'Atlanta', lat: 33.7796, lng: -84.3987, tags: ['urbanism', 'kayaking', 'transit', 'architecture'] },
  { username: 'sofia.nguyen', name: 'Sofia Nguyen', bio: 'Georgia Tech industrial design student collecting zines, recipes, and reasons to host a picnic on Tech Green.', city: 'Atlanta', lat: 33.7702, lng: -84.3946, tags: ['design', 'zines', 'picnics', 'cooking'] },
] as const;

const groupIds = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
] as const;
const eventId = '20000000-0000-4000-8000-000000000001';

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function embeddingFor(username: string, tags: readonly string[]): string {
  const vector = Array<number>(768).fill(0);
  for (const tag of tags) {
    const seed = hash(tag);
    for (let offset = 0; offset < 12; offset += 1) {
      const dimension = ((seed + Math.imul(offset + 1, 2654435761)) >>> 0) % 768;
      vector[dimension] = (vector[dimension] ?? 0) + 1 / (offset + 1);
    }
  }
  let noise = hash(username);
  for (let index = 0; index < vector.length; index += 1) {
    noise = Math.imul(noise ^ (noise >>> 15), 2246822519) >>> 0;
    vector[index] = (vector[index] ?? 0) + ((noise / 0xffffffff) - 0.5) * 0.02;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return `[${vector.map((value) => (value / magnitude).toFixed(6)).join(',')}]`;
}

async function main(): Promise<void> {
  const supabase = getSeedClient();
  const emailFor = (username: string) => `${username}@degrees.demo`;
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const usersByEmail = new Map(existing.users.map((user) => [user.email, user]));

  await Promise.all(profiles.map(async (profile) => {
    const email = emailFor(profile.username);
    if (usersByEmail.has(email)) return;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: 'DegreesDemo26!',
      email_confirm: true,
      user_metadata: { display_name: profile.name },
    });
    if (error) throw error;
    usersByEmail.set(email, data.user);
  }));

  const ids = profiles.map((profile) => {
    const id = usersByEmail.get(emailFor(profile.username))?.id;
    if (!id) throw new Error(`Missing auth user for ${profile.username}`);
    return id;
  });
  const assert = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  assert((await supabase.from('profiles').upsert(profiles.map((profile, index) => ({
    id: ids[index], username: profile.username, display_name: profile.name, bio: profile.bio,
    ai_paragraph: `${profile.bio} They would enjoy meeting people interested in ${profile.tags.join(', ')}.`,
    city: profile.city, lat: profile.lat, lng: profile.lng,
  })))).error);

  const [tagsDeleted, preferencesSeeded, embeddingsSeeded] = await Promise.all([
    supabase.from('profile_tags').delete().in('user_id', ids),
    supabase.from('preferences').upsert(profiles.map((_, index) => ({
      user_id: ids[index], cost_min_cents: 0, cost_max_cents: index % 3 === 0 ? 2500 : 4000,
      max_travel_mi: 5 + (index % 3) * 5, frequency: index % 4 === 0 ? 'monthly' : 'weekly',
      group_size_min: 3, group_size_max: 5 + (index % 2), max_degrees: index % 3 === 0 ? 3 : 2,
    }))),
    supabase.from('profile_embeddings').upsert(profiles.map((profile, index) => ({
      user_id: ids[index], embedding: embeddingFor(profile.username, profile.tags), updated_at: new Date().toISOString(),
    }))),
  ]);
  assert(tagsDeleted.error);
  assert(preferencesSeeded.error);
  assert(embeddingsSeeded.error);
  assert((await supabase.from('profile_tags').insert(profiles.flatMap((profile, index) =>
    profile.tags.map((label, tagIndex) => ({
      user_id: ids[index], label, kind: tagIndex < 2 ? 'hobby' : tagIndex === 2 ? 'activity' : 'derived',
    })),
  ))).error);

  assert((await supabase.from('events').upsert({
    id: eventId, room_code: 'HACKGT', name: 'HackGT 13 at Georgia Tech', city: 'Atlanta', created_by: ids[0],
  })).error);

  const edgeIndexes = [
    [0, 1], [0, 2], [1, 3], [1, 5], [2, 4], [2, 6],
    [3, 7], [4, 8], [5, 9], [6, 10], [7, 11], [9, 11],
  ] as const;
  assert((await supabase.from('connections').upsert(edgeIndexes.map(([left, right], index) => {
    const [user_a, user_b] = [ids[left], ids[right]].sort();
    return {
      user_a, user_b, met_at: new Date(Date.UTC(2026, 8, 10 + index)).toISOString(),
      met_context: index < 6 ? 'event' : 'manual', event_id: index < 6 ? eventId : null,
    };
  }))).error);

  assert((await supabase.from('event_attendees').upsert(ids.map((user_id) => ({ event_id: eventId, user_id })))).error);
  assert((await supabase.from('groups').upsert([
    { id: groupIds[0], formed_at: '2026-09-14T19:00:00Z', reasoning: 'A creative food-focused student group connected through Maya and Alex on the Georgia Tech campus.', status: 'completed' },
    { id: groupIds[1], formed_at: '2026-09-20T15:00:00Z', reasoning: 'An outdoorsy student group with overlapping interests and comfortable second-degree introductions near campus.', status: 'completed' },
  ])).error);

  const memberships = [
    [groupIds[0], 0, 0], [groupIds[0], 1, 1], [groupIds[0], 3, 2], [groupIds[0], 5, 2],
    [groupIds[1], 2, 0], [groupIds[1], 4, 1], [groupIds[1], 6, 1], [groupIds[1], 10, 2],
  ] as const;
  assert((await supabase.from('group_members').upsert(memberships.map(([group_id, index, degree]) => ({
    group_id, user_id: ids[index], degree,
  })))).error);

  assert((await supabase.from('activities').upsert([
    { id: '30000000-0000-4000-8000-000000000001', group_id: groupIds[0], title: 'Tech Square dinner crawl', venue: 'The Collective Food Hall at Coda', address: '756 W Peachtree St NW, Atlanta, GA', lat: 33.7759, lng: -84.3873, price_cents: 2200, starts_at: '2026-09-14T19:30:00Z', source: 'maps', source_url: 'https://maps.google.com/?q=The+Collective+Food+Hall+at+Coda', reasoning: 'A walkable Tech Square venue with several casual options makes conversation easy and fits student budgets.' },
    { id: '30000000-0000-4000-8000-000000000002', group_id: groupIds[1], title: 'Tech Green picnic and lawn games', venue: 'Tech Green', address: '350 Ferst Dr NW, Atlanta, GA', lat: 33.7747, lng: -84.3974, price_cents: 1200, starts_at: '2026-09-20T15:30:00Z', source: 'maps', source_url: 'https://maps.google.com/?q=Tech+Green+Georgia+Tech', reasoning: 'A low-cost outdoor plan in the center of campus matches the group\'s activity, budget, and travel preferences.' },
  ])).error);

  const feedback = memberships.map(([group_id, index], feedbackIndex) => ({
    id: `40000000-0000-4000-8000-${String(feedbackIndex + 1).padStart(12, '0')}`,
    group_id, author_id: ids[index], rating: feedbackIndex % 4 === 0 ? 4 : 5,
    free_text: feedbackIndex % 2 === 0 ? 'Easy conversation and a genuinely good activity pick.' : 'I would happily hang out with this group again.',
    analyzed_tags: feedbackIndex < 4 ? ['food', 'creative', 'easygoing'] : ['outdoors', 'active', 'friendly'],
    created_at: new Date(Date.UTC(2026, 8, feedbackIndex < 4 ? 14 : 20, 22)).toISOString(),
  }));
  assert((await supabase.from('event_feedback').upsert(feedback)).error);
  const peerRows = feedback.flatMap((item) => memberships
    .filter(([groupId, index]) => groupId === item.group_id && ids[index] !== item.author_id)
    .map(([, index]) => ({ feedback_id: item.id, peer_id: ids[index], would_meet_again: true })));
  assert((await supabase.from('feedback_peers').upsert(peerRows)).error);

  console.log(`Seeded ${profiles.length} profiles, ${edgeIndexes.length} connections, 2 completed groups, and event HACKGT.`);
}

await main();
