// Owner: Pranav (Groups, Activities & Chat) — group chat; Christian owns the server framework.
import { Hono } from 'hono';
import { z } from 'zod';
import {
  sendMessageRequestSchema,
  type Message,
  type MessagesResponse,
  type SendMessageResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { displayNames } from '../lib/graph.js';
import { groupNotFound, memberRows } from '../lib/groups.js';
import type { AppEnv } from '../middleware/auth.js';
import {
  DEMO_GROUP_ID,
  meFixture,
  messagesFixture,
} from '../mocks/fixtures.js';

const MAX_MESSAGE_LENGTH = 2000;
const PAGE_SIZE = 200;

let nextMessageId = 5000;
// Mock mode stores sent messages so GET returns them, like the real table would. Fixture timestamps are
// rebased to just before boot so new messages sort after them and `since` polling picks them up.
const bootTime = Date.now();
const mockMessages: Message[] = messagesFixture.messages.map(
  (message, index, all) => ({
    ...message,
    createdAt: new Date(
      bootTime - (all.length - index) * 3 * 60_000,
    ).toISOString(),
  }),
);

function assertMockGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID) {
    throw groupNotFound();
  }
}

function parseSince(since: string | undefined): string | undefined {
  if (since === undefined) {
    return undefined;
  }
  if (!z.iso.datetime({ offset: true }).safeParse(since).success) {
    throw new ApiError(
      400,
      'invalid_request',
      'since must be an ISO 8601 datetime.',
    );
  }
  return new Date(since).toISOString();
}

export const messageRoutes = new Hono<AppEnv>()
  .get('/groups/:id/messages', async (context) => {
    const groupId = context.req.param('id');
    const since = parseSince(context.req.query('since'));

    if (env.mockMode) {
      assertMockGroup(groupId);
      const response = {
        messages: since
          ? mockMessages.filter(({ createdAt }) => createdAt > since)
          : mockMessages,
      } satisfies MessagesResponse;
      return context.json(response);
    }

    await memberRows(groupId, context.get('userId'));
    let query = getServiceClient()
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (since) {
      query = query.gt('created_at', since);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`messages read failed: ${error.message}`);
    }
    const names = await displayNames(
      data.map((row) => row.sender_id as string),
    );
    const response = {
      // Newest PAGE_SIZE, returned oldest first.
      messages: data.reverse().map((row) => ({
        id: String(row.id),
        senderId: row.sender_id as string,
        senderName: names.get(row.sender_id as string) ?? 'Someone',
        body: row.body as string,
        createdAt: new Date(row.created_at as string).toISOString(),
      })),
    } satisfies MessagesResponse;
    return context.json(response);
  })
  .post('/groups/:id/messages', async (context) => {
    const groupId = context.req.param('id');
    const { body } = await validateJson(context, sendMessageRequestSchema);
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ApiError(
        400,
        'invalid_request',
        `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }
    const userId = context.get('userId');

    if (env.mockMode) {
      assertMockGroup(groupId);
      const message: Message = {
        id: String(nextMessageId++),
        senderId: userId,
        senderName: meFixture.displayName,
        body,
        createdAt: new Date().toISOString(),
      };
      mockMessages.push(message);
      const response = {
        id: message.id,
        createdAt: message.createdAt,
      } satisfies SendMessageResponse;
      return context.json(response);
    }

    await memberRows(groupId, userId);
    const { data, error } = await getServiceClient()
      .from('messages')
      .insert({ group_id: groupId, sender_id: userId, body })
      .select('id, created_at')
      .single();
    if (error) {
      throw new Error(`messages insert failed: ${error.message}`);
    }
    const response = {
      id: String(data.id),
      createdAt: new Date(data.created_at as string).toISOString(),
    } satisfies SendMessageResponse;
    return context.json(response);
  });
