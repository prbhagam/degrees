// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import { z } from 'zod';
import {
  sendMessageRequestSchema,
  type MessagesResponse,
  type SendMessageResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID, messagesFixture } from '../mocks/fixtures.js';

let nextMessageId = 5000;

function assertKnownGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID) {
    throw new ApiError(
      404,
      'group_not_found',
      'The requested group does not exist.',
    );
  }
}

export const messageRoutes = new Hono<AppEnv>()
  .get('/groups/:id/messages', async (context) => {
    const groupId = context.req.param('id');
    const since = context.req.query('since');

    if (
      since !== undefined &&
      !z.iso.datetime({ offset: true }).safeParse(since).success
    ) {
      throw new ApiError(
        400,
        'invalid_request',
        'since must be an ISO 8601 datetime.',
      );
    }

    if (env.mockMode) {
      assertKnownGroup(groupId);
      const response = {
        messages: since
          ? messagesFixture.messages.filter(({ createdAt }) => createdAt > since)
          : messagesFixture.messages,
      } satisfies MessagesResponse;
      return context.json(response);
    }

    const supabase = getServiceClient();

    let query = supabase
      .from('messages')
      .select('id, sender_id, body, created_at, profiles(display_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (since) {
      query = query.gt('created_at', since);
    }

    const { data, error } = await query;

    if (error) {
      throw new ApiError(500, 'query_failed', 'Failed to retrieve messages.');
    }

    const messages = (data ?? []).map((row) => {
      const profile = row.profiles as unknown as { display_name: string | null } | null;
      return {
        id: String(row.id),
        senderId: row.sender_id,
        senderName: profile?.display_name ?? 'Anonymous',
        body: row.body,
        createdAt: row.created_at,
      };
    });

    const response: MessagesResponse = { messages };
    return context.json(response);
  })
  .post('/groups/:id/messages', async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');
    const body = await validateJson(context, sendMessageRequestSchema);

    if (env.mockMode) {
      assertKnownGroup(groupId);
      const response = {
        id: String(nextMessageId++),
        createdAt: new Date().toISOString(),
      } satisfies SendMessageResponse;
      return context.json(response);
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('messages')
      .insert({
        group_id: groupId,
        sender_id: userId,
        body: body.body,
      })
      .select('id, created_at')
      .single();

    if (error || !data) {
      throw new ApiError(500, 'send_failed', 'Failed to send message.');
    }

    const response: SendMessageResponse = {
      id: String(data.id),
      createdAt: data.created_at,
    };

    return context.json(response);
  });
