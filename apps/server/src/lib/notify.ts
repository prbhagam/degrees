// Owner: Christian (Server & Infra) — Added Sep 26 (wave 5, Sahith). The ONE place that writes `notifications`
// rows. Until this wave nothing wrote them (the screen only ever showed the fixture). Every writer calls notify():
// it drops recipients who turned that kind off (profiles.notification_settings, a missing key means on), inserts
// the rows in one call, and never throws — a notification must never fail the request that caused it.
// Mock mode keeps an in-memory list that GET /api/notifications returns ahead of the fixture.
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTING_FOR,
  type Notification,
  type NotificationSettings,
  type NotificationType,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { log } from './log.js';

// Mock-mode feed (newest first) and settings, both process-local.
export const mockNotifications: Notification[] = [];
let mockSerial = 0;
let mockSettings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };

// Unknown or partial JSON merges over the defaults: a key the app hasn't set yet means "on".
export function mergeSettings(raw: unknown): NotificationSettings {
  const settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(settings) as (keyof NotificationSettings)[]) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === 'boolean') settings[key] = value;
    }
  }
  return settings;
}

export function wantsNotification(settings: NotificationSettings, type: NotificationType): boolean {
  const toggle = NOTIFICATION_SETTING_FOR[type];
  return toggle === null || settings[toggle];
}

export async function settingsFor(userId: string): Promise<NotificationSettings> {
  if (env.mockMode) return { ...mockSettings };
  const { data, error } = await getServiceClient()
    .from('profiles')
    .select('notification_settings')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(`profiles read failed: ${error.message}`);
  }
  return mergeSettings(data?.notification_settings);
}

export async function saveSettings(
  userId: string,
  patch: { [K in keyof NotificationSettings]?: boolean | undefined },
): Promise<NotificationSettings> {
  const next = mergeSettings({ ...(await settingsFor(userId)), ...patch });
  if (env.mockMode) {
    mockSettings = next;
    return next;
  }
  const { error } = await getServiceClient()
    .from('profiles')
    .update({ notification_settings: next })
    .eq('id', userId);
  if (error) {
    throw new Error(`profiles update failed: ${error.message}`);
  }
  return next;
}

export async function markAllRead(userId: string): Promise<void> {
  if (env.mockMode) {
    for (const notification of mockNotifications) notification.read = true;
    return;
  }
  const { error } = await getServiceClient()
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) {
    throw new Error(`notifications update failed: ${error.message}`);
  }
}

export async function notify(
  recipientIds: Iterable<string>,
  type: NotificationType,
  payload: Record<string, unknown>,
  options: { exclude?: string | string[] } = {},
): Promise<void> {
  const excluded = new Set(
    options.exclude === undefined ? [] : Array.isArray(options.exclude) ? options.exclude : [options.exclude],
  );
  const recipients = [...new Set(recipientIds)].filter((id) => !excluded.has(id));
  if (recipients.length === 0) return;
  try {
    if (env.mockMode) {
      // Mock mode has one identity (REQUESTER_ID); everything lands in the one feed, newest first.
      if (!wantsNotification(mockSettings, type)) return;
      for (const userId of recipients) {
        mockSerial += 1;
        mockNotifications.unshift({
          id: `mock-n-${mockSerial}`,
          type,
          payload: { ...payload, recipientId: userId },
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      return;
    }
    const db = getServiceClient();
    const { data, error } = await db
      .from('profiles')
      .select('id, notification_settings')
      .in('id', recipients);
    if (error) throw error;
    const wanted = data
      .filter((row) => wantsNotification(mergeSettings(row.notification_settings), type))
      .map((row) => row.id as string);
    if (wanted.length === 0) return;
    const { error: insertError } = await db
      .from('notifications')
      .insert(wanted.map((user_id) => ({ user_id, type, payload })));
    if (insertError) throw insertError;
    log.info('notify.sent', { type, recipients: wanted.length, groupId: payload.groupId ?? null });
  } catch (error) {
    log.warn('notify.failed', {
      type,
      recipients: recipients.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
