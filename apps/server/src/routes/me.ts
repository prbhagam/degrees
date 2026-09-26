// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { MeResponse, TagKind } from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import {
  computeProfileStatus,
  isProfileComplete,
  PREFERENCES_COLUMNS,
  toPreferences,
  type PreferencesRow,
} from '../lib/profileStatus.js';
import { meFixture } from '../mocks/fixtures.js';

export const meRoutes = new Hono<AppEnv>().get('/me', async (context) => {
  if (env.mockMode) {
    const response: MeResponse = meFixture;
    return context.json(response);
  }

  const userId = context.get('userId');
  const supabase = getServiceClient();

  const [profileResult, tagsResult, prefsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, bio, ai_paragraph, city, phone, pronouns, photo_url')
      .eq('id', userId)
      .single(),
    supabase.from('profile_tags').select('label, kind').eq('user_id', userId),
    supabase.from('preferences').select(PREFERENCES_COLUMNS).eq('user_id', userId).maybeSingle(),
  ]);
  const { data, error } = profileResult;

  if (error || !data) {
    throw new ApiError(404, 'user_not_found', 'User profile not found.');
  }
  if (tagsResult.error) {
    throw new Error(`profile_tags read failed: ${tagsResult.error.message}`);
  }
  if (prefsResult.error) {
    throw new Error(`preferences read failed: ${prefsResult.error.message}`);
  }
  const prefsRow = (prefsResult.data as PreferencesRow | null) ?? null;
  // CHANGED Sep 26 (wave 2): "complete" now means every onboarding step, not just name + city, and the
  // breakdown ships too so the app can say exactly what's missing (and skip-onboarding can nag instead of block).
  const profileStatus = computeProfileStatus({
    city: data.city as string | null,
    tagKinds: tagsResult.data.map((row) => row.kind as string),
    preferences: prefsRow,
  });

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
    hasCompletedProfile: isProfileComplete(profileStatus),
    profileStatus,
    preferences: toPreferences(prefsRow),
  };

  return context.json(response);
});
