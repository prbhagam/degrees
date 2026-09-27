// Owner: Christian (Server & Infra) — Added Sep 26.
// GET /notifications is mock-mode only. In real mode the client reads `notifications` directly from Supabase
// (RLS `user_id = auth.uid()`) and subscribes via Realtime, the same pattern as chat messages — see
// docs/API-CONTRACTS.md "Reads that bypass the server". The route exists so the screen still works in dev
// without a real Supabase project.
// CHANGED Sep 26 (wave 5, Sahith): rows are actually written now (lib/notify.ts); this adds mark-all-read
// (POST /notifications/read — the client has no update grant) and the per-kind settings (GET/PUT
// /notifications/settings, stored on profiles.notification_settings).
import { Hono } from 'hono';
import {
  updateNotificationSettingsRequestSchema,
  type NotificationSettingsResponse,
  type NotificationsResponse,
  type OkResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { markAllRead, mockNotifications, saveSettings, settingsFor } from '../lib/notify.js';
import { log } from '../lib/log.js';
import type { AppEnv } from '../middleware/auth.js';
import { notificationsFixture } from '../mocks/fixtures.js';

export const notificationRoutes = new Hono<AppEnv>()
  .get('/notifications', (context) => {
    if (!env.mockMode) {
      throw new ApiError(
        404,
        'not_found',
        'Real mode reads notifications directly from Supabase; this route is mock-only.',
      );
    }
    const response: NotificationsResponse = {
      notifications: [...mockNotifications, ...notificationsFixture.notifications],
    };
    return context.json(response);
  })
  .post('/notifications/read', async (context) => {
    const userId = context.get('userId');
    await markAllRead(userId);
    log.debug('notifications.read_all', { userId });
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  })
  .get('/notifications/settings', async (context) => {
    const response = { settings: await settingsFor(context.get('userId')) } satisfies NotificationSettingsResponse;
    return context.json(response);
  })
  .put('/notifications/settings', async (context) => {
    const userId = context.get('userId');
    const patch = await validateJson(context, updateNotificationSettingsRequestSchema);
    const settings = await saveSettings(userId, patch);
    log.info('notifications.settings_saved', { userId, settings });
    const response = { settings } satisfies NotificationSettingsResponse;
    return context.json(response);
  });
