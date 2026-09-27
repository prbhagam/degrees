// Owner: Christian (Server & Infra) — periodic batch matching for admin demo trigger.
// CHANGED Sep 26 (wave 5, Sahith): members of each created group are notified (hangout_invited).
// CHANGED Sep 26 (Sahith): rewritten as ONE global pass. It used to loop over every profile and call formGroups up
// to 3× per user (~180 Gemini calls for 60 users, minutes of wall time, far past Netlify's 10s), and people could
// land in any number of other users' groups. Now: bulk-load profiles/tags/preferences, run the existing
// traverse + narrow RPCs per user (DB only, in parallel), build one pairwise compatibility graph, and let
// batchGroups.ts form every group with one Gemini call per ~30 connected people. Each person gets 1–3 groups;
// just 1 is fine when they have no strong matches. Batch groups have no requester, so nobody is auto-accepted.
import type { UpdatePreferencesRequest } from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { log } from '../lib/log.js';
import { notify } from '../lib/notify.js';
import { computeProfileStatus, firstMissingStep } from '../lib/profileStatus.js';
import {
  buildBatchGraph,
  formBatchGroups,
  groupKey,
  pairKey,
  type BatchPerson,
  type DirectionalScore,
} from './batchGroups.js';
import { narrow } from './narrow.js';
import { traverse } from './traverse.js';

export interface BatchMatchUserResult {
  userId: string;
  username: string;
  groupsCreated: number;
  groupIds: string[];
  skippedReason?: string | undefined;
}

export interface BatchMatchSummary {
  totalUsers: number;
  // Onboarded and past the 1st-degree gate.
  eligibleUsers: number;
  // Placed in at least one group this run.
  matchedUsers: number;
  groupsCreated: number;
  aiCalls: number;
  // Groups the model proposed vs. ones the deterministic fill added.
  aiGroups: number;
  fallbackGroups: number;
  durationMs: number;
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

// Netlify's legacy plan kills a synchronous function at 10s. Leave room for the group writes after the AI call.
const RUN_BUDGET_MS = 9000;
const WRITE_RESERVE_MS = 1500;
// Parallel DB round-trips (traverse + narrow per user, then group writes).
const DB_CONCURRENCY = 8;
const PAGE_SIZE = 1000;

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

// PostgREST caps a response at 1000 rows; tags alone pass that at ~100 users.
async function selectAll<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} read failed: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  city: string | null;
}

export interface BatchMatchOptions {
  // Form the groups but write nothing (no groups, no notifications); results carry placeholder ids.
  dryRun?: boolean;
}

export async function runPeriodicBatchMatching(options: BatchMatchOptions = {}): Promise<BatchMatchSummary> {
  if (env.mockMode) {
    throw new Error('Batch matching needs the real Supabase keys — the server is in mock mode.');
  }
  const started = Date.now();
  const supabase = getServiceClient();

  // 1. Everything about everyone, in three queries (not three per user).
  const [profiles, tags, prefsRows] = await Promise.all([
    selectAll<ProfileRow>('profiles', (from, to) =>
      supabase
        .from('profiles')
        .select('id, username, display_name, city')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    selectAll<{ user_id: string; kind: string; label: string }>('profile_tags', (from, to) =>
      supabase.from('profile_tags').select('user_id, kind, label').order('user_id').order('label').range(from, to),
    ),
    selectAll<PreferencesRow & { user_id: string }>('preferences', (from, to) =>
      supabase.from('preferences').select('user_id, cost_min_cents, cost_max_cents, max_travel_mi, frequency, group_size_min, group_size_max, max_degrees').order('user_id').range(from, to),
    ),
  ]);

  const tagsByUser = new Map<string, { kind: string; label: string }[]>();
  for (const tag of tags) {
    const list = tagsByUser.get(tag.user_id) ?? [];
    list.push(tag);
    tagsByUser.set(tag.user_id, list);
  }
  const prefsByUser = new Map(prefsRows.map((row) => [row.user_id, row]));

  const results = new Map<string, BatchMatchUserResult>(
    profiles.map((p) => [
      p.id,
      { userId: p.id, username: p.username ?? p.id, groupsCreated: 0, groupIds: [] },
    ]),
  );
  const skip = (userId: string, reason: string) => {
    results.get(userId)!.skippedReason = reason;
  };

  // 2. Onboarding gate (same rule as POST /match/run).
  const people: BatchPerson[] = [];
  for (const profile of profiles) {
    const userTags = tagsByUser.get(profile.id) ?? [];
    const prefsRow = prefsByUser.get(profile.id) ?? null;
    const missing = firstMissingStep(
      computeProfileStatus({ city: profile.city, tagKinds: userTags.map((t) => t.kind), preferences: prefsRow }),
    );
    if (missing) {
      skip(profile.id, `Profile incomplete (missing ${missing})`);
      continue;
    }
    people.push({
      id: profile.id,
      name: profile.display_name?.trim() || profile.username || '',
      interests: [...new Set(userTags.filter((t) => t.kind !== 'avoid').map((t) => t.label))],
      prefs: effectivePrefs(prefsRow),
    });
  }
  const onboarded = new Set(people.map((p) => p.id));

  // 3. Stages 1–2 per person (DB only). narrow() gets the whole pool so every compatible pair has a score.
  const directional = new Map<string, DirectionalScore[]>();
  await mapLimit(people, DB_CONCURRENCY, async (person) => {
    try {
      const pool = await traverse(person.id, person.prefs.maxDegrees);
      // INVARIANT: no first-degree connection = no matches at any degree (you have to meet someone in person first).
      if (!pool.some((c) => c.degree === 1)) {
        skip(person.id, 'No first-degree connections (must meet at least one person in person first)');
        return;
      }
      const candidates = pool.filter((c) => onboarded.has(c.id));
      const ranked = await narrow(person.id, candidates, person.prefs, Math.max(candidates.length, 1));
      directional.set(
        person.id,
        ranked.map((c) => ({ id: c.id, degree: c.degree, score: c.score, meetAgainScore: c.meetAgainScore })),
      );
    } catch (error) {
      log.error('batch_match.rank_failed', error, { userId: person.id });
      skip(person.id, 'Could not rank this network (database error)');
    }
  });

  const eligible = people.filter((p) => directional.has(p.id));
  const graph = buildBatchGraph(eligible, directional);
  const rankedAt = Date.now();

  // Member sets of groups people already have open, so a run doesn't propose the same group twice.
  let existingGroupKeys: string[] = [];
  try {
    const memberships = await selectAll<{ group_id: string; user_id: string }>('group_members', (from, to) =>
      supabase
        .from('group_members')
        .select('group_id, user_id, groups!inner(kind, status)')
        .eq('groups.kind', 'matched')
        .in('groups.status', ['proposed', 'confirmed'])
        .order('group_id')
        .order('user_id')
        .range(from, to),
    );
    const byGroup = new Map<string, string[]>();
    for (const row of memberships) byGroup.set(row.group_id, [...(byGroup.get(row.group_id) ?? []), row.user_id]);
    existingGroupKeys = [...byGroup.values()].map(groupKey);
  } catch (error) {
    log.warn('batch_match.existing_groups_unavailable', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  // 4. Form every group: one Gemini call per chunk, referee, deterministic fill.
  const formed = await formBatchGroups(graph, {
    useAi: Boolean(env.geminiApiKey),
    deadline: started + RUN_BUDGET_MS - WRITE_RESERVE_MS,
    existingGroupKeys,
  });
  for (const id of formed.isolated) {
    skip(id, 'No compatible matches this run (degree limits, budget, distance, or feedback rule everyone out)');
  }
  for (const id of formed.unplaced) {
    skip(id, 'Every compatible match already has 3 groups this run');
  }
  const formedAt = Date.now();

  // 5. Persist + notify. The stored degree is only a fallback for viewers the graph can't reach; use each member's
  // closest tie inside the group. Nobody is degree 0: no one asked for a batch group, so everyone accepts for
  // themselves (match_create_group only pre-accepts degree 0).
  await mapLimit(formed.groups, DB_CONCURRENCY, async (group) => {
    const members = group.memberIds.map((id) => ({
      user_id: id,
      degree: Math.max(
        1,
        Math.min(
          ...group.memberIds
            .filter((other) => other !== id)
            .map((other) => graph.pairs.get(pairKey(id, other))?.degree ?? 3),
        ),
      ),
    }));
    const { data: groupId, error } = options.dryRun
      ? { data: `dry-run-${formed.groups.indexOf(group) + 1}`, error: null }
      : await supabase.rpc('match_create_group', { p_reasoning: group.reasoning, p_members: members });
    if (error || typeof groupId !== 'string') {
      log.error('batch_match.create_failed', error ?? new Error('no group id returned'), {
        memberIds: group.memberIds,
      });
      return;
    }
    for (const id of group.memberIds) {
      const result = results.get(id);
      if (result) {
        result.groupIds.push(groupId);
        result.groupsCreated += 1;
      }
    }
    if (!options.dryRun) {
      await notify(group.memberIds, 'hangout_invited', { groupId, memberCount: group.memberIds.length });
    }
  });

  const rows = [...results.values()];
  for (const row of rows) {
    if (row.groupsCreated > 0) delete row.skippedReason;
    else row.skippedReason ??= 'Group could not be saved';
  }
  const created = new Set(rows.flatMap((r) => r.groupIds));
  const summary: BatchMatchSummary = {
    totalUsers: profiles.length,
    eligibleUsers: eligible.length,
    matchedUsers: rows.filter((r) => r.groupsCreated > 0).length,
    groupsCreated: created.size,
    aiCalls: formed.aiCalls,
    aiGroups: formed.groups.filter((g) => g.source === 'ai').length,
    fallbackGroups: formed.groups.filter((g) => g.source === 'fallback').length,
    durationMs: Date.now() - started,
    results: rows,
  };
  log.info('batch_match.done', {
    dryRun: Boolean(options.dryRun),
    totalUsers: summary.totalUsers,
    eligibleUsers: summary.eligibleUsers,
    matchedUsers: summary.matchedUsers,
    groupsCreated: summary.groupsCreated,
    aiCalls: summary.aiCalls,
    aiGroups: summary.aiGroups,
    fallbackGroups: summary.fallbackGroups,
    rankMs: rankedAt - started,
    formMs: formedAt - rankedAt,
    writeMs: Date.now() - formedAt,
  });
  return summary;
}
