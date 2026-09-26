// Owner: Pranav (Groups, Activities & Chat) — edge creation + graph; Christian owns the server framework.
import { Hono } from 'hono';
import {
  createConnectionRequestSchema,
  type CreateConnectionResponse,
  type GraphResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { displayNames, exploreFrom } from '../lib/graph.js';
import type { AppEnv } from '../middleware/auth.js';
import { graphFixture } from '../mocks/fixtures.js';

const mockEdges = new Set<string>();

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
      const response: GraphResponse = graphFixture;
      return context.json(response);
    }
    const viewerId = context.get('userId');
    const db = getServiceClient();
    const { reach, edges } = await exploreFrom(viewerId, 1);
    const neighborIds = [...reach.keys()].filter((id) => id !== viewerId);
    const names = await displayNames(reach.keys());

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
        displayName: names.get(id) ?? 'Someone',
        metAt: eventNames.get(eventIdByNeighbor.get(id) ?? '') ?? null,
      })),
      edges: edges
        .filter(({ a, b }) => reach.has(a) && reach.has(b))
        .map(({ a, b }) => ({ a, b })),
      mutualEdges: mutualRows.map(({ user_a, user_b }) => ({ a: user_a, b: user_b })),
    } satisfies GraphResponse;
    return context.json(response);
  });
