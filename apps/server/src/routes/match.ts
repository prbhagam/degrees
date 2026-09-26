// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { MatchRunResponse } from '@degrees/shared';
import type { AppEnv } from '../middleware/auth.js';
import { matchFixture } from '../mocks/fixtures.js';

export const matchRoutes = new Hono<AppEnv>().post('/match/run', (context) => {
  // TODO(Sahith/Christian): replace with traverse → narrow → formGroups once the boundary is agreed at H0.
  const response: MatchRunResponse = matchFixture;
  return context.json(response);
});
