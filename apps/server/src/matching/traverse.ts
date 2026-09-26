// Owner: Sahith (Data & Matching) — see docs/ROLES.md.
export interface Candidate {
  id: string;
  degree: number;
}

// PROPOSED — agree at H0 before either owner builds against this boundary.
export async function traverse(
  _requesterId: string,
  maxDegrees: number,
): Promise<Candidate[]> {
  // TODO(Sahith): recursive CTE over canonical connections, depth-capped at 3.
  return Promise.resolve([
    {
      id: '10000000-0000-4000-8000-000000000002',
      degree: Math.min(1, maxDegrees),
    },
    {
      id: '10000000-0000-4000-8000-000000000004',
      degree: Math.min(2, maxDegrees),
    },
  ]);
}
