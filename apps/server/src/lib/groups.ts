// Owner: Pranav (Groups, Activities & Chat) — reads a group as its viewer sees it; used by groups + messages routes.
import {
  activitySchema,
  type Activity,
  type ActivityStatus,
  type GenerateActivityInput,
  type GenerateIcebreakersInput,
  type GroupMember,
  type GroupResponse,
  type GroupStatus,
  type HangoutKind,
} from '@degrees/shared';
import {
  activityJobSchema,
  newActivityJob,
  type ActivityJob,
} from '../ai/generateActivity.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from './errors.js';
import { exploreFrom, profileBasics } from './graph.js';
import { log } from './log.js';

// Added Sep 26 (wave 2): a meetup's room-code record (the `events` row behind a kind='meetup' group).
export interface MeetupRow {
  id: string;
  room_code: string;
  name: string | null;
  created_by: string | null;
  scheduled_at: string | null;
  code_expires_at: string | null;
  ended_at: string | null;
  group_id: string | null;
}

export const MEETUP_COLUMNS =
  'id, room_code, name, created_by, scheduled_at, code_expires_at, ended_at, group_id';

// A room code accepts joins until it expires (24h after the scheduled time, or creation) or the meetup ends.
export function isCodeOpen(meetup: Pick<MeetupRow, 'code_expires_at' | 'ended_at'>, now = Date.now()): boolean {
  if (meetup.ended_at) return false;
  if (!meetup.code_expires_at) return true;
  return new Date(meetup.code_expires_at).getTime() > now;
}

export async function meetupForGroup(groupId: string): Promise<MeetupRow | null> {
  const { data, error } = await getServiceClient()
    .from('events')
    .select(MEETUP_COLUMNS)
    .eq('group_id', groupId)
    .maybeSingle();
  if (error) {
    throw new Error(`events read failed: ${error.message}`);
  }
  return (data as MeetupRow | null) ?? null;
}

const iso = (value: string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

// Georgia Tech campus — used when no member has a location on file.
const DEFAULT_CENTER = { city: 'Atlanta', lat: 33.7756, lng: -84.3963 };
const DEFAULT_MAX_COST_CENTS = 3000;
const DEFAULT_MAX_TRAVEL_MI = 10;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const groupNotFound = () =>
  new ApiError(404, 'group_not_found', 'The requested group does not exist.');

interface MemberRow {
  user_id: string;
  degree: number | null;
  // wave 4: null until this member accepts the proposed group.
  accepted_at: string | null;
}

// Non-members get the same 404 as a missing group, so group ids don't leak.
export async function memberRows(
  groupId: string,
  viewerId: string,
): Promise<MemberRow[]> {
  if (!UUID_PATTERN.test(groupId)) {
    throw groupNotFound();
  }
  const { data, error } = await getServiceClient()
    .from('group_members')
    .select('user_id, degree, accepted_at')
    .eq('group_id', groupId);
  if (error) {
    throw new Error(`group_members read failed: ${error.message}`);
  }
  const rows = data as MemberRow[];
  if (!rows.some((row) => row.user_id === viewerId)) {
    throw groupNotFound();
  }
  return rows;
}

// Added Sep 26 (wave 4): the "Why this group" text can't name anyone the viewer hasn't met. formGroups is told not
// to, but the text is stored once per group while redaction is per viewer, so this scrubs it on the way out.
// Full names first, then first names (3+ letters), whole-word, case-insensitive.
export function redactReasoning(reasoning: string, hiddenNames: string[]): string {
  let text = reasoning;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const replacements = new Set<string>();
  for (const name of hiddenNames) {
    const full = name.trim();
    if (!full) continue;
    replacements.add(full);
    const first = full.split(/\s+/)[0] ?? '';
    if (first.length >= 3) replacements.add(first);
  }
  for (const value of [...replacements].sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`\\b${escape(value)}\\b`, 'gi'), 'someone new');
  }
  return text;
}

// Chat and photo uploads close this long after a hangout is marked done (the app hides the
// composer at the same mark; this is the server-side half).
export const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;

export interface GroupState {
  status: GroupStatus;
  completedAt: string | null;
  kind: HangoutKind;
}

export async function groupState(groupId: string): Promise<GroupState> {
  const { data, error } = await getServiceClient()
    .from('groups')
    .select('status, completed_at, kind')
    .eq('id', groupId)
    .single();
  if (error) {
    throw new Error(`groups read failed: ${error.message}`);
  }
  return {
    status: (data.status as GroupStatus | null) ?? 'proposed',
    completedAt: (data.completed_at as string | null) ?? null,
    kind: (data.kind as HangoutKind | null) ?? 'matched',
  };
}

// ---- Icebreakers (Added Sep 26, wave 2) ---------------------------------------------------------
export async function listIcebreakers(groupId: string): Promise<string[]> {
  const { data, error } = await getServiceClient()
    .from('group_icebreakers')
    .select('prompt, position')
    .eq('group_id', groupId)
    .order('position', { ascending: true });
  if (error) {
    throw new Error(`group_icebreakers read failed: ${error.message}`);
  }
  return data.map((row) => row.prompt as string);
}

// One set per group: regenerating replaces the previous set.
export async function saveIcebreakers(groupId: string, prompts: string[]): Promise<void> {
  const db = getServiceClient();
  const { error: deleteError } = await db.from('group_icebreakers').delete().eq('group_id', groupId);
  if (deleteError) {
    throw new Error(`group_icebreakers delete failed: ${deleteError.message}`);
  }
  if (prompts.length === 0) return;
  const { error } = await db
    .from('group_icebreakers')
    .insert(prompts.map((prompt, position) => ({ group_id: groupId, position, prompt })));
  if (error) {
    throw new Error(`group_icebreakers insert failed: ${error.message}`);
  }
}

export async function icebreakersInput(groupId: string, viewerId: string): Promise<GenerateIcebreakersInput> {
  const ids = (await memberRows(groupId, viewerId)).map((row) => row.user_id);
  const [basics, tags, group] = await Promise.all([
    profileBasics(ids),
    tagsByUser(ids),
    getServiceClient().from('groups').select('name').eq('id', groupId).single(),
  ]);
  if (group.error) {
    throw new Error(`groups read failed: ${group.error.message}`);
  }
  return {
    name: (group.data.name as string | null) ?? null,
    members: ids.map((id) => ({
      displayName: basics.get(id)?.displayName ?? 'Someone',
      interests: tags.get(id)?.interests ?? [],
    })),
  };
}

export function isArchived(
  completedAt: string | null,
  now = Date.now(),
): boolean {
  return (
    completedAt !== null &&
    now - new Date(completedAt).getTime() > ARCHIVE_GRACE_MS
  );
}

export async function assertNotArchived(groupId: string): Promise<void> {
  const { completedAt } = await groupState(groupId);
  if (isArchived(completedAt)) {
    throw new ApiError(
      403,
      'hangout_archived',
      'This hangout ended more than 24 hours ago, so it is read-only now.',
    );
  }
}

export interface UserTags {
  // hobby / activity / derived
  interests: string[];
  // 'avoid' tags: things the person opted out of ("Alcohol", "Late nights"). A constraint, never an interest.
  avoids: string[];
}

// CHANGED Sep 26 (wave 3): split by kind. Every consumer used to get one flat label list, so "Alcohol" chosen under
// "Anything you'd rather skip?" reached Gemini as an interest — the planner recommended pubs to people avoiding
// alcohol, and icebreakers asked about it.
async function tagsByUser(ids: string[]): Promise<Map<string, UserTags>> {
  const { data, error } = await getServiceClient()
    .from('profile_tags')
    .select('user_id, label, kind')
    .in('user_id', ids);
  if (error) {
    throw new Error(`profile_tags read failed: ${error.message}`);
  }
  const tags = new Map<string, UserTags>();
  for (const row of data) {
    const entry = tags.get(row.user_id as string) ?? { interests: [], avoids: [] };
    (row.kind === 'avoid' ? entry.avoids : entry.interests).push(row.label as string);
    tags.set(row.user_id as string, entry);
  }
  return tags;
}

interface ActivityRow {
  id?: string;
  created_at?: string | null;
  title: string | null;
  venue: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price_cents: number | null;
  starts_at: string | null;
  source: string | null;
  source_url: string | null;
  reasoning: string | null;
  status?: string | null;
}

function toActivity(row: ActivityRow): Activity | null {
  const parsed = activitySchema.safeParse({
    id: row.id,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    title: row.title ?? '',
    venue: row.venue ?? '',
    address: row.address ?? '',
    lat: row.lat,
    lng: row.lng,
    priceCents: row.price_cents,
    // Postgres returns "+00:00" offsets; the contract wants ISO 8601 UTC with Z.
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    source: row.source,
    sourceUrl: row.source_url,
    reasoning: row.reasoning ?? '',
    status: (row.status as ActivityStatus) ?? 'ready',
  });
  if (!parsed.success) {
    console.warn(
      'Skipping an activity row that does not fit the contract',
      parsed.error.issues,
    );
    return null;
  }
  return parsed.data;
}

export async function loadGroup(
  groupId: string,
  viewerId: string,
): Promise<GroupResponse> {
  const rows = await memberRows(groupId, viewerId);
  const ids = rows.map((row) => row.user_id);
  const db = getServiceClient();

  const [groupResult, activityResult, basics, tags, { reach }, meetup, icebreakers] =
    await Promise.all([
      db
        .from('groups')
        .select('id, status, reasoning, completed_at, kind, name, created_by, scheduled_at')
        .eq('id', groupId)
        .single(),
      // Wave 3: every plan is kept; the newest row is the current one and the rest are history.
      db.from('activities').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
      profileBasics(ids),
      tagsByUser(ids),
      exploreFrom(viewerId, undefined, ids),
      meetupForGroup(groupId),
      listIcebreakers(groupId),
    ]);
  if (groupResult.error) {
    throw new Error(`groups read failed: ${groupResult.error.message}`);
  }
  if (activityResult.error) {
    throw new Error(`activities read failed: ${activityResult.error.message}`);
  }

  const status = (groupResult.data.status as GroupStatus | null) ?? 'proposed';
  const kind = (groupResult.data.kind as HangoutKind | null) ?? 'matched';
  const viewerTags = new Set(
    (tags.get(viewerId)?.interests ?? []).map((label) => label.toLowerCase()),
  );
  // CHANGED Sep 26: members past 1st degree are redacted — no id, no displayName, bio, or photo.
  // The design goal is that you never browse the wider matching pool's identities. But accepting
  // a proposed group is itself a commitment to meet, so revealed also flips true once the group
  // leaves 'proposed' — otherwise this and ChatScreen (which needs a real sender name to
  // coordinate) would contradict each other for the exact people you're actively meeting up with.
  const hiddenNames: string[] = [];
  const members: GroupMember[] = rows.map(({ user_id: id, degree, accepted_at }) => {
    const path = reach.get(id);
    // Degrees are relative to whoever is looking; fall back to the stored matching degree if unreachable.
    // Meetup members have no stored degree (they joined a code) — unreachable means "network", never "you".
    const resolvedDegree =
      id === viewerId ? 0 : (path?.degree ?? degree ?? (kind === 'meetup' ? 2 : 0));
    // Meetups are people physically in the same room (co-presence shows basic info — see routes/events.ts), so
    // nobody is redacted there. Matched groups keep the rule below.
    const revealed = kind === 'meetup' || resolvedDegree <= 1 || status !== 'proposed';
    const met = id !== viewerId && path?.degree === 1;
    const sharedInterests =
      id === viewerId
        ? []
        : (tags.get(id)?.interests ?? []).filter((label) =>
            viewerTags.has(label.toLowerCase()),
          );
    const profile = basics.get(id);
    const accepted = accepted_at !== null;
    if (!revealed && profile?.displayName) hiddenNames.push(profile.displayName);
    return revealed
      ? {
          id,
          displayName: profile?.displayName ?? 'Someone',
          bio: profile?.bio ?? null,
          photoUrl: profile?.photoUrl ?? null,
          degree: resolvedDegree,
          sharedInterests,
          revealed: true,
          met,
          accepted,
        }
      : {
          id: null,
          displayName: null,
          bio: null,
          photoUrl: null,
          degree: resolvedDegree,
          sharedInterests,
          revealed: false,
          met: false,
          accepted,
        };
  });
  members.sort((a, b) => a.degree - b.degree);
  const unrevealedCount = members.filter((member) => !member.revealed).length;
  const viewerRow = rows.find((row) => row.user_id === viewerId);
  const myResponse = viewerRow?.accepted_at ? 'accepted' : 'pending';
  const acceptedCount = rows.filter((row) => row.accepted_at !== null).length;

  const activityRows = activityResult.data as ActivityRow[];
  const activityRow = activityRows[0];
  const codeOpen = meetup ? isCodeOpen(meetup) : false;
  // Christian (PR #22): a row with status 'generating' is the placeholder written by POST /activity while the
  // background function works; the client polls/subscribes until it flips to 'ready'.
  const activityStatus = (activityRow?.status as ActivityStatus | null) ?? (activityRow ? 'ready' : null);
  const activity = activityRow ? toActivity(activityRow) : null;
  const activityHistory = activityRows
    .slice(1)
    .filter((row) => (row.status ?? 'ready') === 'ready')
    .flatMap((row) => {
      const parsed = toActivity(row);
      return parsed ? [parsed] : [];
    });
  return {
    id: groupResult.data.id as string,
    status,
    reasoning: redactReasoning((groupResult.data.reasoning as string | null) ?? '', hiddenNames),
    members,
    unrevealedCount,
    activity,
    activityStatus,
    activityHistory,
    completedAt: iso(groupResult.data.completed_at as string | null),
    kind,
    name: (groupResult.data.name as string | null) ?? meetup?.name ?? null,
    eventId: meetup?.id ?? null,
    hostId: (groupResult.data.created_by as string | null) ?? meetup?.created_by ?? null,
    scheduledAt: iso((groupResult.data.scheduled_at as string | null) ?? meetup?.scheduled_at),
    roomCode: meetup && codeOpen ? meetup.room_code : null,
    codeExpiresAt: meetup && codeOpen ? iso(meetup.code_expires_at) : null,
    icebreakers,
    myResponse,
    acceptedCount,
  };
}

// Added Sep 26 (wave 4): one person's answer to a proposed group. Accepting records only the caller's acceptance;
// the group flips to 'confirmed' when every remaining member has accepted. Declining removes the caller (the
// others may still want it) and re-checks, so the last holdout declining can confirm the rest.
export async function respondToGroup(groupId: string, userId: string, accept: boolean): Promise<void> {
  await memberRows(groupId, userId);
  const { status } = await groupState(groupId);
  const db = getServiceClient();
  if (accept) {
    if (status !== 'proposed') return; // already settled — idempotent
    const { error } = await db
      .from('group_members')
      .update({ accepted_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .is('accepted_at', null);
    if (error) {
      throw new ApiError(500, 'update_failed', 'Failed to accept the hangout.');
    }
  } else {
    if (status === 'completed') {
      throw new ApiError(409, 'group_completed', 'This hangout already happened, so it stays in your history.');
    }
    const { error } = await db.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    if (error) {
      throw new ApiError(500, 'update_failed', 'Failed to decline the hangout.');
    }
  }
  await confirmIfEveryoneAccepted(groupId);
}

async function confirmIfEveryoneAccepted(groupId: string): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db.from('group_members').select('accepted_at').eq('group_id', groupId);
  if (error) {
    throw new Error(`group_members read failed: ${error.message}`);
  }
  // A group of one is nobody's hangout: leave it proposed so the app can say everyone else passed.
  if (data.length < 2 || data.some((row) => row.accepted_at === null)) return;
  const { error: updateError } = await db
    .from('groups')
    .update({ status: 'confirmed' })
    .eq('id', groupId)
    .eq('status', 'proposed');
  if (updateError) {
    throw new Error(`groups update failed: ${updateError.message}`);
  }
}

// Added Sep 26 (wave 4): any member can rename a group or meetup. A meetup's `events` row keeps the same name so
// the join lobby and QR-formed connections' "met at" agree.
export async function renameGroup(groupId: string, userId: string, name: string): Promise<void> {
  await memberRows(groupId, userId);
  const db = getServiceClient();
  const { error } = await db.from('groups').update({ name }).eq('id', groupId);
  if (error) {
    throw new Error(`groups update failed: ${error.message}`);
  }
  const { error: eventError } = await db.from('events').update({ name }).eq('group_id', groupId);
  if (eventError) {
    throw new Error(`events update failed: ${eventError.message}`);
  }
}

// Added Sep 26 (wave 2): leave any group you're in that hasn't wrapped up. Proposed: same as declining.
// Confirmed group or live meetup: you drop out; the others keep it. Completed: it's history (feedback, photos,
// the edges it formed), so it can't be left.
//
// CHANGED Sep 26 (wave 3, Sahith's call from testing): leaving a live meetup undoes ONLY the connections that
// meetup created for you — the `connections` rows carrying its `event_id` (ending the meetup, a lobby "We met",
// or a QR scan while it was the active event all write that id). A connection you already had with someone
// before — from an earlier hangout, a QR scan elsewhere, or the seed — carries a different (or no) event id and is
// never touched: `POST /connections` and the end-of-meetup upsert both keep the original row on conflict, so an
// edge's event_id always records where it was FIRST made. Nothing else about the person changes.
export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  await memberRows(groupId, userId);
  const { status } = await groupState(groupId);
  if (status === 'completed') {
    throw new ApiError(409, 'group_completed', 'This hangout already happened, so it stays in your history.');
  }
  const db = getServiceClient();
  const { error } = await db.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  if (error) {
    throw new Error(`group_members delete failed: ${error.message}`);
  }
  const meetup = await meetupForGroup(groupId);
  if (meetup) {
    // Keep the legacy attendee list in step (seed/tests still read it).
    const { error: attendeeError } = await db
      .from('event_attendees')
      .delete()
      .eq('event_id', meetup.id)
      .eq('user_id', userId);
    if (attendeeError) {
      throw new Error(`event_attendees delete failed: ${attendeeError.message}`);
    }
    // Only this meetup's edges, only the leaver's. `event_id` scoping is what protects pre-existing connections.
    const { data: cut, error: cutError } = await db
      .from('connections')
      .delete()
      .eq('event_id', meetup.id)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .select('user_a, user_b');
    if (cutError) {
      throw new Error(`connections delete failed: ${cutError.message}`);
    }
    log.info('groups.left_meetup', { userId, groupId, eventId: meetup.id, connectionsCut: cut?.length ?? 0 });
  }
}

// The group's combined constraints: the tightest budget and travel range, centred on the members.
export async function activityInput(
  groupId: string,
  viewerId: string,
): Promise<GenerateActivityInput> {
  const ids = (await memberRows(groupId, viewerId)).map((row) => row.user_id);
  const db = getServiceClient();
  const [profiles, prefs, tags, previous] = await Promise.all([
    db
      .from('profiles')
      .select('id, username, display_name, city, lat, lng')
      .in('id', ids),
    db
      .from('preferences')
      .select('cost_max_cents, max_travel_mi')
      .in('user_id', ids),
    tagsByUser(ids),
    // Wave 3: the venues already suggested for this group, so a regenerate doesn't hand back the same plan.
    db
      .from('activities')
      .select('venue')
      .eq('group_id', groupId)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(12),
  ]);
  if (profiles.error) {
    throw new Error(`profiles read failed: ${profiles.error.message}`);
  }
  if (prefs.error) {
    throw new Error(`preferences read failed: ${prefs.error.message}`);
  }
  if (previous.error) {
    throw new Error(`activities read failed: ${previous.error.message}`);
  }
  const previousVenues = [
    ...new Set(
      previous.data
        .map((row) => (row.venue as string | null)?.trim() ?? '')
        .filter((venue) => venue.length > 0),
    ),
  ];

  const located = profiles.data.filter(
    (row) => typeof row.lat === 'number' && typeof row.lng === 'number',
  );
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const cities = profiles.data
    .map((row) => row.city as string | null)
    .filter((city): city is string => Boolean(city));
  const tightest = (values: (number | null)[], fallback: number) => {
    const known = values.filter(
      (value): value is number => typeof value === 'number',
    );
    return known.length > 0 ? Math.min(...known) : fallback;
  };

  return {
    members: profiles.data.map((row) => ({
      displayName:
        (row.display_name as string | null) ?? (row.username as string),
      interests: tags.get(row.id as string)?.interests ?? [],
      avoids: tags.get(row.id as string)?.avoids ?? [],
    })),
    constraints: {
      maxCostCents: tightest(
        prefs.data.map((row) => row.cost_max_cents as number | null),
        DEFAULT_MAX_COST_CENTS,
      ),
      maxTravelMi: tightest(
        prefs.data.map((row) => row.max_travel_mi as number | null),
        DEFAULT_MAX_TRAVEL_MI,
      ),
      city: cities[0] ?? DEFAULT_CENTER.city,
      lat:
        located.length > 0
          ? average(located.map((row) => row.lat as number))
          : DEFAULT_CENTER.lat,
      lng:
        located.length > 0
          ? average(located.map((row) => row.lng as number))
          : DEFAULT_CENTER.lng,
    },
    previousVenues,
  };
}

// CHANGED Sep 26 (wave 3): plans are kept. Saving removes only the group's placeholder rows ('generating' /
// 'failed') and inserts the new row, which becomes the current plan by being newest; earlier 'ready' rows stay
// as history. `job` is the resumable stage state kept while status is 'generating' (see ai/generateActivity.ts
// runActivityStage); null once the plan is ready.
export async function saveActivity(
  groupId: string,
  activity: Activity,
  status: ActivityStatus = 'ready',
  job: ActivityJob | null = null,
): Promise<void> {
  const db = getServiceClient();
  const { error: deleteError } = await db
    .from('activities')
    .delete()
    .eq('group_id', groupId)
    .in('status', ['generating', 'failed']);
  if (deleteError) {
    throw new Error(`activities delete failed: ${deleteError.message}`);
  }
  const { error } = await db.from('activities').insert({
    group_id: groupId,
    title: activity.title,
    venue: activity.venue,
    address: activity.address,
    lat: activity.lat,
    lng: activity.lng,
    price_cents: activity.priceCents,
    starts_at: activity.startsAt,
    source: activity.source,
    source_url: activity.sourceUrl,
    reasoning: activity.reasoning,
    status,
    job,
  });
  if (error) {
    throw new Error(`activities insert failed: ${error.message}`);
  }
}

export interface ActivityJobRow {
  id: string;
  status: ActivityStatus;
  job: ActivityJob | null;
  activity: Activity | null;
}

// The group's current activity row as a job: status, parsed job state (null when absent or unparseable), and
// the plan itself. Null when the group has no activity row at all.
export async function loadActivityJob(groupId: string): Promise<ActivityJobRow | null> {
  const { data, error } = await getServiceClient()
    .from('activities')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`activities read failed: ${error.message}`);
  }
  if (!data) return null;
  const row = data as ActivityRow & { id: string; job: unknown };
  const parsed = activityJobSchema.safeParse(row.job);
  return {
    id: row.id,
    status: (row.status as ActivityStatus | null) ?? 'ready',
    job: parsed.success ? parsed.data : null,
    activity: toActivity(row),
  };
}

export async function updateActivityJob(
  activityId: string,
  patch: { job?: ActivityJob | null; status?: ActivityStatus },
): Promise<void> {
  const { error } = await getServiceClient()
    .from('activities')
    .update(patch)
    .eq('id', activityId);
  if (error) {
    throw new Error(`activities update failed: ${error.message}`);
  }
}

// Christian (PR #22): the placeholder row POST /activity writes before handing off to the background function.
// Coordinates default to campus so the row still satisfies the Activity contract.
export async function setActivityGenerating(groupId: string, job: ActivityJob = newActivityJob()): Promise<Activity> {
  const placeholder: Activity = {
    title: 'Curating hangout plan...',
    venue: 'Degrees AI',
    address: 'Finding a venue near everyone...',
    lat: 33.7756,
    lng: -84.3963,
    priceCents: null,
    startsAt: null,
    source: 'maps',
    sourceUrl: null,
    reasoning: 'Degrees AI is currently selecting a venue with Google Maps & Gemini that fits the group.',
    status: 'generating',
  };
  await saveActivity(groupId, placeholder, 'generating', job);
  return placeholder;
}

// Added Sep 26 (wave 3): make an earlier plan the current one again. It's copied as a new row (so the history
// stays chronological and the copy gets today's timestamp) and any in-flight placeholder is dropped.
export async function restoreActivity(groupId: string, activityId: string): Promise<Activity> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('activities')
    .select('*')
    .eq('group_id', groupId)
    .eq('id', activityId)
    .eq('status', 'ready')
    .maybeSingle();
  if (error) {
    throw new Error(`activities read failed: ${error.message}`);
  }
  const previous = data ? toActivity(data as ActivityRow) : null;
  if (!previous) {
    throw new ApiError(404, 'activity_not_found', 'That plan is no longer available.');
  }
  const { id: _id, createdAt: _createdAt, ...plan } = previous;
  await saveActivity(groupId, plan, 'ready', null);
  const current = await loadActivityJob(groupId);
  return current?.activity ?? plan;
}
