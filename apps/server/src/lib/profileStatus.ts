// Owner: Christian (Server & Infra) — added by Sahith (Sep 26, wave 2).
// One definition of "is onboarding done" for GET /me (so the app can nag) and POST /match/run (which refuses
// without it). Interests = at least one hobby/activity tag · about = a home base city · preferences = a row.
import {
  frequencySchema,
  type ProfileStatus,
  type UpdatePreferencesRequest,
} from '@degrees/shared';
import { getServiceClient } from '../db/supabase.js';

export interface PreferencesRow {
  cost_min_cents: number | null;
  cost_max_cents: number | null;
  max_travel_mi: number | null;
  frequency: string | null;
  group_size_min: number | null;
  group_size_max: number | null;
  max_degrees: number | null;
}

export const PREFERENCES_COLUMNS =
  'cost_min_cents, cost_max_cents, max_travel_mi, frequency, group_size_min, group_size_max, max_degrees';

export function toPreferences(row: PreferencesRow | null): UpdatePreferencesRequest | null {
  if (!row) return null;
  const frequency = frequencySchema.safeParse(row.frequency);
  return {
    costMinCents: row.cost_min_cents ?? 0,
    costMaxCents: row.cost_max_cents ?? 0,
    maxTravelMi: row.max_travel_mi ?? 0,
    frequency: frequency.success ? frequency.data : 'weekly',
    groupSizeMin: row.group_size_min ?? 2,
    groupSizeMax: row.group_size_max ?? 2,
    maxDegrees: row.max_degrees ?? 2,
  };
}

export function computeProfileStatus(input: {
  city: string | null;
  tagKinds: string[];
  preferences: PreferencesRow | null;
}): ProfileStatus {
  return {
    interests: input.tagKinds.some((kind) => kind === 'hobby' || kind === 'activity'),
    about: Boolean(input.city?.trim()),
    preferences: input.preferences !== null,
  };
}

export function isProfileComplete(status: ProfileStatus): boolean {
  return status.interests && status.about && status.preferences;
}

// Which onboarding step is missing, in the order the app walks them.
export function firstMissingStep(status: ProfileStatus): 'interests' | 'about' | 'preferences' | null {
  if (!status.interests) return 'interests';
  if (!status.about) return 'about';
  if (!status.preferences) return 'preferences';
  return null;
}

export async function loadProfileStatus(userId: string): Promise<{
  status: ProfileStatus;
  preferences: UpdatePreferencesRequest | null;
}> {
  const db = getServiceClient();
  const [profile, tags, prefs] = await Promise.all([
    db.from('profiles').select('city').eq('id', userId).maybeSingle(),
    db.from('profile_tags').select('kind').eq('user_id', userId),
    db.from('preferences').select(PREFERENCES_COLUMNS).eq('user_id', userId).maybeSingle(),
  ]);
  if (profile.error) throw new Error(`profiles read failed: ${profile.error.message}`);
  if (tags.error) throw new Error(`profile_tags read failed: ${tags.error.message}`);
  if (prefs.error) throw new Error(`preferences read failed: ${prefs.error.message}`);
  const row = (prefs.data as PreferencesRow | null) ?? null;
  return {
    status: computeProfileStatus({
      city: (profile.data?.city as string | null) ?? null,
      tagKinds: tags.data.map((tag) => tag.kind as string),
      preferences: row,
    }),
    preferences: toPreferences(row),
  };
}
