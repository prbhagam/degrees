// Owner: Christian (Server & Infra) — see docs/ROLES.md. Real-mode pipeline wired by Sahith (matching/).
import { Hono } from 'hono';
import {
  frequencySchema,
  type MatchRunResponse,
  type UpdatePreferencesRequest,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import { profileBasics } from '../lib/graph.js';
import { log, timed } from '../lib/log.js';
import { firstMissingStep, loadProfileStatus } from '../lib/profileStatus.js';
import { formGroups } from '../matching/formGroups.js';
import { narrow } from '../matching/narrow.js';
import { traverse } from '../matching/traverse.js';
import type { AppEnv } from '../middleware/auth.js';
import { matchFixture } from '../mocks/fixtures.js';

const DEFAULT_PREFS: UpdatePreferencesRequest = {
  costMinCents: 0,
  costMaxCents: 5000,
  maxTravelMi: 10,
  frequency: 'weekly',
  groupSizeMin: 3,
  groupSizeMax: 5,
  maxDegrees: 2,
};

interface PreferencesRow {
  cost_min_cents: number | null;
  cost_max_cents: number | null;
  max_travel_mi: number | null;
  frequency: string | null;
  group_size_min: number | null;
  group_size_max: number | null;
  max_degrees: number | null;
}

function effectivePrefs(row: PreferencesRow | null): UpdatePreferencesRequest {
  const frequency = frequencySchema.safeParse(row?.frequency);
  const groupSizeMin = Math.max(
    row?.group_size_min ?? DEFAULT_PREFS.groupSizeMin,
    2,
  );
  return {
    costMinCents: row?.cost_min_cents ?? DEFAULT_PREFS.costMinCents,
    costMaxCents: row?.cost_max_cents ?? DEFAULT_PREFS.costMaxCents,
    maxTravelMi: row?.max_travel_mi ?? DEFAULT_PREFS.maxTravelMi,
    frequency: frequency.success ? frequency.data : DEFAULT_PREFS.frequency,
    groupSizeMin,
    groupSizeMax: Math.max(
      row?.group_size_max ?? DEFAULT_PREFS.groupSizeMax,
      groupSizeMin,
    ),
    maxDegrees: Math.min(
      Math.max(row?.max_degrees ?? DEFAULT_PREFS.maxDegrees, 1),
      3,
    ),
  };
}

function queryFailed(what: string, error: unknown): never {
  console.error(`match/run: failed to load ${what}:`, error);
  throw new ApiError(500, 'match_failed', 'Failed to run matching.');
}

export const matchRoutes = new Hono<AppEnv>().post(
  '/match/run',
  async (context) => {
    if (env.mockMode) {
      const response: MatchRunResponse = matchFixture;
      return context.json(response);
    }

    const userId = context.get('userId');
    const supabase = getServiceClient();

    // Added Sep 26 (wave 2): onboarding can be skipped, but matching can't run without it — the pipeline needs
    // interests to embed, a home base to centre on, and preferences for reach/size. The app reads the code and
    // sends the person to the missing step, then back here.
    const { status: profileStatus } = await loadProfileStatus(userId);
    const missing = firstMissingStep(profileStatus);
    if (missing) {
      throw new ApiError(
        409,
        'profile_incomplete',
        `Finish the ${missing} step of your profile before matching — the matcher can't work without it.`,
      );
    }

    const [profileResult, tagsResult, prefsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', userId)
        .maybeSingle(),
      // Wave 3: 'avoid' tags are constraints, not interests — they must not read as shared ground in the reasoning.
      supabase.from('profile_tags').select('label').eq('user_id', userId).neq('kind', 'avoid'),
      supabase
        .from('preferences')
        .select(
          'cost_min_cents, cost_max_cents, max_travel_mi, frequency, group_size_min, group_size_max, max_degrees',
        )
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    if (profileResult.error) queryFailed('profile', profileResult.error);
    if (tagsResult.error) queryFailed('tags', tagsResult.error);
    if (prefsResult.error) queryFailed('preferences', prefsResult.error);
    if (!profileResult.data) {
      throw new ApiError(
        404,
        'profile_not_found',
        'Finish your profile before matching.',
      );
    }

    const requesterName =
      (profileResult.data.display_name as string | null)?.trim() ||
      (profileResult.data.username as string | null) ||
      'You';
    const requesterInterests = [
      ...new Set(tagsResult.data.map(({ label }) => label as string)),
    ];
    const prefs = effectivePrefs(prefsResult.data as PreferencesRow | null);

    const pool = await timed('match.traverse', { userId, maxDegrees: prefs.maxDegrees }, () =>
      traverse(userId, prefs.maxDegrees),
    );
    const candidates = await timed('match.narrow', { userId, pool: pool.length }, () =>
      narrow(userId, pool, prefs),
    );
    log.info('match.candidates', { userId, pool: pool.length, candidates: candidates.length });
    if (candidates.length === 0) {
      throw new ApiError(
        422,
        'no_candidates',
        'No one in your network matches your preferences yet. Meet more people or widen your degrees.',
      );
    }

    // Resolve names for everyone on a connection path (intermediates may not be candidates themselves).
    const names = new Map(candidates.map((c) => [c.id, c.displayName]));
    const unnamed = [
      ...new Set(candidates.flatMap((c) => c.path.slice(1, -1))),
    ].filter((id) => !names.has(id));
    if (unnamed.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', unnamed);
      if (error) queryFailed('path names', error);
      for (const row of data ?? []) {
        names.set(
          row.id as string,
          (row.display_name as string | null)?.trim() ||
            (row.username as string),
        );
      }
    }
    const paths = Object.fromEntries(
      candidates.map((c) => [
        c.id,
        c.path.slice(1).map((id) => names.get(id) ?? 'a friend'),
      ]),
    );

    const group = await timed('match.formGroups', { userId, candidates: candidates.length }, () =>
      formGroups(
      {
        requesterId: userId,
        candidates: candidates.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          degree: c.degree,
          interests: c.interests,
          prefs: c.prefs,
        })),
        sizeRange: { min: prefs.groupSizeMin, max: prefs.groupSizeMax },
      },
      {
        requesterName,
        requesterInterests,
        paths,
        signals: Object.fromEntries(
          candidates.map((c) => [
            c.id,
            { score: c.score, meetAgain: c.meetAgainScore },
          ]),
        ),
      },
      ),
    );

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const others = group.memberIds.flatMap((id) => {
      const candidate = byId.get(id);
      return candidate && id !== userId ? [candidate] : [];
    });

    const { data: groupId, error: createError } = await supabase.rpc(
      'match_create_group',
      {
        p_reasoning: group.reasoning,
        p_members: [
          { user_id: userId, degree: 0 },
          ...others.map((c) => ({ user_id: c.id, degree: c.degree })),
        ],
      },
    );
    if (createError || typeof groupId !== 'string') {
      queryFailed('group creation', createError);
    }
    log.info('match.group_created', { userId, groupId, members: group.memberIds.length });

    const mine = new Set(requesterInterests.map((l) => l.toLowerCase()));
    const sharedWith = (interests: string[]) =>
      interests.filter((label) => mine.has(label.toLowerCase()));
    const everyoneElse = new Set(
      others.flatMap((c) => c.interests.map((l) => l.toLowerCase())),
    );
    const basics = await profileBasics([userId, ...others.map((c) => c.id)]);

    // CHANGED Sep 26: members past 1st degree are redacted — no id, no displayName, bio, or photo.
    // Matches the same rule applied in lib/groups.ts's loadGroup(): you only see someone's identity
    // once you've actually met them, not just because they're proposed as a match.
    const members: MatchRunResponse['members'] = [
      {
        id: userId,
        displayName: requesterName,
        bio: basics.get(userId)?.bio ?? null,
        photoUrl: basics.get(userId)?.photoUrl ?? null,
        degree: 0,
        sharedInterests: requesterInterests.filter((label) =>
          everyoneElse.has(label.toLowerCase()),
        ),
        revealed: true,
        met: false,
      },
      ...others.map((c): MatchRunResponse['members'][number] =>
        c.degree <= 1
          ? {
              id: c.id,
              displayName: c.displayName,
              bio: basics.get(c.id)?.bio ?? null,
              photoUrl: basics.get(c.id)?.photoUrl ?? null,
              degree: c.degree,
              sharedInterests: sharedWith(c.interests),
              revealed: true,
              met: c.degree === 1,
            }
          : {
              id: null,
              displayName: null,
              bio: null,
              photoUrl: null,
              degree: c.degree,
              sharedInterests: sharedWith(c.interests),
              revealed: false,
              met: false,
            },
      ),
    ];

    const response = {
      groupId,
      members,
      unrevealedCount: members.filter((member) => !member.revealed).length,
      reasoning: group.reasoning,
    } satisfies MatchRunResponse;
    return context.json(response);
  },
);
