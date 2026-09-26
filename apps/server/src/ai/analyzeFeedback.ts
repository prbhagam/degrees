// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import type { AnalyzeFeedbackOutput } from '@degrees/shared';
import { analyzeFeedbackOutputSchema } from '@degrees/shared';
import { env } from '../config/env.js';
import { feedbackAnalysisFixture } from '../mocks/fixtures.js';
import { FLASH_MODEL, getAiClient } from './client.js';

export async function analyzeFeedback(
  freeText: string,
): Promise<AnalyzeFeedbackOutput> {
  if (env.mockMode || !freeText.trim()) {
    return feedbackAnalysisFixture;
  }

  const prompt = `Analyze this user feedback from a hangout event and extract:
1. "tags": An array of derived interest/activity labels (lowercase, concise, kind must be "derived").
2. "sentiment": One of "positive", "neutral", or "negative".

User Feedback:
"${freeText}"

Output valid JSON matching:
{"tags": [{"label": string, "kind": "derived"}], "sentiment": "positive" | "neutral" | "negative"}`;

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) {
      return feedbackAnalysisFixture;
    }

    const parsed = JSON.parse(text);
    return analyzeFeedbackOutputSchema.parse(parsed);
  } catch (error) {
    console.error('analyzeFeedback failed, falling back to fixture:', error);
    return feedbackAnalysisFixture;
  }
}
