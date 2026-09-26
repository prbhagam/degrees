// Owner: Sahith (Data & Matching) — see docs/ROLES.md.
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';

export interface Candidate {
  id: string;
  degree: number;
  // User ids from the requester to this candidate, both inclusive (length = degree + 1).
  path: string[];
}

interface TraverseRow {
  id: string;
  degree: number;
  path: string[];
}

// Stage 1: everyone within maxDegrees of the requester (SQL caps it at 3), shortest degree per person.
export async function traverse(
  requesterId: string,
  maxDegrees: number,
): Promise<Candidate[]> {
  const { data, error } = await getServiceClient().rpc('match_traverse', {
    p_requester: requesterId,
    p_max_degrees: maxDegrees,
  });
  if (error) {
    console.error('match_traverse failed:', error);
    throw new ApiError(500, 'match_failed', 'Failed to search your network.');
  }
  return ((data ?? []) as TraverseRow[]).map((row) => ({
    id: row.id,
    degree: row.degree,
    path: row.path,
  }));
}
