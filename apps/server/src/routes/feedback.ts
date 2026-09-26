// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import { feedbackRequestSchema, type FeedbackResponse } from '@degrees/shared';
import { analyzeFeedback } from '../ai/analyzeFeedback.js';
import { embedProfile } from '../ai/embedProfile.js';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID } from '../mocks/fixtures.js';

export const feedbackRoutes = new Hono<AppEnv>().post(
  '/groups/:id/feedback',
  async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');

    if (env.mockMode) {
      if (groupId !== DEMO_GROUP_ID) {
        throw new ApiError(
          404,
          'group_not_found',
          'The requested group does not exist.',
        );
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
    }

    const request = await validateJson(context, feedbackRequestSchema);
    const supabase = getServiceClient();

    const analysis = request.freeText
      ? await analyzeFeedback(request.freeText)
      : undefined;

    const { error } = await supabase.from('group_feedback').insert({
      group_id: groupId,
      author_id: userId,
      rating: request.rating,
      peer_feedback: request.peers,
      free_text: request.freeText ?? null,
      sentiment: analysis?.sentiment ?? null,
    });

    if (error) {
      throw new ApiError(500, 'save_failed', 'Failed to save feedback.');
    }

    if (analysis && analysis.tags.length > 0) {
      const rows = analysis.tags.map((t) => ({
        user_id: userId,
        label: t.label,
        kind: 'derived' as const,
      }));
      await supabase.from('profile_tags').insert(rows);
      await embedProfile(userId);
    }

    const response = {
      ok: true,
      derivedTags: analysis?.tags.map(({ label }) => label) ?? [],
    } satisfies FeedbackResponse;

    return context.json(response);
  },
);
