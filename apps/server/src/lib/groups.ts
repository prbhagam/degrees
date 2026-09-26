// Owner: Pranav (Groups, Activities & Chat) — reads a group as its viewer sees it; used by groups + messages routes.
import {
  activitySchema,
  type Activity,
  type ActivityStatus,
  type GenerateActivityInput,
  type GroupMember,
  type GroupResponse,
  type GroupStatus,
} from '@degrees/shared';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from './errors.js';
import { exploreFrom, profileBasics } from './graph.js';

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
    .select('user_id, degree')
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

// Chat and photo uploads close this long after a hangout is marked done (the app hides the
// composer at the same mark; this is the server-side half).
export const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;

export interface GroupState {
  status: GroupStatus;
  completedAt: string | null;
}

export async function groupState(groupId: string): Promise<GroupState> {
  const { data, error } = await getServiceClient()
    .from('groups')
    .select('status, completed_at')
    .eq('id', groupId)
    .single();
  if (error) {
    throw new Error(`groups read failed: ${error.message}`);
  }
  return {
    status: (data.status as GroupStatus | null) ?? 'proposed',
    completedAt: (data.completed_at as string | null) ?? null,
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

async function tagsByUser(ids: string[]): Promise<Map<string, string[]>> {
  const { data, error } = await getServiceClient()
    .from('profile_tags')
    .select('user_id, label')
    .in('user_id', ids);
  if (error) {
    throw new Error(`profile_tags read failed: ${error.message}`);
  }
  const tags = new Map<string, string[]>();
  for (const row of data) {
    const list = tags.get(row.user_id as string) ?? [];
    list.push(row.label as string);
    tags.set(row.user_id as string, list);
  }
  return tags;
}

interface ActivityRow {
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
    title: row.title ?? '',
    venue: row.venue ?? '',
    address: row.address ?? '',
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    priceCents: row.price_cents,
    // Postgres returns "+00:00" offsets; the contract wants ISO 8601 UTC with Z.
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    source: row.source === 'ticketmaster' ? 'ticketmaster' : 'maps',
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

  const [groupResult, activityResult, basics, tags, { reach }] =
    await Promise.all([
      db
        .from('groups')
        .select('id, status, reasoning, completed_at')
        .eq('id', groupId)
        .single(),
      db.from('activities').select('*').eq('group_id', groupId).limit(1),
      profileBasics(ids),
      tagsByUser(ids),
      exploreFrom(viewerId, undefined, ids),
    ]);
  if (groupResult.error) {
    throw new Error(`groups read failed: ${groupResult.error.message}`);
  }
  if (activityResult.error) {
    throw new Error(`activities read failed: ${activityResult.error.message}`);
  }

  const status = (groupResult.data.status as GroupStatus | null) ?? 'proposed';
  const viewerTags = new Set(
    (tags.get(viewerId) ?? []).map((label) => label.toLowerCase()),
  );
  // CHANGED Sep 26: members past 1st degree are redacted — no id, no displayName, bio, or photo.
  // The design goal is that you never browse the wider matching pool's identities. But accepting
  // a proposed group is itself a commitment to meet, so revealed also flips true once the group
  // leaves 'proposed' — otherwise this and ChatScreen (which needs a real sender name to
  // coordinate) would contradict each other for the exact people you're actively meeting up with.
  const members: GroupMember[] = rows.map(({ user_id: id, degree }) => {
    const path = reach.get(id);
    // Degrees are relative to whoever is looking; fall back to the stored matching degree if unreachable.
    const resolvedDegree = path?.degree ?? degree ?? 0;
    const revealed = resolvedDegree <= 1 || status !== 'proposed';
    const sharedInterests =
      id === viewerId
        ? []
        : (tags.get(id) ?? []).filter((label) =>
            viewerTags.has(label.toLowerCase()),
          );
    const profile = basics.get(id);
    return revealed
      ? {
          id,
          displayName: profile?.displayName ?? 'Someone',
          bio: profile?.bio ?? null,
          photoUrl: profile?.photoUrl ?? null,
          degree: resolvedDegree,
          sharedInterests,
          revealed: true,
        }
      : {
          id: null,
          displayName: null,
          bio: null,
          photoUrl: null,
          degree: resolvedDegree,
          sharedInterests,
          revealed: false,
        };
  });
  members.sort((a, b) => a.degree - b.degree);
  const unrevealedCount = members.filter((member) => !member.revealed).length;

  const activityRow = activityResult.data[0] as ActivityRow | undefined;
  const activityStatus = (activityRow?.status as ActivityStatus | null) ?? (activityRow ? 'ready' : null);
  const activity = activityRow ? toActivity(activityRow) : null;
  return {
    id: groupResult.data.id as string,
    status,
    reasoning: (groupResult.data.reasoning as string | null) ?? '',
    members,
    unrevealedCount,
    activity,
    activityStatus,
    completedAt: (groupResult.data.completed_at as string | null) ?? null,
  };
}

// The group's combined constraints: the tightest budget and travel range, centred on the members.
export async function activityInput(
  groupId: string,
  viewerId: string,
): Promise<GenerateActivityInput> {
  const ids = (await memberRows(groupId, viewerId)).map((row) => row.user_id);
  const db = getServiceClient();
  const [profiles, prefs, tags] = await Promise.all([
    db
      .from('profiles')
      .select('id, username, display_name, city, lat, lng')
      .in('id', ids),
    db
      .from('preferences')
      .select('cost_max_cents, max_travel_mi')
      .in('user_id', ids),
    tagsByUser(ids),
  ]);
  if (profiles.error) {
    throw new Error(`profiles read failed: ${profiles.error.message}`);
  }
  if (prefs.error) {
    throw new Error(`preferences read failed: ${prefs.error.message}`);
  }

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
      interests: tags.get(row.id as string) ?? [],
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
  };
}

// One plan per group: generating again replaces the previous one.
export async function saveActivity(
  groupId: string,
  activity: Activity,
  status: ActivityStatus = 'ready',
): Promise<void> {
  const db = getServiceClient();
  const { error: deleteError } = await db
    .from('activities')
    .delete()
    .eq('group_id', groupId);
  if (deleteError) {
    throw new Error(`activities delete failed: ${deleteError.message}`);
  }
  const payload: Record<string, unknown> = {
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
  };
  let { error } = await db.from('activities').insert(payload);
  if (error && error.message?.includes('status')) {
    delete payload.status;
    const retry = await db.from('activities').insert(payload);
    error = retry.error;
  }
  if (error) {
    throw new Error(`activities insert failed: ${error.message}`);
  }
}

export async function setActivityGenerating(groupId: string): Promise<Activity> {
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
  await saveActivity(groupId, placeholder, 'generating');
  return placeholder;
}
