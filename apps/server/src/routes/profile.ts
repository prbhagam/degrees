// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import { updateProfileRequestSchema, type OkResponse } from '@degrees/shared';
import { embedProfile } from '../ai/embedProfile.js';
import { validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';

export const profileRoutes = new Hono<AppEnv>().put(
  '/profile',
  async (context) => {
    await validateJson(context, updateProfileRequestSchema);
    await embedProfile(context.get('userId'));
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  },
);
