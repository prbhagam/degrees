// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import type { AnalyzeFeedbackOutput } from '@degrees/shared';
import { feedbackAnalysisFixture } from '../mocks/fixtures.js';

export async function analyzeFeedback(
  _freeText: string,
): Promise<AnalyzeFeedbackOutput> {
  // TODO(Christian): extract structured sentiment and derived interest tags with Gemini Flash.
  return Promise.resolve(feedbackAnalysisFixture);
}
