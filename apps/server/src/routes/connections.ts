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
  .get('/graph/me', async (context) => {
    if (env.mockMode) {
      const response: GraphResponse = graphFixture;
      return context.json(response);
    }
    const { reach, edges } = await exploreFrom(context.get('userId'));
    const names = await displayNames(reach.keys());
    const response = {
      nodes: [...reach].map(([id, { degree }]) => ({
        id,
        displayName: names.get(id) ?? 'Someone',
        degree,
      })),
      // Edges to people past the depth cap would dangle in the view, so keep only edges between known nodes.
      edges: edges.filter(({ a, b }) => reach.has(a) && reach.has(b)),
    } satisfies GraphResponse;
    return context.json(response);
  });
