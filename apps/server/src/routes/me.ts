// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { MeResponse } from '@degrees/shared';
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

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, city')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new ApiError(404, 'user_not_found', 'User profile not found.');
  }

  const response: MeResponse = {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    bio: data.bio,
    city: data.city,
    hasCompletedProfile: Boolean(data.display_name && data.city),
  };

  return context.json(response);
});
