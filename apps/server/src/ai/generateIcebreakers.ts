// Owner: Christian (Server & Infra) — Gemini wrapper; this call added by Sahith (Sep 26, wave 2).
// Icebreakers for a meetup: 4–6 short conversation starters written for the specific people in the room. Text only
// (team decision, Sep 26) — not games, not scheduled activities. Lite first (it's an easy task and answers in
// under a second), Flash as the retry, and a deterministic set if both fail so the screen never hard-fails.
import { ThinkingLevel, Type } from '@google/genai';
import {
  generateIcebreakersOutputSchema,
  type GenerateIcebreakersInput,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { log, timed } from '../lib/log.js';
import { icebreakersFixture } from '../mocks/fixtures.js';
import { FLASH_LITE_MODEL, FLASH_MODEL, getAiClient } from './client.js';

const LITE_TIMEOUT_MS = 3_500;
const FLASH_TIMEOUT_MS = 4_000;
const MAX_PROMPT_LENGTH = 200;

function buildPrompt(input: GenerateIcebreakersInput): string {
  const people = input.members
    .map(
      ({ displayName, interests }) =>
        `- ${displayName}: ${interests.length > 0 ? interests.join(', ') : 'no interests listed'}`,
    )
    .join('\n');
  return `You write icebreakers for small groups of college students who just met in person${
    input.name ? ` at "${input.name}"` : ''
  }.

People here:
${people}

Write 5 conversation starters for THIS group. Rules:
- Each one is a single question or prompt, under 20 words, that anyone in the room can answer.
- At least three should draw on interests two or more people share, or an interesting contrast between people.
- Name people by first name when a prompt is about their interest ("Maya and Leo both climb — ...").
- Warm, specific, low-pressure. No "tell us a fun fact". No questions about work or grades.

Output JSON: {"icebreakers": string[]}`;
}

async function generate(model: string, prompt: string, timeoutMs: number): Promise<string[]> {
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
          icebreakers: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['icebreakers'],
      },
    },
  });
  const parsed = generateIcebreakersOutputSchema.parse(JSON.parse(response.text ?? ''));
  return parsed.icebreakers
    .map((prompt) => prompt.trim().slice(0, MAX_PROMPT_LENGTH))
    .filter((prompt, index, all) => prompt.length > 0 && all.indexOf(prompt) === index)
    .slice(0, 6);
}

// Always answers: a group's interests are enough to write something on-topic without a model.
export function fallbackIcebreakers(input: GenerateIcebreakersInput): string[] {
  const counts = new Map<string, string[]>();
  for (const member of input.members) {
    for (const interest of member.interests) {
      const key = interest.toLowerCase();
      counts.set(key, [...(counts.get(key) ?? []), member.displayName.split(' ')[0] ?? member.displayName]);
    }
  }
  const shared = [...counts.entries()]
    .filter(([, names]) => names.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    .map(([interest, names]) => `${names.slice(0, 3).join(' and ')} are all into ${interest} — how did each of you get started?`);
  return [
    ...shared,
    'What brought you here today, and what would make it worth it?',
    "What's one thing you've been meaning to try around town but haven't yet?",
    'Best cheap meal in Atlanta — go.',
  ].slice(0, 5);
}

export async function generateIcebreakers(input: GenerateIcebreakersInput): Promise<string[]> {
  if (env.mockMode || !env.geminiApiKey) {
    return icebreakersFixture.icebreakers;
  }
  const prompt = buildPrompt(input);
  const attempts: [string, number][] = [
    [FLASH_LITE_MODEL, LITE_TIMEOUT_MS],
    [FLASH_MODEL, FLASH_TIMEOUT_MS],
  ];
  for (const [model, timeoutMs] of attempts) {
    try {
      const icebreakers = await timed('ai.icebreakers', { model, members: input.members.length }, () =>
        generate(model, prompt, timeoutMs),
      );
      if (icebreakers.length >= 3) return icebreakers;
      log.warn('ai.icebreakers.too_few', { model, count: icebreakers.length });
    } catch {
      // timed() already logged the failure; try the next model.
    }
  }
  log.warn('ai.icebreakers.fallback', { members: input.members.length });
  return fallbackIcebreakers(input);
}
