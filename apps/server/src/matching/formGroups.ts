// Owner: Sahith (Data & Matching) — see docs/ROLES.md.
import { ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import { MATCHED_GROUP_MAX, type FormGroupsInput, type FormGroupsOutput } from '@degrees/shared';
import { FLASH_LITE_MODEL, FLASH_MODEL, getAiClient } from '../ai/client.js';
import { env } from '../config/env.js';

// Group size is soft, but never let a model response balloon a group past this.
// Wave 6: the value lives in @degrees/shared so the preferences screen's size presets stop where this does.
export const ABSOLUTE_MAX_GROUP = MATCHED_GROUP_MAX;
// Lite first (~1s response) to avoid Netlify function timeouts, then Flash with fallback to deterministic score.
const ATTEMPTS = [
  { model: FLASH_LITE_MODEL, timeoutMs: 2500 },
  { model: FLASH_MODEL, timeoutMs: 3000 },
] as const;

export interface FormGroupsOptions {
  requesterName?: string;
  requesterInterests?: string[];
  // Candidate id → display names along the path, requester excluded, candidate last.
  paths?: Record<string, string[]>;
  // Candidate id → stage-2 signals. Without these the model only knows the list order and ignores feedback.
  signals?: Record<string, { score: number; meetAgain: number }>;
  // Per-attempt timeout override (tests).
  timeoutMs?: number;
  // Test seam; defaults to Gemini. Called once per attempt (Flash, then Lite). Must resolve to the raw JSON text.
  generate?: (prompt: string, signal: AbortSignal, model: string) => Promise<string>;
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

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);

// CHANGED Sep 26 (wave 4): describes the group's SHAPE instead of one path. "You and Maya both know Alex, and the
// group shares an interest in coffee" said nothing about the other four people. Now: who you already know, how
// many are new and through whom (only 1st-degree connectors are named — a degree-2+ member is never named,
// because the requester hasn't met them and the group view hides them), what everyone shares, and who wants a
// rematch.
export function deterministicReasoning(
  input: FormGroupsInput,
  memberIds: string[],
  options: FormGroupsOptions = {},
): string {
  const others = memberIds
    .filter((id) => id !== input.requesterId)
    .flatMap((id) => input.candidates.filter((c) => c.id === id));
  if (others.length === 0) {
    return 'No one in your network is a match yet.';
  }
  const known = others.filter((c) => c.degree <= 1);
  const fresh = others.filter((c) => c.degree >= 2);
  const sentences: string[] = [];

  if (known.length > 0) {
    sentences.push(`You already know ${joinList(known.map((c) => c.displayName))}.`);
  }

  if (fresh.length > 0) {
    // Group the new people by the 1st-degree person who links you to them (the first name on their path).
    const via = new Map<string, number>();
    let unlinked = 0;
    for (const c of fresh) {
      const connector = options.paths?.[c.id]?.[0];
      if (connector && (options.paths?.[c.id]?.length ?? 0) >= 2) via.set(connector, (via.get(connector) ?? 0) + 1);
      else unlinked += 1;
    }
    const parts = [...via.entries()].map(([name, n]) => `${countWord(n)} through ${name}`);
    if (unlinked > 0 && parts.length > 0) parts.push(`${countWord(unlinked)} further out`);
    const who = `${countWord(fresh.length).replace(/^\w/, (ch) => ch.toUpperCase())} ${fresh.length === 1 ? 'person is' : 'people are'} new to you`;
    if (parts.length === 0) {
      sentences.push(`${who} — friends of friends.`);
    } else if (via.size === 1 && unlinked === 0) {
      const [name] = [...via.keys()];
      sentences.push(`${who}, ${fresh.length === 1 ? '' : fresh.length === 2 ? 'both ' : 'all '}through ${name}.`);
    } else {
      sentences.push(`${who} — ${joinList(parts)}.`);
    }
  }

  const shared = sharedInterests(input, memberIds, options).slice(0, 3);
  sentences.push(
    shared.length > 0
      ? `Everyone here is into ${joinList(shared)}.`
      : 'Your plans and budgets line up.',
  );

  // Past "would meet again" feedback is the demo's "matching improved" beat, so say it when it drove the pick.
  // Only people you've actually met can have said it, so naming them is safe.
  const again = known
    .filter((c) => (options.signals?.[c.id]?.meetAgain ?? 0) > 0)
    .map((c) => c.displayName);
  if (again.length > 0) {
    sentences.push(`${joinList(again)} ${again.length === 1 ? 'wants' : 'want'} to hang out with you again.`);
  }
  return sentences.join(' ');
}

// Does the text name anyone the requester hasn't met? Full name or first name (3+ letters), whole word.
export function namesUnmetMember(reasoning: string, input: FormGroupsInput, memberIds: string[]): boolean {
  const lower = reasoning.toLowerCase();
  return input.candidates
    .filter((c) => memberIds.includes(c.id) && c.degree >= 2)
    .some((c) => {
      const full = c.displayName.trim().toLowerCase();
      const first = full.split(/\s+/)[0] ?? '';
      const hit = (value: string) => value.length >= 3 && new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower);
      return hit(full) || hit(first);
    });
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

  // Degrees of separation is the product: if the model left out every friend-of-a-friend while one is available,
  // swap in the best-scoring one (candidates arrive score-ordered) so the group can show a real path.
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const distant = (id: string) => (byId.get(id)?.degree ?? 0) >= 2;
  if (!valid.some(distant)) {
    const bridge = input.candidates.find(
      (c) => known.has(c.id) && c.degree >= 2 && !valid.includes(c.id),
    );
    if (bridge) {
      const { max } = attainableRange(input);
      if (valid.length + 1 >= max) valid.pop();
      valid.push(bridge.id);
      changed = true;
    }
  }

  const memberIds = [input.requesterId, ...valid];
  const reasoning = raw.reasoning.trim();
  // The reasoning must name how you're connected: someone on a friend-of-a-friend's path, besides that person.
  const namesPath = valid.filter(distant).some((id) =>
    (options.paths?.[id] ?? [])
      .slice(0, -1)
      .some((name) => reasoning.toLowerCase().includes(name.toLowerCase())),
  );
  if (valid.some(distant) && options.paths && !namesPath) {
    changed = true;
  }
  // Wave 4: never show the requester a name they're not allowed to see yet.
  if (namesUnmetMember(reasoning, input, memberIds)) {
    changed = true;
  }
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
- If any candidate has degree 2 or more, include at least one of them: meeting friends of friends is the point of
  Degrees. Otherwise prefer shared interests and a mix of people the requester knows and friends of friends.
- Respect everyone's budget, travel radius, frequency, and group size softly.
- Only use ids from the candidate list.

Return JSON: {"memberIds": string[], "reasoning": string}. reasoning is two or three short sentences in second
person, shown to the requester, describing the SHAPE of the group:
- who they already know (degree 1 — name them),
- how many people are new to them and through whom, e.g. "Three people are new to you — two through Maya, one
  through Chris" (name only the degree-1 connector from connectionPath, NEVER the degree-2+ person themselves:
  the requester hasn't met them and their name is hidden in the app),
- what the whole group shares (interests, budget, or pace),
- and, if it drove the pick, who wants to hang out again.`;
}

async function generateWithGemini(
  prompt: string,
  signal: AbortSignal,
  model: string,
): Promise<string> {
  const response = await getAiClient().models.generateContent({
    model,
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

export async function withTimeout(
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

  const prompt = buildPrompt(input, options);
  for (const { model, timeoutMs } of ATTEMPTS) {
    try {
      const text = await withTimeout(
        (signal) => generate(prompt, signal, model),
        options.timeoutMs ?? timeoutMs,
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
        `formGroups ${model} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  console.warn('formGroups fallback: every model failed; using top-N by score');
  return fallbackGroup(input, options);
}
