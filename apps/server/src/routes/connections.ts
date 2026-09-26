// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import {
  createConnectionRequestSchema,
  type CreateConnectionResponse,
  type GraphResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { graphFixture } from '../mocks/fixtures.js';

const mockEdges = new Set<string>();

export const connectionRoutes = new Hono<AppEnv>()
  .post('/connections', async (context) => {
    const request = await validateJson(context, createConnectionRequestSchema);
    const userId = context.get('userId');

    if (env.mockMode) {
      const edgeKey = [userId, request.peerId].sort().join(':');
      const edgeCreated = !mockEdges.has(edgeKey);
      mockEdges.add(edgeKey);
      const response = {
        ok: true,
        edgeCreated,
      } satisfies CreateConnectionResponse;
      return context.json(response);
    }

    const [userA, userB] = [userId, request.peerId].sort();
    const supabase = getServiceClient();

    const { data: existing } = await supabase
      .from('connections')
      .select('user_a')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();

    const edgeCreated = !existing;

    const { error } = await supabase.from('connections').upsert(
      {
        user_a: userA,
        user_b: userB,
        met_context: request.context,
        event_id: request.eventId ?? null,
      },
      { onConflict: 'user_a,user_b' },
    );

    if (error) {
      throw new ApiError(500, 'connection_failed', 'Failed to save connection.');
    }

    const response = {
      ok: true,
      edgeCreated,
    } satisfies CreateConnectionResponse;
    return context.json(response);
  })
  .get('/graph/me', async (context) => {
    if (env.mockMode) {
      const response: GraphResponse = graphFixture;
      return context.json(response);
    }

    const userId = context.get('userId');
    const supabase = getServiceClient();

    const { data: edges, error } = await supabase
      .from('connections')
      .select('user_a, user_b')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    if (error) {
      throw new ApiError(500, 'query_failed', 'Failed to retrieve graph.');
    }

    const neighborIds = new Set<string>();
    (edges ?? []).forEach(({ user_a, user_b }) => {
      neighborIds.add(user_a);
      neighborIds.add(user_b);
    });

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', Array.from(neighborIds));

    const nodes = (profiles ?? []).map((p) => ({
      id: p.id,
      displayName: p.display_name ?? 'Anonymous',
      degree: p.id === userId ? 0 : 1,
    }));

    const response: GraphResponse = {
      nodes,
      edges: (edges ?? []).map((e) => ({ a: e.user_a, b: e.user_b })),
    };

    return context.json(response);
  });
