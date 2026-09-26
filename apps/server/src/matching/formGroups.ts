// Owner: Sahith (Data & Matching) — see docs/ROLES.md.
import { ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import type { FormGroupsInput, FormGroupsOutput } from '@degrees/shared';
import { FLASH_MODEL, getAiClient } from '../ai/client.js';
import { env } from '../config/env.js';

// Group size is soft, but never let a model response balloon a group past this.
export const ABSOLUTE_MAX_GROUP = 8;
const DEFAULT_TIMEOUT_MS = 8000;

export interface FormGroupsOptions {
  requesterName?: string;
  requesterInterests?: string[];
  // Candidate id → display names along the path, requester excluded, candidate last.
  paths?: Record<string, string[]>;
  // Candidate id → stage-2 signals. Without these the model only knows the list order and ignores feedback.
  signals?: Record<string, { score: number; meetAgain: number }>;
  timeoutMs?: number;
  // Test seam; defaults to Gemini Flash. Must resolve to the raw JSON text.
  generate?: (prompt: string, signal: AbortSignal) => Promise<string>;
}

const modelOutputSchema = z.object({
  memberIds: z.array(z.string()),
  reasoning: z.string(),
});

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function attainableRange(input: FormGroupsInput): { min: number; max: number } {
  const available = input.candidates.length + 1;
  const min = Math.min(Math.max(input.sizeRange.min, 2), available);
  const max = Math.min(
    Math.max(input.sizeRange.max, min),
    ABSOLUTE_MAX_GROUP,
    available,
  );
  return { min, max };
}

// Interests held by at least two members (requester included), case-insensitive, most common first.
function sharedInterests(
  input: FormGroupsInput,
  memberIds: string[],
  options: FormGroupsOptions,
): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  const add = (labels: string[]) => {
    for (const label of new Set(labels.map((l) => l.toLowerCase()))) {
      const entry = counts.get(label) ?? { label, count: 0 };
      entry.count += 1;
      counts.set(label, entry);
    }
  };
  add(options.requesterInterests ?? []);
  for (const id of memberIds) {
    const candidate = input.candidates.find((c) => c.id === id);
    if (candidate) add(candidate.interests);
  }
  return [...counts.values()]
    .filter(({ count }) => count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map(({ label }) => label);
}

export function deterministicReasoning(
  input: FormGroupsInput,
  memberIds: string[],
  options: FormGroupsOptions = {},
): string {
  const others = memberIds
    .filter((id) => id !== input.requesterId)
    .flatMap((id) => input.candidates.filter((c) => c.id === id));

  let opener: string;
  const distant = others.find(
    (c) => c.degree >= 2 && (options.paths?.[c.id]?.length ?? 0) >= 2,
  );
  if (distant) {
    const chain = options.paths?.[distant.id] ?? [];
    opener =
      chain.length === 2
        ? `You and ${chain[1]} both know ${chain[0]}`
        : `You know ${chain[0]}${chain
            .slice(1)
            .map((name) => `, who knows ${name}`)
            .join('')}`;
  } else if (others.length > 0) {
    opener = `You already know ${joinList(others.map((c) => c.displayName))}`;
  } else {
    return 'No one in your network is a match yet.';
  }

  const shared = sharedInterests(input, memberIds, options).slice(0, 3);
  const sharedClause =
    shared.length > 0
      ? `the group shares an interest in ${joinList(shared)}`
      : 'your plans and budgets line up';
  // Past "would meet again" feedback is the demo's "matching improved" beat, so say it when it drove the pick.
  const again = others
    .filter((c) => (options.signals?.[c.id]?.meetAgain ?? 0) > 0)
    .map((c) => c.displayName);
  if (again.length === 0) {
    return `${opener}, and ${sharedClause}.`;
  }
  const verb = again.length === 1 ? 'wants' : 'want';
  return `${opener}. ${joinList(again)} ${verb} to hang out again, and ${sharedClause}.`;
}

// Top-N by stage-2 score (pool-relative similarity + small meet-again boost): candidates arrive in that order.
export function fallbackGroup(
  input: FormGroupsInput,
  options: FormGroupsOptions = {},
): FormGroupsOutput {
  const { max } = attainableRange(input);
  const memberIds = [
    input.requesterId,
    ...input.candidates
      .filter((c) => c.id !== input.requesterId)
      .slice(0, Math.max(max - 1, 0))
      .map(({ id }) => id),
  ];
  return {
    memberIds,
    reasoning: deterministicReasoning(input, memberIds, options),
  };
}

// Keeps only known candidate ids, backfills to the attainable minimum, and discards the model's reasoning
// whenever the selection had to change. Returns null when nothing usable is left.
export function sanitizeModelGroup(
  input: FormGroupsInput,
  raw: z.infer<typeof modelOutputSchema>,
  options: FormGroupsOptions = {},
): FormGroupsOutput | null {
  const known = new Set(input.candidates.map(({ id }) => id));
  known.delete(input.requesterId);

  const proposed = raw.memberIds.filter((id) => id !== input.requesterId);
  const valid = [...new Set(proposed.filter((id) => known.has(id)))].slice(
    0,
    ABSOLUTE_MAX_GROUP - 1,
  );
  if (valid.length === 0) {
    return null;
  }
  let changed = valid.length !== proposed.length;

  const { min } = attainableRange(input);
  for (const candidate of input.candidates) {
    if (valid.length + 1 >= min) break;
    if (known.has(candidate.id) && !valid.includes(candidate.id)) {
      valid.push(candidate.id);
      changed = true;
    }
  }

  const memberIds = [input.requesterId, ...valid];
  const reasoning = raw.reasoning.trim();
  return {
    memberIds,
    reasoning:
      changed || !reasoning
        ? deterministicReasoning(input, memberIds, options)
        : reasoning,
  };
}

function buildPrompt(input: FormGroupsInput, options: FormGroupsOptions): string {
  const candidates = input.candidates.map((c) => ({
    id: c.id,
    name: c.displayName,
    degree: c.degree,
    matchScore: Number((options.signals?.[c.id]?.score ?? 0).toFixed(2)),
    wouldMeetAgain: options.signals?.[c.id]?.meetAgain ?? 0,
    connectionPath: options.paths?.[c.id] ?? [],
    interests: c.interests,
    budgetCents: [c.prefs.costMinCents, c.prefs.costMaxCents],
    maxTravelMi: c.prefs.maxTravelMi,
    frequency: c.prefs.frequency,
    groupSize: [c.prefs.groupSizeMin, c.prefs.groupSizeMax],
  }));

  return `You form small real-world hangout groups for Degrees, an app that gets friend groups offline.

Requester: ${options.requesterName ?? 'the requester'}
Requester interests: ${(options.requesterInterests ?? []).join(', ') || 'unknown'}
Target group size including the requester: ${input.sizeRange.min}-${input.sizeRange.max} (soft; best effort)

Candidates are ranked best-first. matchScore (0 to about 1.5) combines profile similarity with past feedback.
wouldMeetAgain counts how many times the requester and this candidate said, after hanging out, that they'd meet
again. degree 1 = the requester already knows them; degree 2+ = a friend of a friend. connectionPath lists the
people linking the requester to the candidate, ending with the candidate.

Candidates (JSON):
${JSON.stringify(candidates, null, 2)}

Pick the members (excluding the requester) for one group that will enjoy an activity together:
- Start from the highest matchScore candidates, and strongly prefer anyone with wouldMeetAgain > 0: past
  feedback is the best signal we have. Only pass over a high scorer for a clear reason.
- Prefer shared interests, a mix of people the requester knows and friends of friends, and real connection paths.
- Respect everyone's budget, travel radius, frequency, and group size softly.
- Only use ids from the candidate list.

Return JSON: {"memberIds": string[], "reasoning": string}. reasoning is at most two sentences in second person,
shown to the requester. If any chosen member has degree 2 or more, name their connection path, e.g.
"You and Maya both know Chris". If you chose someone because they'd meet again, say so.`;
}

async function generateWithGemini(
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await getAiClient().models.generateContent({
    model: FLASH_MODEL,
    contents: prompt,
    config: {
      abortSignal: signal,
      // Default thinking measured ~13s (then a 503) on gemini-3.8-flash; LOW answers in ~3s, inside the timeout.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          memberIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING },
        },
        required: ['memberIds', 'reasoning'],
      },
    },
  });
  return response.text ?? '';
}

async function withTimeout(
  run: (signal: AbortSignal) => Promise<string>,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Stage 3: Gemini assembles the group; any failure falls back to top-N by stage-2 score. Never throws.
export async function formGroups(
  input: FormGroupsInput,
  options: FormGroupsOptions = {},
): Promise<FormGroupsOutput> {
  if (input.candidates.length === 0) {
    return fallbackGroup(input, options);
  }

  const generate =
    options.generate ??
    (env.mockMode || !env.geminiApiKey ? undefined : generateWithGemini);
  if (!generate) {
    return fallbackGroup(input, options);
  }

  try {
    const text = await withTimeout(
      (signal) => generate(buildPrompt(input, options), signal),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const parsed = modelOutputSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(`model output failed validation: ${parsed.error.message}`);
    }
    const group = sanitizeModelGroup(input, parsed.data, options);
    if (!group) {
      throw new Error('model returned no known candidate ids');
    }
    return group;
  } catch (error) {
    console.warn(
      'formGroups fallback:',
      error instanceof Error ? error.message : error,
    );
    return fallbackGroup(input, options);
  }
}
