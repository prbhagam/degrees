// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import { feedbackRequestSchema, type FeedbackResponse } from '@degrees/shared';
import { analyzeFeedback } from '../ai/analyzeFeedback.js';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID } from '../mocks/fixtures.js';

export const feedbackRoutes = new Hono<AppEnv>().post(
  '/groups/:id/feedback',
  async (context) => {
    if (context.req.param('id') !== DEMO_GROUP_ID) {
      throw new ApiError(404, 'group_not_found', 'The requested group does not exist.');
    }
    const request = await validateJson(context, feedbackRequestSchema);
    const analysis = request.freeText
      ? await analyzeFeedback(request.freeText)
      : undefined;
    const response = {
      ok: true,
      derivedTags: analysis?.tags.map(({ label }) => label) ?? [],
    } satisfies FeedbackResponse;
    return context.json(response);
  },
);
