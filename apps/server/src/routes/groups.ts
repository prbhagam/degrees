// Owner: Pranav (Groups, Activities & Chat) — group view + activity; Christian owns the server framework.
// CHANGED Sep 26 (wave 5, Sahith): proposed times for the plan (POST /times, /times/:id/vote, /times/:id/choose,
// DELETE /times/:id); notifications on plan ready/restored, meetup ended (+ who got connected), and contact
// exchange; "Use this plan" no longer duplicates the plan in mock mode either.
import { Hono } from 'hono';
import {
  addPhotoRequestSchema,
  exchangeRequestSchema,
  proposeTimeRequestSchema,
  renameGroupRequestSchema,
  respondRequestSchema,
  restoreActivityRequestSchema,
  timeVoteRequestSchema,
  type Activity,
  type ExchangeResponse,
  type GenerateActivityInput,
  type ActivityJobResponse,
  type GroupResponse,
  type IcebreakersResponse,
  type OkResponse,
  type Photo,
  type PhotosResponse,
  type TimeSlot,
  type TimesResponse,
} from '@degrees/shared';
import { generateActivity, newActivityJob, runActivityStage } from '../ai/generateActivity.js';
import { generateIcebreakers } from '../ai/generateIcebreakers.js';
import { env } from '../config/env.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { displayNames } from '../lib/graph.js';
import {
  activityInput,
  assertNotArchived,
  chooseTime,
  groupNotFound,
  groupState,
  icebreakersInput,
  isArchived,
  leaveGroup,
  loadActivityJob,
  loadGroup,
  meetupForGroup,
  memberRows,
  proposeTime,
  removeTime,
  renameGroup,
  respondToGroup,
  restoreActivity,
  saveActivity,
  saveIcebreakers,
  setActivityGenerating,
  updateActivityJob,
  voteTime,
} from '../lib/groups.js';
import { log, timed } from '../lib/log.js';
import { notify } from '../lib/notify.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID, groupFixture, icebreakersFixture, meFixture, people, timesFixture } from '../mocks/fixtures.js';
import { getServiceClient } from '../db/supabase.js';

// Signed read URLs for the private event-photos bucket; long enough to browse an album, short enough that a
// leaked link goes stale.
const PHOTO_URL_TTL_SECONDS = 60 * 60;

// One plan-job stage per /advance call: 7.5s of external work leaves room for the DB reads/writes around it
// inside Netlify's 10s synchronous limit. The lock stops a concurrent poll from running the same stage.
const STAGE_BUDGET_MS = 7_500;
const STAGE_LOCK_MS = 9_500;
// A 'generating' job untouched for this long is abandoned; a new "Plan something" restarts it.
const JOB_FRESH_MS = 2 * 60 * 1000;
const isFresh = (updatedAt: string) => Date.now() - new Date(updatedAt).getTime() < JOB_FRESH_MS;
export const PHOTO_BUCKET = 'event-photos';

const mockActivityInput = {
  members: people.slice(0, 4).map(({ displayName, interests }) => ({
    displayName,
    interests: [...interests],
    avoids: [],
  })),
  constraints: {
    maxCostCents: 3500,
    maxTravelMi: 8,
    city: 'Atlanta',
    lat: 33.7756,
    lng: -84.3963,
  },
  previousVenues: [],
  previousPlans: [],
} satisfies GenerateActivityInput;

// Mock mode keeps the latest generated plan in memory so GET reflects POST. Wave 3: earlier plans are kept too.
let mockActivity: Activity | null = groupFixture.activity;
let mockActivityHistory: Activity[] = [...groupFixture.activityHistory];
let mockActivitySerial = 0;
function mockPlan(activity: Activity): Activity {
  mockActivitySerial += 1;
  return { ...activity, id: `mock-activity-${mockActivitySerial}`, createdAt: new Date().toISOString() };
}
function mockReplaceActivity(next: Activity): void {
  // wave 5: a restored plan leaves the history (it's the current plan again) — it used to stay AND be copied.
  mockActivityHistory = mockActivityHistory.filter((plan) => plan.id !== next.id);
  if (mockActivity && mockActivity.status !== 'generating') {
    mockActivityHistory = [mockActivity, ...mockActivityHistory];
  }
  mockActivity = mockPlan(next);
}
// wave 5: proposed times for the demo group, in memory.
let mockTimes: TimeSlot[] = timesFixture();
let mockTimeSerial = 1;
let mockScheduledAt: string | null = null;
function mockTimesView(): TimeSlot[] {
  return mockTimes.map((slot) => ({ ...slot, chosen: mockScheduledAt === slot.startsAt }));
}
let mockCompletedAt: string | null = null;
let mockStatus: GroupResponse['status'] = groupFixture.status;
const mockPhotos: Photo[] = [];
let mockIcebreakers: string[] = [];
let mockLeft = false;
let mockName: string | null = groupFixture.name;
let mockMyResponse: GroupResponse['myResponse'] = groupFixture.myResponse;

function assertMockGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID || mockLeft) {
    throw groupNotFound();
  }
}

// ---- Contact exchange: symmetric per-pair state, same user_a < user_b convention as `connections`.
interface ExchangeState {
  a: string;
  b: string;
  aAccepted: boolean;
  bAccepted: boolean;
}
const mockExchanges = new Map<string, ExchangeState>();

function exchangeKey(groupId: string, userA: string, userB: string): string {
  return `${groupId}:${[userA, userB].sort().join(':')}`;
}

function setMockAcceptance(
  groupId: string,
  userId: string,
  peerId: string,
): ExchangeState {
  const [a, b] = [userId, peerId].sort() as [string, string];
  const key = exchangeKey(groupId, userId, peerId);
  const existing = mockExchanges.get(key) ?? {
    a,
    b,
    aAccepted: false,
    bAccepted: false,
  };
  if (userId === a) existing.aAccepted = true;
  else existing.bAccepted = true;
  mockExchanges.set(key, existing);
  return existing;
}

// Deterministic fake phone from an id, since the `people` fixture doesn't carry one — good enough
// for the demo, and keeps this change from touching 8 fixture rows for cosmetic reasons.
function mockPhoneFor(id: string): string {
  const digits = id.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `+1-404-555-${digits}`;
}

function exchangeResponseFor(
  state: ExchangeState,
  viewerId: string,
): ExchangeResponse {
  const viewerAccepted =
    viewerId === state.a ? state.aAccepted : state.bAccepted;
  const peerAccepted = viewerId === state.a ? state.bAccepted : state.aAccepted;
  const peerId = viewerId === state.a ? state.b : state.a;
  return {
    requesterAccepted: viewerAccepted,
    peerAccepted,
    peerPhone: viewerAccepted && peerAccepted ? mockPhoneFor(peerId) : null,
  };
}

export const groupRoutes = new Hono<AppEnv>()
  .get('/groups/:id', async (context) => {
    const groupId = context.req.param('id');
    if (env.mockMode) {
      assertMockGroup(groupId);
      const response = {
        ...groupFixture,
        status: mockStatus,
        activity: mockActivity,
        activityStatus: mockActivity ? 'ready' : null,
        activityHistory: mockActivityHistory,
        completedAt: mockCompletedAt,
        icebreakers: mockIcebreakers,
        name: mockName,
        myResponse: mockMyResponse,
        acceptedCount: mockMyResponse === 'accepted' ? groupFixture.members.length : groupFixture.members.length - 1,
        scheduledAt: mockScheduledAt,
        times: mockTimesView(),
      } satisfies GroupResponse;
      return context.json(response);
    }
    const response = await loadGroup(groupId, context.get('userId'));
    return context.json(response);
  })
  // Added Sep 26 (wave 2): drop out of a group or meetup that hasn't wrapped up. See lib/groups.ts leaveGroup.
  .post('/groups/:id/leave', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    if (env.mockMode) {
      assertMockGroup(groupId);
      if (mockStatus === 'completed') {
        throw new ApiError(409, 'group_completed', 'This hangout already happened, so it stays in your history.');
      }
      mockLeft = true;
      const response = { ok: true } satisfies OkResponse;
      return context.json(response);
    }
    await leaveGroup(groupId, userId);
    log.info('groups.left', { userId, groupId });
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  })
  // Added Sep 26 (wave 2): Gemini-written conversation starters for the people in this group. Any member can
  // (re)generate; the set replaces the previous one and is returned by GET /groups/:id as `icebreakers`.
  .post('/groups/:id/icebreakers', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    if (env.mockMode) {
      assertMockGroup(groupId);
      mockIcebreakers = icebreakersFixture.icebreakers;
      const response = { icebreakers: mockIcebreakers } satisfies IcebreakersResponse;
      return context.json(response);
    }
    const input = await icebreakersInput(groupId, userId);
    const icebreakers = await generateIcebreakers(input);
    await saveIcebreakers(groupId, icebreakers);
    log.info('groups.icebreakers', { userId, groupId, count: icebreakers.length });
    const response = { icebreakers } satisfies IcebreakersResponse;
    return context.json(response);
  })
  // Added Sep 26: a proposed group previously had no way to say no.
  .post('/groups/:id/respond', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const { accept } = await validateJson(context, respondRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      // The fixture's other members have all accepted, so the caller's yes is the last one.
      if (accept) {
        mockMyResponse = 'accepted';
        mockStatus = 'confirmed';
      } else {
        mockLeft = true;
      }
      const response = { ok: true } satisfies OkResponse;
      return context.json(response);
    }
    // CHANGED Sep 26 (wave 4): each member answers for themselves — see lib/groups.ts respondToGroup.
    await respondToGroup(groupId, userId, accept);
    log.info('groups.responded', { userId, groupId, accept });
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  })
  // Added Sep 26 (wave 4): rename a group or meetup.
  .put('/groups/:id', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const { name } = await validateJson(context, renameGroupRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      mockName = name;
      const response = { ok: true } satisfies OkResponse;
      return context.json(response);
    }
    await renameGroup(groupId, userId, name);
    log.info('groups.renamed', { userId, groupId });
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  })
  .post('/groups/:id/activity', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    if (env.mockMode) {
      assertMockGroup(groupId);
      mockReplaceActivity(await generateActivity(mockActivityInput));
      const response: Activity = mockActivity!;
      return context.json(response);
    }
    await memberRows(groupId, userId);

    // Wave 2 (legacy Netlify plan: 10s functions, no Background Functions): this only STARTS the job. It writes a
    // 'generating' placeholder with job.stage = 'grounded' and returns at once. The app then calls
    // POST /groups/:id/activity/advance repeatedly; each advance runs one external call inside its own budget and
    // the last one writes the plan. A fresh job that's already running isn't restarted by a double tap.
    const existing = await loadActivityJob(groupId);
    if (existing?.status === 'generating' && existing.job && isFresh(existing.job.updatedAt)) {
      const response: Activity = existing.activity ?? (await setActivityGenerating(groupId, existing.job));
      return context.json(response);
    }
    const placeholder = await setActivityGenerating(groupId, newActivityJob());
    log.info('activity.job.started', { groupId, userId });
    return context.json(placeholder);
  })
  // Added Sep 26 (wave 2): run ONE stage of the group's plan job (see ai/generateActivity.ts). Safe to call any
  // time: a finished job just returns the plan, a concurrent advance returns the current state without working.
  .post('/groups/:id/activity/advance', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    if (env.mockMode) {
      assertMockGroup(groupId);
      const response = {
        status: 'ready',
        stage: null,
        activity: mockActivity,
      } satisfies ActivityJobResponse;
      return context.json(response);
    }
    await memberRows(groupId, userId);
    const current = await loadActivityJob(groupId);
    if (!current) {
      throw new ApiError(404, 'activity_not_found', 'Start a plan first.');
    }
    if (current.status !== 'generating') {
      const response = { status: current.status, stage: null, activity: current.activity } satisfies ActivityJobResponse;
      return context.json(response);
    }
    // No parseable job on a generating row (a row written by an older server): restart from the first stage.
    const job = current.job ?? newActivityJob();
    const now = Date.now();
    if (job.lockedUntil && new Date(job.lockedUntil).getTime() > now) {
      const response = { status: 'generating', stage: job.stage, activity: null } satisfies ActivityJobResponse;
      return context.json(response);
    }
    // Claim the stage for this invocation. The lock outlives the stage budget slightly so a second poll that
    // arrives mid-stage waits for the next one instead of running the same call twice.
    const locked = { ...job, lockedUntil: new Date(now + STAGE_LOCK_MS).toISOString() };
    await updateActivityJob(current.id, { job: locked });

    const input = await activityInput(groupId, userId);
    const result = await timed('ai.activity.stage', { groupId, stage: job.stage }, () =>
      runActivityStage(job, input, STAGE_BUDGET_MS),
    );
    if (result.activity) {
      await saveActivity(groupId, result.activity, 'ready', null);
      log.info('activity.job.ready', { groupId, userId, source: result.activity.source, stages: result.job.errors.length + 1 });
      // wave 5: whoever's device finished the job already sees it; everyone else hears there's a plan.
      await notifyPlanChanged(groupId, userId, result.activity.title);
      const response = { status: 'ready', stage: null, activity: result.activity } satisfies ActivityJobResponse;
      return context.json(response);
    }
    const { lockedUntil: _unlocked, ...next } = result.job;
    await updateActivityJob(current.id, { job: next });
    const response = { status: 'generating', stage: next.stage, activity: null } satisfies ActivityJobResponse;
    return context.json(response);
  })
  // Added Sep 26 (wave 3): bring back an earlier plan from GroupResponse.activityHistory.
  .post('/groups/:id/activity/restore', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const { activityId } = await validateJson(context, restoreActivityRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      const previous = mockActivityHistory.find((plan) => plan.id === activityId);
      if (!previous) {
        throw new ApiError(404, 'activity_not_found', 'That plan is no longer available.');
      }
      mockReplaceActivity(previous);
      const response: Activity = mockActivity!;
      return context.json(response);
    }
    await memberRows(groupId, userId);
    const activity = await restoreActivity(groupId, activityId);
    log.info('activity.restored', { groupId, userId, activityId });
    await notifyPlanChanged(groupId, userId, activity.title);
    const response: Activity = activity;
    return context.json(response);
  })
  // ---- Times for the plan (Added Sep 26, wave 5) --------------------------------------------------
  // The calendar lives here now, not on "Host a meetup": members propose times, say which they're free for, and
  // any member locks one in (groups.scheduled_at). See lib/groups.ts.
  .post('/groups/:id/times', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const { startsAt, note } = await validateJson(context, proposeTimeRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      const at = new Date(startsAt);
      at.setSeconds(0, 0);
      const iso = at.toISOString();
      let slot = mockTimes.find((existing) => existing.startsAt === iso);
      if (!slot) {
        mockTimeSerial += 1;
        slot = {
          id: `mock-time-${mockTimeSerial}`,
          startsAt: iso,
          note: note?.trim() || null,
          proposedById: userId,
          proposedByName: meFixture.displayName,
          availableIds: [],
          availableNames: [],
          imAvailable: false,
          chosen: false,
        };
        mockTimes = [...mockTimes, slot].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      }
      if (!slot.availableIds.includes(userId)) {
        slot.availableIds.push(userId);
        slot.availableNames.push(meFixture.displayName);
        slot.imAvailable = true;
      }
      const response = { times: mockTimesView() } satisfies TimesResponse;
      return context.json(response);
    }
    const times = await proposeTime(groupId, userId, startsAt, note);
    log.info('groups.time_proposed', { userId, groupId, startsAt });
    const response = { times } satisfies TimesResponse;
    return context.json(response);
  })
  .post('/groups/:id/times/:timeId/vote', async (context) => {
    const groupId = context.req.param('id');
    const timeId = context.req.param('timeId');
    const userId = context.get('userId');
    const { available } = await validateJson(context, timeVoteRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      const slot = mockTimes.find((existing) => existing.id === timeId);
      if (!slot) {
        throw new ApiError(404, 'time_not_found', 'That time is no longer proposed.');
      }
      const index = slot.availableIds.indexOf(userId);
      if (available && index === -1) {
        slot.availableIds.push(userId);
        slot.availableNames.push(meFixture.displayName);
      } else if (!available && index !== -1) {
        slot.availableIds.splice(index, 1);
        slot.availableNames.splice(index, 1);
      }
      slot.imAvailable = available;
      const response = { times: mockTimesView() } satisfies TimesResponse;
      return context.json(response);
    }
    const times = await voteTime(groupId, userId, timeId, available);
    const response = { times } satisfies TimesResponse;
    return context.json(response);
  })
  .post('/groups/:id/times/:timeId/choose', async (context) => {
    const groupId = context.req.param('id');
    const timeId = context.req.param('timeId');
    const userId = context.get('userId');
    if (env.mockMode) {
      assertMockGroup(groupId);
      const slot = mockTimes.find((existing) => existing.id === timeId);
      if (!slot) {
        throw new ApiError(404, 'time_not_found', 'That time is no longer proposed.');
      }
      mockScheduledAt = slot.startsAt;
      const response = { times: mockTimesView() } satisfies TimesResponse;
      return context.json(response);
    }
    const times = await chooseTime(groupId, userId, timeId);
    log.info('groups.time_chosen', { userId, groupId, timeId });
    const response = { times } satisfies TimesResponse;
    return context.json(response);
  })
  .delete('/groups/:id/times/:timeId', async (context) => {
    const groupId = context.req.param('id');
    const timeId = context.req.param('timeId');
    const userId = context.get('userId');
    if (env.mockMode) {
      assertMockGroup(groupId);
      const slot = mockTimes.find((existing) => existing.id === timeId);
      if (!slot) {
        throw new ApiError(404, 'time_not_found', 'That time is no longer proposed.');
      }
      if (slot.proposedById !== userId) {
        throw new ApiError(403, 'not_proposer', 'Only whoever proposed a time can remove it.');
      }
      mockTimes = mockTimes.filter((existing) => existing.id !== timeId);
      if (mockScheduledAt === slot.startsAt) mockScheduledAt = null;
      const response = { times: mockTimesView() } satisfies TimesResponse;
      return context.json(response);
    }
    const times = await removeTime(groupId, userId, timeId);
    const response = { times } satisfies TimesResponse;
    return context.json(response);
  })
  .post('/groups/:id/complete', async (context) => {
    const groupId = context.req.param('id');
    if (env.mockMode) {
      assertMockGroup(groupId);
      mockCompletedAt ??= new Date().toISOString();
      mockStatus = 'completed';
      const response = { ok: true } satisfies OkResponse;
      return context.json(response);
    }
    const userId = context.get('userId');
    const members = await memberRows(groupId, userId);
    const { status, kind } = await groupState(groupId);
    // A still-proposed matched group is people who haven't agreed to meet.
    if (kind === 'matched' && status === 'proposed') {
      throw new ApiError(
        409,
        'group_not_confirmed',
        'Accept the hangout before marking it done.',
      );
    }
    const db = getServiceClient();
    const now = new Date().toISOString();
    // Only the first completion stamps the time, so a second tap can't restart the 24h window.
    const { error } = await db
      .from('groups')
      .update({ status: 'completed', completed_at: now })
      .eq('id', groupId)
      .is('completed_at', null);
    if (error) {
      throw new ApiError(
        500,
        'update_failed',
        'Failed to mark the hangout done.',
      );
    }

    // CHANGED Sep 26 (wave 2, team decision): who gets connected depends on the kind.
    //  * meetup — everyone there scanned a code in the same room, so ending it connects every pair
    //    (met_context 'event', tied to the event). The room code closes at the same time.
    //  * matched — completing no longer auto-connects. Edges form only through the explicit per-person
    //    "We met" (POST /connections, context 'group'), same as the event lobby.
    if (kind === 'meetup') {
      const meetup = await meetupForGroup(groupId);
      if (meetup) {
        const { error: endError } = await db
          .from('events')
          .update({ ended_at: now })
          .eq('id', meetup.id)
          .is('ended_at', null);
        if (endError) {
          throw new Error(`events update failed: ${endError.message}`);
        }
      }
      const ids = members.map((row) => row.user_id);
      const pairs = ids.flatMap((a, i) =>
        ids.slice(i + 1).map((b) => [a, b].sort() as [string, string]),
      );
      // ignoreDuplicates + select returns only the rows this call inserted: the pairs that are NEW 1st degrees.
      const newCount = new Map<string, number>();
      if (pairs.length > 0) {
        const { data: inserted, error: connectError } = await db
          .from('connections')
          .upsert(
            pairs.map(([userA, userB]) => ({
              user_a: userA,
              user_b: userB,
              met_context: 'event' as const,
              event_id: meetup?.id ?? null,
            })),
            { onConflict: 'user_a,user_b', ignoreDuplicates: true },
          )
          .select('user_a, user_b');
        if (connectError) {
          throw new Error(`connections insert failed: ${connectError.message}`);
        }
        for (const row of inserted ?? []) {
          for (const id of [row.user_a as string, row.user_b as string]) {
            newCount.set(id, (newCount.get(id) ?? 0) + 1);
          }
        }
      }
      log.info('groups.meetup_ended', { userId, groupId, members: ids.length, pairs: pairs.length });
      // wave 5: everyone else hears it ended, and anyone who gained 1st degrees hears how many.
      const eventName = meetup?.name ?? null;
      await notify(ids, 'event_changed', { groupId, name: eventName, change: 'ended' }, { exclude: userId });
      await Promise.all(
        ids
          .filter((id) => (newCount.get(id) ?? 0) > 0)
          .map((id) =>
            notify([id], 'connection_added', { groupId, eventId: meetup?.id ?? null, eventName, count: newCount.get(id) }),
          ),
      );
    } else {
      log.info('groups.completed', { userId, groupId, members: members.length });
      const { data: named } = await db.from('groups').select('name').eq('id', groupId).maybeSingle();
      await notify(
        members.map((row) => row.user_id),
        'event_changed',
        { groupId, name: (named?.name as string | null) ?? null, change: 'ended' },
        { exclude: userId },
      );
    }
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  })
  .post('/groups/:id/exchange-request', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const { peerId } = await validateJson(context, exchangeRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      const state = setMockAcceptance(groupId, userId, peerId);
      return context.json(exchangeResponseFor(state, userId));
    }
    const response = await requestOrAcceptExchange(groupId, userId, peerId);
    return context.json(response);
  })
  .post('/groups/:id/exchange-accept', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const { peerId } = await validateJson(context, exchangeRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      const state = setMockAcceptance(groupId, userId, peerId);
      return context.json(exchangeResponseFor(state, userId));
    }
    const response = await requestOrAcceptExchange(groupId, userId, peerId);
    return context.json(response);
  })
  .get('/groups/:id/photos', async (context) => {
    const groupId = context.req.param('id');
    if (env.mockMode) {
      assertMockGroup(groupId);
      const response = { photos: mockPhotos } satisfies PhotosResponse;
      return context.json(response);
    }
    await memberRows(groupId, context.get('userId'));
    const response: PhotosResponse = { photos: await listPhotos(groupId) };
    return context.json(response);
  })
  .post('/groups/:id/photos', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const body = await validateJson(context, addPhotoRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      if (isArchived(mockCompletedAt)) {
        throw new ApiError(
          403,
          'hangout_archived',
          'This hangout ended more than 24 hours ago, so it is read-only now.',
        );
      }
      const photo: Photo = {
        id: `mock-photo-${mockPhotos.length + 1}`,
        uploaderId: userId,
        uploaderName: 'You',
        storagePath: body.storagePath,
        url: null,
        createdAt: new Date().toISOString(),
      };
      mockPhotos.push(photo);
      const response = { photos: mockPhotos } satisfies PhotosResponse;
      return context.json(response);
    }
    await memberRows(groupId, userId);
    await assertNotArchived(groupId);
    // The app uploads to event-photos/<groupId>/<file>; a path pointing at another group's folder is refused so
    // the pointer table can't reference an image the storage policy wouldn't have allowed.
    if (!body.storagePath.startsWith(`${groupId}/`)) {
      throw new ApiError(400, 'invalid_request', 'storagePath must be inside this group\'s folder.');
    }
    const { error } = await getServiceClient().from('event_photos').insert({
      group_id: groupId,
      uploader_id: userId,
      storage_path: body.storagePath,
    });
    if (error) {
      throw new ApiError(500, 'save_failed', 'Failed to save the photo.');
    }
    // The contract (and the app) expect the updated list back, not { ok }.
    const response: PhotosResponse = { photos: await listPhotos(groupId) };
    return context.json(response);
  });

// wave 5: "the plan changed" for everyone but the person whose action changed it.
async function notifyPlanChanged(groupId: string, actorId: string, title: string): Promise<void> {
  const db = getServiceClient();
  const [members, group] = await Promise.all([
    db.from('group_members').select('user_id').eq('group_id', groupId),
    db.from('groups').select('name').eq('id', groupId).maybeSingle(),
  ]);
  if (members.error) {
    log.warn('notify.plan_changed.members_failed', { groupId, errorMessage: members.error.message });
    return;
  }
  await notify(
    members.data.map((row) => row.user_id as string),
    'event_changed',
    { groupId, name: (group.data?.name as string | null) ?? null, change: 'plan', detail: title },
    { exclude: actorId },
  );
}

async function listPhotos(groupId: string): Promise<Photo[]> {
  const { data, error } = await getServiceClient()
    .from('event_photos')
    .select('id, uploader_id, storage_path, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`event_photos read failed: ${error.message}`);
  }
  const paths = data.map((row) => row.storage_path as string);
  const [names, urls] = await Promise.all([
    displayNames(data.map((row) => row.uploader_id as string)),
    signedPhotoUrls(paths),
  ]);
  return data.map((row) => ({
    id: row.id as string,
    uploaderId: row.uploader_id as string,
    uploaderName: names.get(row.uploader_id as string) ?? 'Someone',
    storagePath: row.storage_path as string,
    url: urls.get(row.storage_path as string) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

// Batch-sign read URLs for the private bucket. A signing failure (missing object, bucket not created yet) yields
// null for that photo rather than failing the album.
async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  try {
    const signed = await timed('storage.sign', { bucket: PHOTO_BUCKET, count: paths.length }, async () => {
      const { data, error } = await getServiceClient()
        .storage.from(PHOTO_BUCKET)
        .createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
      if (error) throw error;
      return data;
    });
    for (const entry of signed) {
      if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
    }
  } catch {
    // Logged by timed(); the album renders placeholders.
  }
  return urls;
}

// Shared real-mode path for both exchange-request and exchange-accept — the server-side action is
// identical either way ("mark my side of this pair accepted"); the two routes exist for clearer
// client copy ("ask" vs "accept"), not different server behavior.
async function requestOrAcceptExchange(
  groupId: string,
  userId: string,
  peerId: string,
): Promise<ExchangeResponse> {
  // Both people must be in this group: otherwise any member could open an exchange with anyone.
  const rows = await memberRows(groupId, userId);
  if (peerId === userId || !rows.some((row) => row.user_id === peerId)) {
    throw new ApiError(
      404,
      'peer_not_found',
      'That person is not in this group.',
    );
  }
  const db = getServiceClient();
  const [userA, userB] = [userId, peerId].sort() as [string, string];
  const { data: existing, error: readError } = await db
    .from('contact_exchanges')
    .select('a_accepted, b_accepted')
    .eq('group_id', groupId)
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle();
  if (readError) {
    throw new Error(`contact_exchanges read failed: ${readError.message}`);
  }
  const aAccepted = (existing?.a_accepted as boolean | undefined) ?? false;
  const bAccepted = (existing?.b_accepted as boolean | undefined) ?? false;
  const next = {
    group_id: groupId,
    user_a: userA,
    user_b: userB,
    a_accepted: userId === userA ? true : aAccepted,
    b_accepted: userId === userB ? true : bAccepted,
  };
  const { error: writeError } = await db
    .from('contact_exchanges')
    .upsert(next, { onConflict: 'group_id,user_a,user_b' });
  if (writeError) {
    throw new Error(`contact_exchanges write failed: ${writeError.message}`);
  }
  const bothAccepted = next.a_accepted && next.b_accepted;
  // wave 5: the peer hears about it — once, on the tap that flipped the caller's side (a re-tap is silent).
  const flipped = !(userId === userA ? aAccepted : bAccepted);
  if (flipped) {
    const callerName = (await displayNames([userId])).get(userId) ?? 'Someone';
    await notify([peerId], bothAccepted ? 'exchange_accepted' : 'exchange_requested', {
      groupId,
      peerId: userId,
      peerName: callerName,
    });
  }
  let peerPhone: string | null = null;
  if (bothAccepted) {
    const { data: peerProfile } = await db
      .from('profiles')
      .select('phone')
      .eq('id', peerId)
      .maybeSingle();
    peerPhone = (peerProfile?.phone as string | null) ?? null;
  }
  return {
    requesterAccepted: userId === userA ? next.a_accepted : next.b_accepted,
    peerAccepted: userId === userA ? next.b_accepted : next.a_accepted,
    peerPhone,
  };
}
