// Owner: Pranav (Groups, Activities & Chat) — edge creation + graph; Christian owns the server framework.
import { Hono } from 'hono';
import {
  contactExchangeRequestSchema,
  createConnectionRequestSchema,
  type ContactState,
  type CreateConnectionResponse,
  type ExchangeResponse,
  type GraphResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { exploreFrom, profileBasics } from '../lib/graph.js';
import type { AppEnv } from '../middleware/auth.js';
import { graphFixture } from '../mocks/fixtures.js';

const mockEdges = new Set<string>();
// Mock-mode contact exchange state, keyed on the sorted pair (wave 3).
const mockContacts = new Map<string, { a: string; b: string; aAccepted: boolean; bAccepted: boolean }>();
const NO_CONTACT: ContactState = { requested: false, peerAccepted: false, peerPhone: null };

// Deterministic fake phone for the fixture people (they carry none).
function mockPhoneFor(id: string): string {
  const digits = id.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `+1404555${digits}`;
}

function mockContactState(viewerId: string, peerId: string): ContactState {
  const [a, b] = [viewerId, peerId].sort() as [string, string];
  const state = mockContacts.get(`${a}:${b}`);
  if (!state) return NO_CONTACT;
  const requested = viewerId === a ? state.aAccepted : state.bAccepted;
  const peerAccepted = viewerId === a ? state.bAccepted : state.aAccepted;
  return { requested, peerAccepted, peerPhone: requested && peerAccepted ? mockPhoneFor(peerId) : null };
}

export const connectionRoutes = new Hono<AppEnv>()
  .post('/connections', async (context) => {
    const request = await validateJson(context, createConnectionRequestSchema);
    const userId = context.get('userId');
    if (request.peerId === userId) {
      throw new ApiError(
        400,
        'invalid_request',
        'You cannot connect with yourself.',
      );
    }
    // Canonical ordering: each edge is stored once with user_a < user_b.
    const [userA, userB] = [userId, request.peerId].sort() as [string, string];

    if (env.mockMode) {
      const edgeKey = `${userA}:${userB}`;
      const edgeCreated = !mockEdges.has(edgeKey);
      mockEdges.add(edgeKey);
      const response = {
        ok: true,
        edgeCreated,
      } satisfies CreateConnectionResponse;
      return context.json(response);
    }

    const db = getServiceClient();
    const { data: peer, error: peerError } = await db
      .from('profiles')
      .select('id')
      .eq('id', request.peerId)
      .maybeSingle();
    if (peerError) {
      throw new Error(`profiles read failed: ${peerError.message}`);
    }
    if (!peer) {
      throw new ApiError(
        404,
        'user_not_found',
        'That person does not have a Degrees account.',
      );
    }

    // ON CONFLICT DO NOTHING RETURNING: a row comes back only when the edge is new, which keeps re-scans harmless.
    const { data: inserted, error } = await db
      .from('connections')
      .upsert(
        {
          user_a: userA,
          user_b: userB,
          met_context: request.context,
          event_id: request.eventId ?? null,
        },
        { onConflict: 'user_a,user_b', ignoreDuplicates: true },
      )
      .select('user_a');
    if (error) {
      if (error.code === '23503') {
        throw new ApiError(404, 'event_not_found', 'No event has that id.');
      }
      throw new Error(`connections insert failed: ${error.message}`);
    }
    const response = {
      ok: true,
      edgeCreated: inserted.length > 0,
    } satisfies CreateConnectionResponse;
    return context.json(response);
  })
  // CHANGED Sep 26: this only ever returns 1st-degree connections (people actually met), plus
  // `mutualEdges` between two of the viewer's own connections who also know each other. It is not
  // a window into the wider matching pool — that stays server-side, used only by /match/run.
  .get('/graph/me', async (context) => {
    if (env.mockMode) {
      const viewerId = context.get('userId');
      const response: GraphResponse = {
        ...graphFixture,
        nodes: graphFixture.nodes.map((node) => ({ ...node, contact: mockContactState(viewerId, node.id) })),
      };
      return context.json(response);
    }
    const viewerId = context.get('userId');
    const db = getServiceClient();
    const { reach, edges } = await exploreFrom(viewerId, 1);
    const neighborIds = [...reach.keys()].filter((id) => id !== viewerId);
    const basics = await profileBasics(reach.keys());

    const { data: viewerConnections, error: connError } = await db
      .from('connections')
      .select('user_a, user_b, event_id')
      .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`);
    if (connError) {
      throw new Error(`connections read failed: ${connError.message}`);
    }
    const eventIdByNeighbor = new Map<string, string>();
    for (const row of viewerConnections) {
      const other = row.user_a === viewerId ? row.user_b : row.user_a;
      if (row.event_id) eventIdByNeighbor.set(other as string, row.event_id as string);
    }
    const eventIds = [...new Set(eventIdByNeighbor.values())];
    const eventNames = new Map<string, string>();
    if (eventIds.length > 0) {
      const { data: eventRows, error: eventError } = await db
        .from('events')
        .select('id, name')
        .in('id', eventIds);
      if (eventError) {
        throw new Error(`events read failed: ${eventError.message}`);
      }
      for (const row of eventRows) {
        if (row.name) eventNames.set(row.id as string, row.name as string);
      }
    }

    const contacts = await contactStates(viewerId, neighborIds);

    let mutualRows: { user_a: string; user_b: string }[] = [];
    if (neighborIds.length > 1) {
      const { data, error: mutualError } = await db
        .from('connections')
        .select('user_a, user_b')
        .in('user_a', neighborIds)
        .in('user_b', neighborIds);
      if (mutualError) {
        throw new Error(`connections read failed: ${mutualError.message}`);
      }
      mutualRows = data as { user_a: string; user_b: string }[];
    }

    const response = {
      nodes: neighborIds.map((id) => ({
        id,
        displayName: basics.get(id)?.displayName ?? 'Someone',
        bio: basics.get(id)?.bio ?? null,
        photoUrl: basics.get(id)?.photoUrl ?? null,
        metAt: eventNames.get(eventIdByNeighbor.get(id) ?? '') ?? null,
        contact: contacts.get(id) ?? NO_CONTACT,
      })),
      edges: edges
        .filter(({ a, b }) => reach.has(a) && reach.has(b))
        .map(({ a, b }) => ({ a, b })),
      mutualEdges: mutualRows.map(({ user_a, user_b }) => ({ a: user_a, b: user_b })),
    } satisfies GraphResponse;
    return context.json(response);
  })
  // Added Sep 26 (wave 3): mutual-consent phone exchange with someone in your circle. Moved out of the per-group
  // feedback screen so it lives where the person does (Your Circle) and persists: the same call is both "ask" and
  // "accept" — it marks the caller's side yes, and the number comes back once both sides have said yes.
  .post('/graph/exchange', async (context) => {
    const viewerId = context.get('userId');
    const { peerId } = await validateJson(context, contactExchangeRequestSchema);
    if (peerId === viewerId) {
      throw new ApiError(400, 'invalid_request', 'You cannot exchange numbers with yourself.');
    }
    const [userA, userB] = [viewerId, peerId].sort() as [string, string];
    if (env.mockMode) {
      if (!graphFixture.nodes.some((node) => node.id === peerId)) {
        throw new ApiError(404, 'peer_not_found', 'That person is not in your circle.');
      }
      const key = `${userA}:${userB}`;
      const state = mockContacts.get(key) ?? { a: userA, b: userB, aAccepted: false, bAccepted: false };
      if (viewerId === userA) state.aAccepted = true;
      else state.bAccepted = true;
      mockContacts.set(key, state);
      const contact = mockContactState(viewerId, peerId);
      const response = {
        requesterAccepted: contact.requested,
        peerAccepted: contact.peerAccepted,
        peerPhone: contact.peerPhone,
      } satisfies ExchangeResponse;
      return context.json(response);
    }

    const db = getServiceClient();
    // Only people who've actually met (a connections edge) can exchange — Your Circle is the only place this is offered.
    const { data: edge, error: edgeError } = await db
      .from('connections')
      .select('user_a')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();
    if (edgeError) {
      throw new Error(`connections read failed: ${edgeError.message}`);
    }
    if (!edge) {
      throw new ApiError(404, 'peer_not_found', 'That person is not in your circle yet.');
    }
    const { data: existing, error: readError } = await db
      .from('connection_contacts')
      .select('a_accepted, b_accepted')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();
    if (readError) {
      throw new Error(`connection_contacts read failed: ${readError.message}`);
    }
    const next = {
      user_a: userA,
      user_b: userB,
      a_accepted: viewerId === userA ? true : ((existing?.a_accepted as boolean | undefined) ?? false),
      b_accepted: viewerId === userB ? true : ((existing?.b_accepted as boolean | undefined) ?? false),
      updated_at: new Date().toISOString(),
    };
    const { error: writeError } = await db
      .from('connection_contacts')
      .upsert(next, { onConflict: 'user_a,user_b' });
    if (writeError) {
      throw new Error(`connection_contacts write failed: ${writeError.message}`);
    }
    const both = next.a_accepted && next.b_accepted;
    let peerPhone: string | null = null;
    if (both) {
      const { data: peerProfile } = await db.from('profiles').select('phone').eq('id', peerId).maybeSingle();
      peerPhone = (peerProfile?.phone as string | null) ?? null;
    }
    const response = {
      requesterAccepted: viewerId === userA ? next.a_accepted : next.b_accepted,
      peerAccepted: viewerId === userA ? next.b_accepted : next.a_accepted,
      peerPhone,
    } satisfies ExchangeResponse;
    return context.json(response);
  });

// The viewer's contact-exchange state with each neighbour, phone included only where both sides agreed.
async function contactStates(viewerId: string, neighborIds: string[]): Promise<Map<string, ContactState>> {
  const states = new Map<string, ContactState>();
  if (neighborIds.length === 0) return states;
  const db = getServiceClient();
  const { data, error } = await db
    .from('connection_contacts')
    .select('user_a, user_b, a_accepted, b_accepted')
    .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`);
  if (error) {
    throw new Error(`connection_contacts read failed: ${error.message}`);
  }
  const wanted = new Set(neighborIds);
  const revealed: string[] = [];
  for (const row of data) {
    const isA = row.user_a === viewerId;
    const other = (isA ? row.user_b : row.user_a) as string;
    if (!wanted.has(other)) continue;
    const requested = Boolean(isA ? row.a_accepted : row.b_accepted);
    const peerAccepted = Boolean(isA ? row.b_accepted : row.a_accepted);
    states.set(other, { requested, peerAccepted, peerPhone: null });
    if (requested && peerAccepted) revealed.push(other);
  }
  if (revealed.length > 0) {
    const { data: phones, error: phoneError } = await db.from('profiles').select('id, phone').in('id', revealed);
    if (phoneError) {
      throw new Error(`profiles read failed: ${phoneError.message}`);
    }
    for (const row of phones) {
      const state = states.get(row.id as string);
      if (state) state.peerPhone = (row.phone as string | null) ?? null;
    }
  }
  return states;
}
