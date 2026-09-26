// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { JoinEventResponse } from '@degrees/shared';
import { ApiError } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_EVENT_CODE, eventFixture } from '../mocks/fixtures.js';

const mockEventJoins = new Set<string>();

export const eventRoutes = new Hono<AppEnv>().post(
  '/events/:roomCode/join',
  (context) => {
    if (context.req.param('roomCode').toUpperCase() !== DEMO_EVENT_CODE) {
      throw new ApiError(404, 'event_not_found', 'No event uses that room code.');
    }
    mockEventJoins.add(`${eventFixture.eventId}:${context.get('userId')}`);
    const response: JoinEventResponse = eventFixture;
    return context.json(response);
  },
);
