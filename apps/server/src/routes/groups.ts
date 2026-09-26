// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { Activity, GenerateActivityInput, GroupResponse } from '@degrees/shared';
import { generateActivity } from '../ai/generateActivity.js';
import { ApiError } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID, groupFixture, people } from '../mocks/fixtures.js';

function assertKnownGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID) {
    throw new ApiError(404, 'group_not_found', 'The requested group does not exist.');
  }
}

export const groupRoutes = new Hono<AppEnv>()
  .get('/groups/:id', (context) => {
    assertKnownGroup(context.req.param('id'));
    const response: GroupResponse = groupFixture;
    return context.json(response);
  })
  .post('/groups/:id/activity', async (context) => {
    assertKnownGroup(context.req.param('id'));
    const input = {
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
    const response: Activity = await generateActivity(input);
    return context.json(response);
  });
