// Owner: Christian (Server & Infra) — Added Sep 26.
// Mock-mode only. In real mode the client reads `notifications` directly from Supabase (RLS
// `user_id = auth.uid()`) and subscribes via Realtime, the same pattern as chat messages — see
// docs/API-CONTRACTS.md "Reads that bypass the server". This route exists so the screen still
// works in dev without a real Supabase project.
import { Hono } from 'hono';
import type { NotificationsResponse } from '@degrees/shared';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { notificationsFixture } from '../mocks/fixtures.js';

export const notificationRoutes = new Hono<AppEnv>().get(
  '/notifications',
  (context) => {
    if (!env.mockMode) {
      throw new ApiError(
        404,
        'not_found',
        'Real mode reads notifications directly from Supabase; this route is mock-only.',
      );
    }
    const response: NotificationsResponse = notificationsFixture;
    return context.json(response);
  },
);
