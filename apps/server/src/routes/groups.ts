// Owner: Pranav (Groups, Activities & Chat) — group view + activity; Christian owns the server framework.
import { Hono } from 'hono';
import type {
  Activity,
  GenerateActivityInput,
  GroupResponse,
} from '@degrees/shared';
import { generateActivity } from '../ai/generateActivity.js';
import { env } from '../config/env.js';
import {
  activityInput,
  groupNotFound,
  loadGroup,
  saveActivity,
} from '../lib/groups.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID, groupFixture, people } from '../mocks/fixtures.js';

const mockActivityInput = {
  members: people.slice(0, 4).map(({ displayName, interests }) => ({
    displayName,
    interests: [...interests],
  })),
  constraints: {
    maxCostCents: 3500,
    maxTravelMi: 8,
    city: 'Atlanta',
    lat: 33.7756,
    lng: -84.3963,
  },
} satisfies GenerateActivityInput;

// Mock mode keeps the latest generated plan in memory so GET reflects POST.
let mockActivity: Activity | null = groupFixture.activity;

function assertMockGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID) {
    throw groupNotFound();
  }
}

export const groupRoutes = new Hono<AppEnv>()
  .get('/groups/:id', async (context) => {
    const groupId = context.req.param('id');
    if (env.mockMode) {
      assertMockGroup(groupId);
      const response = {
        ...groupFixture,
        activity: mockActivity,
      } satisfies GroupResponse;
      return context.json(response);
    }
    const response = await loadGroup(groupId, context.get('userId'));
    return context.json(response);
  })
  .post('/groups/:id/activity', async (context) => {
    const groupId = context.req.param('id');
    if (env.mockMode) {
      assertMockGroup(groupId);
      mockActivity = await generateActivity(mockActivityInput);
      const response: Activity = mockActivity;
      return context.json(response);
    }
    const input = await activityInput(groupId, context.get('userId'));
    const response: Activity = await generateActivity(input);
    await saveActivity(groupId, response);
    return context.json(response);
  });
