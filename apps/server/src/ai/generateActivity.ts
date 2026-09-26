// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import type { Activity, GenerateActivityInput } from '@degrees/shared';
import { activityFixture } from '../mocks/fixtures.js';

export async function generateActivity(
  _input: GenerateActivityInput,
): Promise<Activity> {
  // TODO(Christian): use Gemini Flash with Maps grounding; Ticketmaster is secondary.
  return Promise.resolve(activityFixture);
}
