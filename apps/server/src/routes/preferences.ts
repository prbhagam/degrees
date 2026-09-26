// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import {
  updatePreferencesRequestSchema,
  type OkResponse,
} from '@degrees/shared';
import { validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';

export const preferencesRoutes = new Hono<AppEnv>().put(
  '/preferences',
  async (context) => {
    await validateJson(context, updatePreferencesRequestSchema);
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  },
);
