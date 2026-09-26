// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import {
  createConnectionRequestSchema,
  type CreateConnectionResponse,
  type GraphResponse,
} from '@degrees/shared';
import { validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { graphFixture } from '../mocks/fixtures.js';

const mockEdges = new Set<string>();

export const connectionRoutes = new Hono<AppEnv>()
  .post('/connections', async (context) => {
    const request = await validateJson(context, createConnectionRequestSchema);
    // Real writes must sort the pair before insert so user_a < user_b; the endpoint is idempotent.
    const edgeKey = [context.get('userId'), request.peerId].sort().join(':');
    const edgeCreated = !mockEdges.has(edgeKey);
    mockEdges.add(edgeKey);
    const response = {
      ok: true,
      edgeCreated,
    } satisfies CreateConnectionResponse;
    return context.json(response);
  })
  .get('/graph/me', (context) => {
    const response: GraphResponse = graphFixture;
    return context.json(response);
  });
