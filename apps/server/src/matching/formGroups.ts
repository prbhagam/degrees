// Owner: Sahith (Data & Matching) — see docs/ROLES.md.
import type { FormGroupsInput, FormGroupsOutput } from '@degrees/shared';

export async function formGroups(
  input: FormGroupsInput,
): Promise<FormGroupsOutput> {
  // TODO(Sahith): use a soft size constraint and fall back to top-N similarity if Gemini fails.
  return Promise.resolve({
    memberIds: [input.requesterId, ...input.candidates.slice(0, 3).map(({ id }) => id)],
    reasoning: 'Local matching stub: candidates share compatible interests and constraints.',
  });
}
