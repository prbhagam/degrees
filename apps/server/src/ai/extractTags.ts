// Owner: Christian (Server & Infra) — Added Sep 27 (wave 6, Sahith).
// The About screen's "Generate tags from this" was canned in the app (the same four tags for every paragraph). This is
// the real call: the person's own paragraph → the interests it shows, plus any of the app's "rather skip" options it
// mentions. Known interest labels are preferred so tags line up with what everyone else picked (matching compares
// labels and embeddings). Lite first, then Flash, like analyzeFeedback; the reply is validated before it's returned.
import { ThinkingLevel, Type } from '@google/genai';
import { extractTagsOutputSchema, type ExtractTagsOutput } from '@degrees/shared';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { log } from '../lib/log.js';
import { FLASH_LITE_MODEL, FLASH_MODEL, getAiClient } from './client.js';

const LITE_TIMEOUT_MS = 4_000;
const FLASH_TIMEOUT_MS = 4_000;
const MAX_INTERESTS = 8;
const MAX_LABEL_LENGTH = 32;

export interface ExtractTagsInput {
  text: string;
  knownInterests: string[];
  avoidOptions: string[];
}

function buildPrompt({ text, knownInterests, avoidOptions }: ExtractTagsInput): string {
  return `Someone wrote this about themselves for a friend-group hangout app:
"""${text}"""

Return JSON with:
1. "interests": up to ${MAX_INTERESTS} things they enjoy or want to do with other people, taken only from what they
   wrote. Title Case, 1–3 words (e.g. "Board Games", "Live Music"). When one of these known labels fits, use it
   exactly: ${JSON.stringify(knownInterests)}. Otherwise write a short specific label (e.g. "Vinyl Records", not a
   vaguer known label). Only activities and hobbies someone could share at a hangout: skip their major, job, school,
   and hometown. Never invent interests the text doesn't support, never include people's names, and never tag
   something they say they dislike or avoid.
2. "avoids": which of these options they said they'd rather skip (exact labels only, often none):
   ${JSON.stringify(avoidOptions)}.`;
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
          interests: { type: Type.ARRAY, items: { type: Type.STRING } },
          avoids: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['interests', 'avoids'],
      },
    },
  });
  return response.text ?? '';
}

// Known labels keep their canonical spelling; unknown ones are trimmed and length-capped; duplicates (any case) drop.
// Avoids must be one of the offered options — they become hard rules on plans, so nothing free-form gets through.
export function cleanTags(output: ExtractTagsOutput, input: ExtractTagsInput): ExtractTagsOutput {
  const known = new Map(input.knownInterests.map((label) => [label.toLowerCase(), label]));
  const seen = new Set<string>();
  const interests: string[] = [];
  for (const raw of output.interests) {
    const label = raw.trim().replace(/\s+/g, ' ');
    const key = label.toLowerCase();
    if (!label || label.length > MAX_LABEL_LENGTH || seen.has(key)) continue;
    seen.add(key);
    interests.push(known.get(key) ?? label);
    if (interests.length === MAX_INTERESTS) break;
  }
  const options = new Map(input.avoidOptions.map((label) => [label.toLowerCase(), label]));
  const avoids = [...new Set(output.avoids.flatMap((raw) => options.get(raw.trim().toLowerCase()) ?? []))];
  const avoided = new Set(avoids.map((label) => label.toLowerCase()));
  return { interests: interests.filter((label) => !avoided.has(label.toLowerCase())), avoids };
}

// Mock mode (no keys): pick out known labels the text actually mentions, so dev output still follows the paragraph.
function mockExtract(input: ExtractTagsInput): ExtractTagsOutput {
  const text = input.text.toLowerCase();
  const mentions = (label: string) =>
    label
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.length > 3 && text.includes(word.replace(/s$/, '')));
  return {
    interests: input.knownInterests.filter(mentions).slice(0, MAX_INTERESTS),
    avoids: input.avoidOptions.filter(mentions),
  };
}

export async function extractTags(input: ExtractTagsInput): Promise<ExtractTagsOutput> {
  if (!input.text.trim()) return { interests: [], avoids: [] };
  if (env.mockMode) return mockExtract(input);

  const prompt = buildPrompt(input);
  for (const [model, timeoutMs] of [
    [FLASH_LITE_MODEL, LITE_TIMEOUT_MS],
    [FLASH_MODEL, FLASH_TIMEOUT_MS],
  ] as const) {
    const started = Date.now();
    try {
      const parsed = extractTagsOutputSchema.parse(JSON.parse(await generate(model, prompt, timeoutMs)));
      const cleaned = cleanTags(parsed, input);
      log.info('ai.extract_tags', { model, ms: Date.now() - started, interests: cleaned.interests.length });
      return cleaned;
    } catch (error) {
      log.warn('ai.extract_tags.model_failed', { model, ms: Date.now() - started, error: String(error) });
    }
  }
  throw new ApiError(503, 'ai_unavailable', "Couldn't read that right now. Try again, or pick interests yourself.");
}
