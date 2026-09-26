// Owner: Pranav (Groups, Activities & Chat) — group view + activity; Christian owns the server framework.
import { Hono } from 'hono';
import {
  exchangeRequestSchema,
  respondRequestSchema,
  type Activity,
  type ExchangeResponse,
  type GenerateActivityInput,
  type GroupResponse,
  type OkResponse,
  type Photo,
  type PhotosResponse,
} from '@degrees/shared';
import { generateActivity } from '../ai/generateActivity.js';
import { env } from '../config/env.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { displayNames } from '../lib/graph.js';
import {
  activityInput,
  groupNotFound,
  loadGroup,
  saveActivity,
} from '../lib/groups.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID, groupFixture, people } from '../mocks/fixtures.js';
import { getServiceClient } from '../db/supabase.js';

const mockActivityInput = {
  members: people.slice(0, 4).map(({ displayName, interests }) => ({
    displayName,
    interests: [...interests],
  })),
  constraints: {
    maxCostCents: 3500,
    maxTravelMi: 8,
    city: 'Atlanta',
    lat: 33.7756,
    lng: -84.3963,
  },
} satisfies GenerateActivityInput;

// Mock mode keeps the latest generated plan in memory so GET reflects POST.
let mockActivity: Activity | null = groupFixture.activity;
let mockCompletedAt: string | null = null;
let mockStatus: GroupResponse['status'] = groupFixture.status;
const mockPhotos: Photo[] = [];

function assertMockGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID) {
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

function setMockAcceptance(groupId: string, userId: string, peerId: string): ExchangeState {
  const [a, b] = [userId, peerId].sort() as [string, string];
  const key = exchangeKey(groupId, userId, peerId);
  const existing = mockExchanges.get(key) ?? { a, b, aAccepted: false, bAccepted: false };
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

function exchangeResponseFor(state: ExchangeState, viewerId: string): ExchangeResponse {
  const viewerAccepted = viewerId === state.a ? state.aAccepted : state.bAccepted;
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
        completedAt: mockCompletedAt,
      } satisfies GroupResponse;
      return context.json(response);
    }
    const response = await loadGroup(groupId, context.get('userId'));
    return context.json(response);
  })
  // Added Sep 26: a proposed group previously had no way to say no.
  .post('/groups/:id/respond', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const { accept } = await validateJson(context, respondRequestSchema);
    if (env.mockMode) {
      assertMockGroup(groupId);
      if (accept) mockStatus = 'confirmed';
      const response = { ok: true } satisfies OkResponse;
      return context.json(response);
    }
    const db = getServiceClient();
    if (accept) {
      const { error } = await db
        .from('groups')
        .update({ status: 'confirmed' })
        .eq('id', groupId)
        .eq('status', 'proposed');
      if (error) {
        throw new ApiError(500, 'update_failed', 'Failed to accept the hangout.');
      }
    } else {
      // Decline removes only the caller, not the group — others may still want it.
      const { error } = await db
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) {
        throw new ApiError(500, 'update_failed', 'Failed to decline the hangout.');
      }
    }
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  })
  .post('/groups/:id/activity', async (context) => {
    const groupId = context.req.param('id');
    if (env.mockMode) {
      assertMockGroup(groupId);
      mockActivity = await generateActivity(mockActivityInput);
      const response: Activity = mockActivity;
      return context.json(response);
    }
    const input = await activityInput(groupId, context.get('userId'));
    const response: Activity = await generateActivity(input);
    await saveActivity(groupId, response);
    return context.json(response);
  })
  .post('/groups/:id/complete', async (context) => {
    const groupId = context.req.param('id');
    if (env.mockMode) {
      assertMockGroup(groupId);
      mockCompletedAt = new Date().toISOString();
      const response = { ok: true } satisfies OkResponse;
      return context.json(response);
    }
    const db = getServiceClient();
    const { error } = await db
      .from('groups')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', groupId);
    if (error) {
      throw new ApiError(500, 'update_failed', 'Failed to mark the hangout done.');
    }
    // Attending a hangout together is how an edge forms (PRD: "an edge forms when two people meet
    // in person") — so completing the group connects every pair of confirmed members, revealing
    // them to each other from here on, instead of leaving that to a separate QR scan nobody does.
    const { data: memberRows, error: memberError } = await db
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    if (memberError) {
      throw new Error(`group_members read failed: ${memberError.message}`);
    }
    const ids = memberRows.map((row) => row.user_id as string);
    const pairs = ids.flatMap((a, i) =>
      ids.slice(i + 1).map((b) => [a, b].sort() as [string, string]),
    );
    if (pairs.length > 0) {
      const { error: connectError } = await db.from('connections').upsert(
        pairs.map(([userA, userB]) => ({
          user_a: userA,
          user_b: userB,
          met_context: 'group' as const,
        })),
        { onConflict: 'user_a,user_b', ignoreDuplicates: true },
      );
      if (connectError) {
        throw new Error(`connections insert failed: ${connectError.message}`);
      }
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
    const db = getServiceClient();
    const { data, error } = await db
      .from('event_photos')
      .select('id, uploader_id, storage_path, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`event_photos read failed: ${error.message}`);
    }
    const uploaderIds = data.map((row) => row.uploader_id as string);
    const names = await displayNames(uploaderIds);
    const response = {
      photos: data.map((row) => ({
        id: row.id as string,
        uploaderId: row.uploader_id as string,
        uploaderName: names.get(row.uploader_id as string) ?? 'Someone',
        storagePath: row.storage_path as string,
        createdAt: row.created_at as string,
      })),
    } satisfies PhotosResponse;
    return context.json(response);
  })
  .post('/groups/:id/photos', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const body = (await context.req.json()) as { storagePath?: string };
    if (!body.storagePath) {
      throw new ApiError(400, 'invalid_request', 'storagePath is required.');
    }
    if (env.mockMode) {
      assertMockGroup(groupId);
      const photo: Photo = {
        id: `mock-photo-${mockPhotos.length + 1}`,
        uploaderId: userId,
        uploaderName: 'You',
        storagePath: body.storagePath,
        createdAt: new Date().toISOString(),
      };
      mockPhotos.push(photo);
      const response = { photos: mockPhotos } satisfies PhotosResponse;
      return context.json(response);
    }
    const db = getServiceClient();
    const { error } = await db.from('event_photos').insert({
      group_id: groupId,
      uploader_id: userId,
      storage_path: body.storagePath,
    });
    if (error) {
      throw new ApiError(500, 'save_failed', 'Failed to save the photo.');
    }
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  });

// Shared real-mode path for both exchange-request and exchange-accept — the server-side action is
// identical either way ("mark my side of this pair accepted"); the two routes exist for clearer
// client copy ("ask" vs "accept"), not different server behavior.
async function requestOrAcceptExchange(
  groupId: string,
  userId: string,
  peerId: string,
): Promise<ExchangeResponse> {
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
