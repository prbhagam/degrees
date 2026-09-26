// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import {
  updatePreferencesRequestSchema,
  type OkResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';

export const preferencesRoutes = new Hono<AppEnv>().put(
  '/preferences',
  async (context) => {
    const body = await validateJson(context, updatePreferencesRequestSchema);
    const userId = context.get('userId');

    if (!env.mockMode) {
      const supabase = getServiceClient();
      const { error } = await supabase.from('preferences').upsert({
        user_id: userId,
        cost_min_cents: body.costMinCents,
        cost_max_cents: body.costMaxCents,
        max_travel_mi: body.maxTravelMi,
        frequency: body.frequency,
        group_size_min: body.groupSizeMin,
        group_size_max: body.groupSizeMax,
        max_degrees: body.maxDegrees,
      });

      if (error) {
        throw new ApiError(
          500,
          'update_failed',
          'Failed to update preferences.',
        );
      }
    }

    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  },
);
