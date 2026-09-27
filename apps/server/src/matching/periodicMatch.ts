// Owner: Christian (Server & Infra) — periodic batch matching for admin demo trigger.
import type { UpdatePreferencesRequest } from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { profileBasics } from '../lib/graph.js';
import { redactReasoning } from '../lib/groups.js';
import { log, timed } from '../lib/log.js';
import { firstMissingStep, loadProfileStatus } from '../lib/profileStatus.js';
import { fallbackGroup, formGroups } from './formGroups.js';
import { narrow, type NarrowedCandidate } from './narrow.js';
import { traverse, type Candidate } from './traverse.js';

export interface BatchMatchUserResult {
  userId: string;
  username: string;
  groupsCreated: number;
  groupIds: string[];
  skippedReason?: string | undefined;
}

export interface BatchMatchSummary {
  totalUsers: number;
  eligibleUsers: number;
  groupsCreated: number;
  results: BatchMatchUserResult[];
}

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

export function effectivePrefs(row: PreferencesRow | null): UpdatePreferencesRequest {
  const groupSizeMin = Math.max(row?.group_size_min ?? DEFAULT_PREFS.groupSizeMin, 2);
  return {
    costMinCents: row?.cost_min_cents ?? DEFAULT_PREFS.costMinCents,
    costMaxCents: row?.cost_max_cents ?? DEFAULT_PREFS.costMaxCents,
    maxTravelMi: row?.max_travel_mi ?? DEFAULT_PREFS.maxTravelMi,
    frequency: (row?.frequency as UpdatePreferencesRequest['frequency']) ?? DEFAULT_PREFS.frequency,
    groupSizeMin,
    groupSizeMax: Math.max(row?.group_size_max ?? DEFAULT_PREFS.groupSizeMax, groupSizeMin),
    maxDegrees: Math.min(Math.max(row?.max_degrees ?? DEFAULT_PREFS.maxDegrees, 1), 3),
  };
}

export async function matchUserMultiGroups(
  userId: string,
  targetGroups = 3,
  existingGroups: Set<string> = new Set(),
): Promise<{ groupIds: string[]; skippedReason?: string }> {
  const supabase = getServiceClient();

  // 1. Check onboarding status
  const { status: profileStatus } = await loadProfileStatus(userId);
  const missing = firstMissingStep(profileStatus);
  if (missing) {
    return { groupIds: [], skippedReason: `Profile incomplete (missing ${missing})` };
  }

  // 2. Load profile, tags, preferences
  const [profileResult, tagsResult, prefsResult] = await Promise.all([
    supabase.from('profiles').select('username, display_name').eq('id', userId).maybeSingle(),
    supabase.from('profile_tags').select('label').eq('user_id', userId).neq('kind', 'avoid'),
    supabase
      .from('preferences')
      .select('cost_min_cents, cost_max_cents, max_travel_mi, frequency, group_size_min, group_size_max, max_degrees')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (profileResult.error || !profileResult.data) {
    return { groupIds: [], skippedReason: 'Profile not found' };
  }

  const requesterName =
    (profileResult.data.display_name as string | null)?.trim() ||
    (profileResult.data.username as string | null) ||
    'You';
  const requesterInterests = [...new Set((tagsResult.data ?? []).map(({ label }) => label as string))];
  const prefs = effectivePrefs(prefsResult.data as PreferencesRow | null);

  // 3. Traverse network
  const pool = await traverse(userId, prefs.maxDegrees);

  // INVARIANT: If a user has no first degree connections, they cannot be matched with anyone regardless of degree preferences!
  const hasFirstDegree = pool.some((c) => c.degree === 1);
  if (!hasFirstDegree) {
    return {
      groupIds: [],
      skippedReason: 'No first-degree connections (must meet at least one person in person first)',
    };
  }

  // 4. Narrow candidates
  const allCandidates = await narrow(userId, pool, prefs);
  if (allCandidates.length < prefs.groupSizeMin - 1) {
    return {
      groupIds: [],
      skippedReason: `Insufficient candidates (${allCandidates.length} available, need ${prefs.groupSizeMin - 1})`,
    };
  }

  // Helper map for connection paths
  const names = new Map(allCandidates.map((c) => [c.id, c.displayName]));
  const unnamed = [...new Set(allCandidates.flatMap((c) => c.path.slice(1, -1)))].filter((id) => !names.has(id));
  if (unnamed.length > 0) {
    const { data } = await supabase.from('profiles').select('id, display_name, username').in('id', unnamed);
    for (const row of data ?? []) {
      names.set(row.id as string, (row.display_name as string | null)?.trim() || (row.username as string));
    }
  }
  const paths = Object.fromEntries(
    allCandidates.map((c) => [c.id, c.path.slice(1).map((id) => names.get(id) ?? 'a friend')]),
  );

  const byId = new Map(allCandidates.map((c) => [c.id, c]));
  const groupIds: string[] = [];
  const candidateUseCount = new Map<string, number>();

  // Determine how many groups we can form (between 1 and targetGroups, min 1)
  const maxPossibleGroups = Math.min(
    targetGroups,
    Math.max(1, Math.floor(allCandidates.length / Math.max(prefs.groupSizeMin - 1, 1))),
  );

  for (let i = 0; i < maxPossibleGroups; i++) {
    // Sort candidate pool prioritizing least-used candidates in this run to create diverse groups
    const candidateSubset = [...allCandidates].sort((a, b) => {
      const usesA = candidateUseCount.get(a.id) ?? 0;
      const usesB = candidateUseCount.get(b.id) ?? 0;
      if (usesA !== usesB) return usesA - usesB;
      return b.score - a.score;
    });

    const options = {
      requesterName,
      requesterInterests,
      paths,
      signals: Object.fromEntries(
        candidateSubset.map((c) => [c.id, { score: c.score, meetAgain: c.meetAgainScore }]),
      ),
    };

    const formed = await formGroups(
      {
        requesterId: userId,
        candidates: candidateSubset.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          degree: c.degree,
          interests: c.interests,
          prefs: c.prefs,
        })),
        sizeRange: { min: prefs.groupSizeMin, max: prefs.groupSizeMax },
      },
      options,
    );

    const membersSortedKey = [...formed.memberIds].sort().join(':');
    if (existingGroups.has(membersSortedKey)) {
      // Avoid creating an exact duplicate group composition in this run
      continue;
    }
    existingGroups.add(membersSortedKey);

    for (const memberId of formed.memberIds) {
      if (memberId !== userId) {
        candidateUseCount.set(memberId, (candidateUseCount.get(memberId) ?? 0) + 1);
      }
    }

    const others = formed.memberIds.flatMap((id) => {
      const candidate = byId.get(id);
      return candidate && id !== userId ? [candidate] : [];
    });

    const { data: createdGroupId, error: createError } = await supabase.rpc('match_create_group', {
      p_reasoning: formed.reasoning,
      p_members: [
        { user_id: userId, degree: 0 },
        ...others.map((c) => ({ user_id: c.id, degree: c.degree })),
      ],
    });

    if (!createError && typeof createdGroupId === 'string') {
      groupIds.push(createdGroupId);
    }
  }

  if (groupIds.length === 0) {
    return { groupIds: [], skippedReason: 'Could not form unique groups' };
  }

  return { groupIds };
}

export async function runPeriodicBatchMatching(): Promise<BatchMatchSummary> {
  const supabase = getServiceClient();
  const { data: users, error } = await supabase.from('profiles').select('id, username').order('created_at', { ascending: true });

  if (error || !users) {
    throw new Error(`Failed to load users for batch matching: ${error?.message}`);
  }

  const existingGroups = new Set<string>();
  const results: BatchMatchUserResult[] = [];
  let totalGroupsCreated = 0;
  let eligibleCount = 0;

  for (const user of users) {
    const userId = user.id as string;
    const username = (user.username as string) ?? userId;

    try {
      const matchResult = await matchUserMultiGroups(userId, 3, existingGroups);
      if (matchResult.groupIds.length > 0) {
        eligibleCount += 1;
        totalGroupsCreated += matchResult.groupIds.length;
        results.push({
          userId,
          username,
          groupsCreated: matchResult.groupIds.length,
          groupIds: matchResult.groupIds,
        });
      } else {
        results.push({
          userId,
          username,
          groupsCreated: 0,
          groupIds: [],
          skippedReason: matchResult.skippedReason,
        });
      }
    } catch (err) {
      log.error('batch_match.user_failed', err, { userId, username });
      results.push({
        userId,
        username,
        groupsCreated: 0,
        groupIds: [],
        skippedReason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    totalUsers: users.length,
    eligibleUsers: eligibleCount,
    groupsCreated: totalGroupsCreated,
    results,
  };
}
