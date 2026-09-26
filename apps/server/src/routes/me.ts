// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { MeResponse, TagKind } from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { meFixture } from '../mocks/fixtures.js';

export const meRoutes = new Hono<AppEnv>().get('/me', async (context) => {
  if (env.mockMode) {
    const response: MeResponse = meFixture;
    return context.json(response);
  }

  const userId = context.get('userId');
  const supabase = getServiceClient();

  const [profileResult, tagsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, bio, ai_paragraph, city, phone, pronouns, photo_url')
      .eq('id', userId)
      .single(),
    supabase.from('profile_tags').select('label, kind').eq('user_id', userId),
  ]);
  const { data, error } = profileResult;

  if (error || !data) {
    throw new ApiError(404, 'user_not_found', 'User profile not found.');
  }
  if (tagsResult.error) {
    throw new Error(`profile_tags read failed: ${tagsResult.error.message}`);
  }

  const response: MeResponse = {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    bio: data.bio,
    aiParagraph: data.ai_paragraph,
    city: data.city,
    phone: data.phone,
    pronouns: data.pronouns,
    photoUrl: data.photo_url,
    tags: tagsResult.data.map((row) => ({
      label: row.label as string,
      kind: row.kind as TagKind,
    })),
    hasCompletedProfile: Boolean(data.display_name && data.city),
  };

  return context.json(response);
});
