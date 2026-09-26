// Owner: Sahith (Data & Matching) — see docs/ROLES.md.
import { z } from 'zod';
import { frequencySchema, type UpdatePreferencesRequest } from '@degrees/shared';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import type { Candidate } from './traverse.js';

export interface NarrowedCandidate extends Candidate {
  displayName: string;
  interests: string[];
  prefs: UpdatePreferencesRequest;
  // Cosine similarity to the requester's embedding; 0 when either embedding is missing.
  similarity: number;
  distanceMi: number | null;
  meetAgainScore: number;
  // Similarity rescaled 0–1 within the pool + a small meet-again boost; candidates arrive sorted by this.
  score: number;
}

const nullableInt = z.number().int().nullable();

const narrowRowSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  interests: z.array(z.string()).nullable(),
  similarity: z.number().nullable(),
  distance_mi: z.number().nullable(),
  meet_again_score: z.number().int(),
  cost_min_cents: nullableInt,
  cost_max_cents: nullableInt,
  max_travel_mi: nullableInt,
  frequency: z.string().nullable(),
  group_size_min: nullableInt,
  group_size_max: nullableInt,
  max_degrees: nullableInt,
  score: z.number(),
});

export type NarrowRow = z.infer<typeof narrowRowSchema>;

// Pure so it can be tested: fills each missing preference from the requester's effective prefs.
export function mapNarrowRow(
  row: NarrowRow,
  candidate: Candidate,
  fallbackPrefs: UpdatePreferencesRequest,
): NarrowedCandidate {
  const frequency = frequencySchema.safeParse(row.frequency);
  return {
    ...candidate,
    displayName: row.display_name?.trim() || 'Someone',
    interests: row.interests ?? [],
    prefs: {
      costMinCents: row.cost_min_cents ?? fallbackPrefs.costMinCents,
      costMaxCents: row.cost_max_cents ?? fallbackPrefs.costMaxCents,
      maxTravelMi: row.max_travel_mi ?? fallbackPrefs.maxTravelMi,
      frequency: frequency.success ? frequency.data : fallbackPrefs.frequency,
      groupSizeMin: row.group_size_min ?? fallbackPrefs.groupSizeMin,
      groupSizeMax: row.group_size_max ?? fallbackPrefs.groupSizeMax,
      maxDegrees: row.max_degrees ?? fallbackPrefs.maxDegrees,
    },
    similarity: row.similarity ?? 0,
    distanceMi: row.distance_mi,
    meetAgainScore: row.meet_again_score,
    score: row.score,
  };
}

// Stage 2: rank the pool by embedding similarity, with soft cost/travel filters and meet-again signals.
// `prefs` are the requester's effective (defaulted) preferences.
export async function narrow(
  requesterId: string,
  pool: Candidate[],
  prefs: UpdatePreferencesRequest,
  limit = 12,
): Promise<NarrowedCandidate[]> {
  if (pool.length === 0) {
    return [];
  }

  const { data, error } = await getServiceClient().rpc('match_narrow', {
    p_requester: requesterId,
    p_candidate_ids: pool.map(({ id }) => id),
    p_cost_min_cents: prefs.costMinCents,
    p_cost_max_cents: prefs.costMaxCents,
    p_max_travel_mi: prefs.maxTravelMi,
    p_limit: limit,
  });
  if (error) {
    console.error('match_narrow failed:', error);
    throw new ApiError(500, 'match_failed', 'Failed to rank your network.');
  }

  const rows = z.array(narrowRowSchema).safeParse(data ?? []);
  if (!rows.success) {
    console.error('match_narrow returned an unexpected shape:', rows.error);
    throw new ApiError(500, 'match_failed', 'Failed to rank your network.');
  }

  const byId = new Map(pool.map((candidate) => [candidate.id, candidate]));
  return rows.data.flatMap((row) => {
    const candidate = byId.get(row.id);
    return candidate ? [mapNarrowRow(row, candidate, prefs)] : [];
  });
}
