// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import { z } from 'zod';
import {
  sendMessageRequestSchema,
  type MessagesResponse,
  type SendMessageResponse,
} from '@degrees/shared';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID, messagesFixture } from '../mocks/fixtures.js';

let nextMessageId = 5000;

function assertKnownGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID) {
    throw new ApiError(404, 'group_not_found', 'The requested group does not exist.');
  }
}

export const messageRoutes = new Hono<AppEnv>()
  .get('/groups/:id/messages', (context) => {
    assertKnownGroup(context.req.param('id'));
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
    const response = {
      messages: since
        ? messagesFixture.messages.filter(({ createdAt }) => createdAt > since)
        : messagesFixture.messages,
    } satisfies MessagesResponse;
    return context.json(response);
  })
  .post('/groups/:id/messages', async (context) => {
    assertKnownGroup(context.req.param('id'));
    await validateJson(context, sendMessageRequestSchema);
    const response = {
      id: String(nextMessageId++),
      createdAt: new Date().toISOString(),
    } satisfies SendMessageResponse;
    return context.json(response);
  });
