// Owner: Sahith (Data & Matching) — see docs/ROLES.md.
import type { UpdatePreferencesRequest } from '@degrees/shared';
import type { Candidate } from './traverse.js';

export interface NarrowedCandidate extends Candidate {
  displayName: string;
  interests: string[];
  prefs: UpdatePreferencesRequest;
  similarity: number;
}

// PROPOSED — agree at H0 before either owner builds against this boundary.
export async function narrow(
  _requesterId: string,
  pool: Candidate[],
  prefs: UpdatePreferencesRequest,
): Promise<NarrowedCandidate[]> {
  // TODO(Sahith): pgvector cosine ranking plus cost, travel, and meet-again filters.
  return Promise.resolve(
    pool.map((candidate, index) => ({
      ...candidate,
      displayName: index === 0 ? 'Maya Patel' : 'Jordan Kim',
      interests: index === 0 ? ['design', 'coffee'] : ['food', 'photography'],
      prefs,
      similarity: 0.92 - index * 0.05,
    })),
  );
}
