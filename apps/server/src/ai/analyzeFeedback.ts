// Owner: Christian (Server & Infra) — see docs/ROLES.md.
// Real-mode fallback, label cleanup, and the Lite → Flash retry added by Sahith for the feedback loop.
import { ThinkingLevel, Type } from '@google/genai';
import type { AnalyzeFeedbackOutput } from '@degrees/shared';
import { analyzeFeedbackOutputSchema } from '@degrees/shared';
import { env } from '../config/env.js';
import { feedbackAnalysisFixture } from '../mocks/fixtures.js';
import { FLASH_LITE_MODEL, FLASH_MODEL, getAiClient } from './client.js';

// The feedback route also saves, re-embeds, and answers inside Netlify's ~10s limit, so analysis gets a slice of it.
// Lite goes first: tag extraction is easy, and on Sep 26 Lite answered in ~0.75s while Flash took 3–5s or 503'd.
const LITE_TIMEOUT_MS = 3_000;
const FLASH_TIMEOUT_MS = 3_000;
// Labels become profile tags and embedding text, so a long reply can't flood a profile.
const MAX_TAGS = 5;
const MAX_LABEL_LENGTH = 40;

// Real mode never falls back to the fixture: its tags would be written into a real person's profile.
const NO_ANALYSIS: AnalyzeFeedbackOutput = { tags: [], sentiment: 'neutral' };

function buildPrompt(freeText: string): string {
  return `Analyze this user's feedback about a group hangout and extract:
1. "tags": up to ${MAX_TAGS} short interest or activity labels this person showed they enjoy or want more of
   (lowercase, 1–3 words, e.g. "live music", "hiking"). Only things they'd like to do again; never names of people.
2. "sentiment": one of "positive", "neutral", or "negative".

User feedback:
"""${freeText}"""

Output JSON: {"tags": [{"label": string, "kind": "derived"}], "sentiment": "positive" | "neutral" | "negative"}`;
}

async function generate(model: string, prompt: string, timeoutMs: number): Promise<string> {
  const response = await getAiClient().models.generateContent({
    model,
    contents: prompt,
    config: {
      abortSignal: AbortSignal.timeout(timeoutMs),
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tags: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                kind: { type: Type.STRING, enum: ['derived'] },
              },
              required: ['label', 'kind'],
            },
          },
          sentiment: {
            type: Type.STRING,
            enum: ['positive', 'neutral', 'negative'],
          },
        },
        required: ['tags', 'sentiment'],
      },
    },
  });
  return response.text ?? '';
}

// Lowercase, trim, drop empties and duplicates, cap count and length.
export function cleanAnalysis(output: AnalyzeFeedbackOutput): AnalyzeFeedbackOutput {
  const labels = new Set<string>();
  for (const { label } of output.tags) {
    const clean = label.trim().toLowerCase().replace(/\s+/g, ' ');
    if (clean && clean.length <= MAX_LABEL_LENGTH) labels.add(clean);
    if (labels.size === MAX_TAGS) break;
  }
  return {
    tags: [...labels].map((label) => ({ label, kind: 'derived' as const })),
    sentiment: output.sentiment,
  };
}

export async function analyzeFeedback(
  freeText: string,
): Promise<AnalyzeFeedbackOutput> {
  if (env.mockMode) {
    return feedbackAnalysisFixture;
  }
  if (!freeText.trim()) {
    return NO_ANALYSIS;
  }

  const prompt = buildPrompt(freeText);
  for (const [model, timeoutMs] of [
    [FLASH_LITE_MODEL, LITE_TIMEOUT_MS],
    [FLASH_MODEL, FLASH_TIMEOUT_MS],
  ] as const) {
    try {
      const parsed = analyzeFeedbackOutputSchema.parse(
        JSON.parse(await generate(model, prompt, timeoutMs)),
      );
      return cleanAnalysis(parsed);
    } catch (error) {
      console.warn(`[analyzeFeedback] ${model} failed:`, error);
    }
  }
  console.error('[analyzeFeedback] every model failed; saving feedback without derived tags');
  return NO_ANALYSIS;
}
