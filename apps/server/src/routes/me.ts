// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { MeResponse } from '@degrees/shared';
import type { AppEnv } from '../middleware/auth.js';
import { meFixture } from '../mocks/fixtures.js';

export const meRoutes = new Hono<AppEnv>().get('/me', (context) => {
  const response: MeResponse = meFixture;
  return context.json(response);
});
