// Owner: Sahith (Data & Matching) — added Sep 26: global group formation for the admin batch run.
//
// The batch run used to call formGroups up to 3 times PER USER (each with a Lite → Flash retry), so 60 users cost
// ~180 Gemini calls, took minutes, and never fit Netlify's 10s limit. It also had no cap on how many *other*
// people's groups one person landed in. This module forms every group for the whole network at once instead:
//
//   1. buildBatchGraph   — who may be grouped with whom: a pair is compatible only if EACH side's narrow() kept the
//                          other (inside both people's max degrees, budgets overlap, within both travel radii, no
//                          "not for me" either way). Affinity = mean of the two directional stage-2 scores.
//   2. chunkGraph        — connected components, split to ≤ maxChunk people. One Gemini call per chunk.
//   3. proposeBatchGroups— the model sees each person's interests + group size and their compatible pairs, and
//                          returns ALL groups for the chunk in one response.
//   4. acceptGroup       — deterministic referee: known ids only, every pair compatible, nobody over
//                          MAX_GROUPS_PER_USER, no duplicate member sets, viewer-neutral reasoning.
//   5. fillUncovered     — anyone still without a group gets one greedy best-affinity group (no AI). This is also the
//                          whole fallback when Gemini fails, so a run never hard-fails and never needs more calls.
import { ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import type { UpdatePreferencesRequest } from '@degrees/shared';
import { FLASH_LITE_MODEL, FLASH_MODEL, getAiClient } from '../ai/client.js';
import { log } from '../lib/log.js';
import { ABSOLUTE_MAX_GROUP, withTimeout } from './formGroups.js';

export const MAX_GROUPS_PER_USER = 3;
// A group is at least two people; group size above that is soft (members' ranges are guidance for the model).
export const MIN_GROUP = 2;
// People per Gemini call. 60 people ≈ 30 groups of output, which Lite can't reliably return inside the ~6s the
// 10s Netlify limit leaves after the DB work; 30 people per call keeps a 60-user run at 2 parallel calls.
export const DEFAULT_MAX_CHUNK = 30;

const ATTEMPTS = [
  { model: FLASH_LITE_MODEL, timeoutMs: 6000 },
  { model: FLASH_MODEL, timeoutMs: 6000 },
] as const;
// Don't start an attempt with less time than this left before the deadline.
const MIN_ATTEMPT_MS = 1500;

export interface BatchPerson {
  id: string;
  name: string;
  interests: string[];
  prefs: UpdatePreferencesRequest;
}

// One row of a person's narrow() output, as far as the batch needs it.
export interface DirectionalScore {
  id: string;
  degree: number;
  score: number;
  meetAgainScore: number;
}

export interface PairInfo {
  affinity: number;
  // Hops between the two (1 = they've met).
  degree: number;
  meetAgain: number;
}

export interface BatchGraph {
  people: Map<string, BatchPerson>;
  pairs: Map<string, PairInfo>;
  neighbors: Map<string, Set<string>>;
}

export interface BatchGroup {
  memberIds: string[];
  reasoning: string;
  source: 'ai' | 'fallback';
}

// Per-run bookkeeping shared by every chunk: groups per person, and member sets already taken (this run's groups
// plus open groups from earlier runs, so a run never re-proposes a group someone already has).
export interface BatchState {
  counts: Map<string, number>;
  seen: Set<string>;
  groups: BatchGroup[];
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const groupKey = (ids: string[]) => [...ids].sort().join(':');

export function newBatchState(existingGroupKeys: Iterable<string> = []): BatchState {
  return { counts: new Map(), seen: new Set(existingGroupKeys), groups: [] };
}

export function buildBatchGraph(
  people: BatchPerson[],
  directional: Map<string, DirectionalScore[]>,
): BatchGraph {
  const byId = new Map(people.map((p) => [p.id, p]));
  const lookup = new Map<string, Map<string, DirectionalScore>>();
  for (const [from, rows] of directional) {
    lookup.set(from, new Map(rows.filter((r) => byId.has(r.id)).map((r) => [r.id, r])));
  }

  const pairs = new Map<string, PairInfo>();
  const neighbors = new Map<string, Set<string>>(people.map((p) => [p.id, new Set<string>()]));
  for (const [a, rowsA] of lookup) {
    if (!byId.has(a)) continue;
    for (const [b, ab] of rowsA) {
      if (a >= b) continue;
      const ba = lookup.get(b)?.get(a);
      // Mutual only: each person's own degree limit, budget, travel radius, and feedback have to allow the other.
      if (!ba) continue;
      pairs.set(pairKey(a, b), {
        affinity: (ab.score + ba.score) / 2,
        degree: Math.min(ab.degree, ba.degree),
        meetAgain: Math.max(ab.meetAgainScore, ba.meetAgainScore),
      });
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
  }
  return { people: byId, pairs, neighbors };
}

export const compatible = (graph: BatchGraph, a: string, b: string) => graph.pairs.has(pairKey(a, b));

// Connected components of the compatibility graph (isolated people excluded), each split to ≤ maxChunk people.
// Oversized components are carved greedily: seed with the least-connected remaining person, then keep adding the
// remaining person with the most affinity into the chunk, so tight clusters land in the same call.
export function chunkGraph(graph: BatchGraph, maxChunk = DEFAULT_MAX_CHUNK): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of [...graph.people.keys()].sort()) {
    if (visited.has(id) || (graph.neighbors.get(id)?.size ?? 0) === 0) continue;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const next of graph.neighbors.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(component);
  }

  const chunks: string[][] = [];
  for (const component of components) {
    if (component.length <= maxChunk) {
      chunks.push(component);
      continue;
    }
    const remaining = new Set(component);
    const liveDegree = (id: string) => [...(graph.neighbors.get(id) ?? [])].filter((n) => remaining.has(n)).length;
    while (remaining.size > 0) {
      const seed = [...remaining].sort((a, b) => liveDegree(a) - liveDegree(b) || a.localeCompare(b))[0]!;
      const chunk = [seed];
      remaining.delete(seed);
      const pull = new Map<string, number>();
      const absorb = (id: string) => {
        for (const n of graph.neighbors.get(id) ?? []) {
          if (remaining.has(n)) pull.set(n, (pull.get(n) ?? 0) + graph.pairs.get(pairKey(id, n))!.affinity);
        }
      };
      absorb(seed);
      while (chunk.length < maxChunk && pull.size > 0) {
        const [next] = [...pull.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
        pull.delete(next);
        chunk.push(next);
        remaining.delete(next);
        absorb(next);
      }
      chunks.push(chunk);
    }
  }
  return chunks;
}

// ---- reasoning --------------------------------------------------------------------------------------------------

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

// The group's "why" is stored once and read by every member, so batch reasoning is written to the whole group and
// names nobody (lib/groups.ts redactReasoning would scrub unmet names anyway, leaving holes in the sentence).
export function batchReasoning(memberIds: string[], graph: BatchGraph): string {
  const counts = new Map<string, { label: string; count: number }>();
  for (const id of memberIds) {
    for (const label of new Set((graph.people.get(id)?.interests ?? []).map((l) => l.toLowerCase()))) {
      const entry = counts.get(label) ?? { label, count: 0 };
      entry.count += 1;
      counts.set(label, entry);
    }
  }
  const shared = [...counts.values()]
    .filter(({ count }) => count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3);

  let met = 0;
  let fresh = 0;
  let again = false;
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const pair = graph.pairs.get(pairKey(memberIds[i]!, memberIds[j]!));
      if (!pair) continue;
      if (pair.degree <= 1) met += 1;
      else fresh += 1;
      if (pair.meetAgain > 0) again = true;
    }
  }

  const sentences: string[] = [];
  if (fresh === 0) sentences.push("You've all met before, so this one's a proper hangout.");
  else if (met === 0) sentences.push("None of you have met yet, but you're all friends of friends.");
  else sentences.push('Some of you already know each other, and the rest are friends of friends.');
  if (shared.length > 0 && shared[0]!.count === memberIds.length) {
    sentences.push(`You're all into ${joinList(shared.filter((s) => s.count === memberIds.length).map((s) => s.label))}.`);
  } else if (shared.length > 0) {
    sentences.push(`Common ground: ${joinList(shared.map((s) => s.label))}.`);
  } else {
    sentences.push('Your budgets and travel line up.');
  }
  if (again) sentences.push('A couple of you said you’d hang out again.');
  return sentences.join(' ');
}

// Does the text name any member? Full name or first name (3+ letters), whole word.
function namesAMember(reasoning: string, memberIds: string[], graph: BatchGraph): boolean {
  const lower = reasoning.toLowerCase();
  return memberIds.some((id) => {
    const full = (graph.people.get(id)?.name ?? '').trim().toLowerCase();
    const first = full.split(/\s+/)[0] ?? '';
    const hit = (value: string) =>
      value.length >= 3 && new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower);
    return hit(full) || hit(first);
  });
}

// ---- the referee ------------------------------------------------------------------------------------------------

// Validates one proposed group against the run state and records it. Returns the accepted group or null.
export function acceptGroup(
  proposedIds: string[],
  proposedReasoning: string,
  graph: BatchGraph,
  state: BatchState,
  source: BatchGroup['source'],
  allowed?: Set<string>,
): BatchGroup | null {
  const unique = [...new Set(proposedIds)].filter((id) => graph.people.has(id) && (!allowed || allowed.has(id)));
  let changed = unique.length !== proposedIds.length;

  let ids = unique.filter((id) => (state.counts.get(id) ?? 0) < MAX_GROUPS_PER_USER);
  if (ids.length !== unique.length) changed = true;

  // Every pair must be compatible. Drop the member with the most conflicts (then the weakest total affinity) until
  // none remain — cheaper and more predictable than asking the model again.
  for (;;) {
    const conflicts = ids.map((id) => ids.filter((other) => other !== id && !compatible(graph, id, other)).length);
    if (conflicts.every((c) => c === 0)) break;
    const strength = (id: string) =>
      ids.reduce((sum, other) => sum + (graph.pairs.get(pairKey(id, other))?.affinity ?? 0), 0);
    let worst = 0;
    for (let i = 1; i < ids.length; i++) {
      if (
        conflicts[i]! > conflicts[worst]! ||
        (conflicts[i] === conflicts[worst] && strength(ids[i]!) < strength(ids[worst]!))
      ) {
        worst = i;
      }
    }
    ids = ids.filter((_, i) => i !== worst);
    changed = true;
  }

  if (ids.length > ABSOLUTE_MAX_GROUP) {
    ids = ids.slice(0, ABSOLUTE_MAX_GROUP);
    changed = true;
  }
  if (ids.length < MIN_GROUP) return null;

  // Meeting friends of friends is the product (same rule as formGroups): if everyone here has already met, bring in
  // the best-fitting person who's compatible with all of them and new to at least one.
  const allMet = ids.every((a, i) => ids.slice(i + 1).every((b) => (graph.pairs.get(pairKey(a, b))?.degree ?? 1) <= 1));
  if (allMet && ids.length < ABSOLUTE_MAX_GROUP) {
    const bridge = [...(graph.neighbors.get(ids[0]!) ?? [])]
      .filter(
        (id) =>
          !ids.includes(id) &&
          (!allowed || allowed.has(id)) &&
          (state.counts.get(id) ?? 0) < MAX_GROUPS_PER_USER &&
          ids.every((m) => compatible(graph, id, m)) &&
          ids.some((m) => graph.pairs.get(pairKey(id, m))!.degree >= 2),
      )
      .sort((a, b) => avgAffinity(graph, b, ids) - avgAffinity(graph, a, ids) || a.localeCompare(b))[0];
    if (bridge) {
      ids = [...ids, bridge];
      changed = true;
    }
  }
  const key = groupKey(ids);
  if (state.seen.has(key)) return null;

  const reasoning = proposedReasoning.trim();
  const group: BatchGroup = {
    memberIds: ids,
    reasoning:
      changed || !reasoning || reasoning.length > 280 || namesAMember(reasoning, ids, graph)
        ? batchReasoning(ids, graph)
        : reasoning,
    source,
  };
  state.seen.add(key);
  for (const id of ids) state.counts.set(id, (state.counts.get(id) ?? 0) + 1);
  state.groups.push(group);
  return group;
}

function avgAffinity(graph: BatchGraph, id: string, members: string[]): number {
  if (members.length === 0) return 0;
  return members.reduce((sum, m) => sum + (graph.pairs.get(pairKey(id, m))?.affinity ?? 0), 0) / members.length;
}

// Each group a candidate already has costs this much affinity in the greedy fill, so filling one person's gap
// doesn't keep dragging the same best-liked people into every fallback group (they'd hit the cap and crowd others).
const FILL_BUSY_PENALTY = 0.2;

// Greedy: start from `userId`, add whoever raises the group's affinity most (minus the busy penalty) while staying
// compatible with everyone already in it, until the user's preferred size (at least 3).
function greedyMembers(userId: string, graph: BatchGraph, state: BatchState): string[] {
  const person = graph.people.get(userId)!;
  const target = Math.min(
    Math.max(person.prefs.groupSizeMin, 3),
    Math.max(person.prefs.groupSizeMax, 3),
    ABSOLUTE_MAX_GROUP,
  );
  const members = [userId];
  const pool = [...(graph.neighbors.get(userId) ?? [])].filter(
    (id) => (state.counts.get(id) ?? 0) < MAX_GROUPS_PER_USER,
  );
  while (members.length < target) {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of pool) {
      if (members.includes(id) || !members.every((m) => compatible(graph, id, m))) continue;
      const score = avgAffinity(graph, id, members) - FILL_BUSY_PENALTY * (state.counts.get(id) ?? 0);
      if (score > bestScore || (score === bestScore && best !== null && id < best)) {
        best = id;
        bestScore = score;
      }
    }
    if (!best) break;
    members.push(best);
  }
  return members;
}

// Someone whose every fit is already at the cap (typically: their only fit is a popular person the model put in 3
// groups) would get nothing. Their need beats a popular person's 3rd group: take that person out of their largest
// group (which must keep ≥ MIN_GROUP members) so the two can be grouped. Returns true if a slot was freed.
function freeSlotFor(userId: string, graph: BatchGraph, state: BatchState): boolean {
  const full = [...(graph.neighbors.get(userId) ?? [])]
    .filter((id) => (state.counts.get(id) ?? 0) >= MAX_GROUPS_PER_USER)
    .sort((a, b) => graph.pairs.get(pairKey(userId, b))!.affinity - graph.pairs.get(pairKey(userId, a))!.affinity);
  for (const id of full) {
    const donor = state.groups
      .filter((g) => g.memberIds.includes(id) && g.memberIds.length - 1 >= MIN_GROUP)
      .filter((g) => !state.seen.has(groupKey(g.memberIds.filter((m) => m !== id))))
      .sort((a, b) => b.memberIds.length - a.memberIds.length)[0];
    if (!donor) continue;
    state.seen.delete(groupKey(donor.memberIds));
    donor.memberIds = donor.memberIds.filter((m) => m !== id);
    donor.reasoning = batchReasoning(donor.memberIds, graph);
    state.seen.add(groupKey(donor.memberIds));
    state.counts.set(id, (state.counts.get(id) ?? 1) - 1);
    return true;
  }
  return false;
}

// Gives everyone in `userIds` who still has no group exactly one, without AI. Hardest-to-place people go first.
// Prefers a new group of 3+; otherwise joins the best-fitting group from this run (compatible with every member,
// under its size cap); otherwise settles for a pair; as a last resort frees a slot (freeSlotFor) and retries.
// Returns the ids that could not be placed.
export function fillUncovered(userIds: string[], graph: BatchGraph, state: BatchState): string[] {
  const unplaced: string[] = [];
  const open = (id: string) =>
    [...(graph.neighbors.get(id) ?? [])].filter((n) => (state.counts.get(n) ?? 0) < MAX_GROUPS_PER_USER).length;
  const queue = userIds
    .filter((id) => graph.people.has(id) && (state.counts.get(id) ?? 0) === 0)
    .sort((a, b) => open(a) - open(b) || a.localeCompare(b));

  for (const userId of queue) {
    if ((state.counts.get(userId) ?? 0) > 0) continue; // placed as someone else's pick earlier in this loop
    const members = greedyMembers(userId, graph, state);
    if (members.length >= 3 && acceptGroup(members, '', graph, state, 'fallback')) continue;

    const joinable = state.groups
      .filter((g) => {
        if (g.memberIds.includes(userId) || g.memberIds.length >= ABSOLUTE_MAX_GROUP) return false;
        const cap = Math.max(...g.memberIds.map((id) => graph.people.get(id)?.prefs.groupSizeMax ?? 0), 3);
        return g.memberIds.length < cap && g.memberIds.every((m) => compatible(graph, userId, m));
      })
      .sort((a, b) => avgAffinity(graph, userId, b.memberIds) - avgAffinity(graph, userId, a.memberIds))[0];
    if (joinable) {
      const oldKey = groupKey(joinable.memberIds);
      const next = [...joinable.memberIds, userId];
      if (!state.seen.has(groupKey(next))) {
        state.seen.delete(oldKey);
        state.seen.add(groupKey(next));
        joinable.memberIds = next;
        joinable.reasoning = batchReasoning(next, graph);
        state.counts.set(userId, 1);
        continue;
      }
    }

    if (members.length >= MIN_GROUP && acceptGroup(members, '', graph, state, 'fallback')) continue;
    if (freeSlotFor(userId, graph, state)) {
      const retry = greedyMembers(userId, graph, state);
      if (retry.length >= MIN_GROUP && acceptGroup(retry, '', graph, state, 'fallback')) continue;
    }
    unplaced.push(userId);
  }
  return unplaced;
}

// ---- the AI call ------------------------------------------------------------------------------------------------

const modelOutputSchema = z.object({
  groups: z.array(z.object({ members: z.array(z.string()), reasoning: z.string().default('') })),
});

export type RawBatchGroups = z.infer<typeof modelOutputSchema>['groups'];

export interface ProposeOptions {
  // Epoch ms by which the call must finish; attempts that can't get MIN_ATTEMPT_MS are skipped.
  deadline?: number;
  // Test seam; defaults to Gemini. Must resolve to the raw JSON text.
  generate?: (prompt: string, signal: AbortSignal, model: string) => Promise<string>;
}

// Short aliases instead of UUIDs: fewer tokens and no mangled ids.
export function buildBatchPrompt(chunk: string[], graph: BatchGraph): { prompt: string; aliases: Map<string, string> } {
  const aliasOf = new Map(chunk.map((id, i) => [id, `p${i + 1}`]));
  const aliases = new Map([...aliasOf].map(([id, alias]) => [alias, id]));
  const inChunk = new Set(chunk);
  const people = chunk.map((id) => {
    const person = graph.people.get(id)!;
    const fits: Record<string, number> = {};
    const met: string[] = [];
    const again: string[] = [];
    const partners = [...(graph.neighbors.get(id) ?? [])]
      .filter((n) => inChunk.has(n))
      .sort((a, b) => graph.pairs.get(pairKey(id, b))!.affinity - graph.pairs.get(pairKey(id, a))!.affinity);
    for (const n of partners) {
      const pair = graph.pairs.get(pairKey(id, n))!;
      fits[aliasOf.get(n)!] = Number(pair.affinity.toFixed(2));
      if (pair.degree <= 1) met.push(aliasOf.get(n)!);
      if (pair.meetAgain > 0) again.push(aliasOf.get(n)!);
    }
    return {
      id: aliasOf.get(id)!,
      interests: person.interests.slice(0, 8),
      groupSize: [person.prefs.groupSizeMin, person.prefs.groupSizeMax],
      fits,
      ...(met.length > 0 ? { alreadyMet: met } : {}),
      ...(again.length > 0 ? { wantsToMeetAgain: again } : {}),
    };
  });

  const prompt = `You form small real-world hangout groups for Degrees, an app that gets friend groups offline.
Form ALL the groups for this set of ${chunk.length} people in one answer.

Each person lists "fits": the ONLY people they may be grouped with, each with a fit score (0 to ~1.5, higher is
better; it blends profile similarity and past feedback). Budget, distance, and how far into their network each
person allows are already applied — anyone missing from someone's "fits" must never share a group with them.
"alreadyMet" = they already know each other. "wantsToMeetAgain" = they hung out before and both want a rematch.
"groupSize" = the size range the person prefers, counting themselves.

People (JSON):
${JSON.stringify(people)}

Rules:
- HARD: every pair of members in a group must appear in each other's "fits".
- HARD: each person is in at most ${MAX_GROUPS_PER_USER} groups. Give everyone at least 1 group whenever their fits allow it.
- Give someone a 2nd or 3rd group ONLY when they have strong fits left over; one good group beats three weak ones.
- A person's groups should be meaningfully different people, never near-copies of each other.
- Aim for sizes inside members' groupSize ranges (soft); at least ${MIN_GROUP}, at most ${ABSOLUTE_MAX_GROUP}.
- Prefer high fit scores and wantsToMeetAgain pairs, shared interests, and a mix of people who've met and friends
  of friends who haven't — meeting new people through friends is the point of Degrees.
- Only use ids from the list.

Return JSON: {"groups": [{"members": ["p1", "p4", "p7"], "reasoning": string}]}. reasoning is ONE short sentence
(under 25 words) addressed to the whole group as "you all"/"you", about what they share. Never use names or ids.`;
  return { prompt, aliases };
}

async function generateWithGemini(prompt: string, signal: AbortSignal, model: string): Promise<string> {
  const response = await getAiClient().models.generateContent({
    model,
    contents: prompt,
    config: {
      abortSignal: signal,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          groups: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                members: { type: Type.ARRAY, items: { type: Type.STRING } },
                reasoning: { type: Type.STRING },
              },
              required: ['members', 'reasoning'],
            },
          },
        },
        required: ['groups'],
      },
    },
  });
  return response.text ?? '';
}

// One Gemini call for the whole chunk (Lite, then Flash if time allows). Resolves to member ids per group, or null
// when every attempt failed — the caller then relies on fillUncovered. Never throws.
export async function proposeBatchGroups(
  chunk: string[],
  graph: BatchGraph,
  options: ProposeOptions = {},
): Promise<{ groups: { memberIds: string[]; reasoning: string }[]; calls: number } | null> {
  const generate = options.generate ?? generateWithGemini;
  const { prompt, aliases } = buildBatchPrompt(chunk, graph);
  let calls = 0;
  for (const { model, timeoutMs } of ATTEMPTS) {
    const budget = Math.min(timeoutMs, (options.deadline ?? Infinity) - Date.now());
    if (budget < MIN_ATTEMPT_MS) break;
    calls += 1;
    try {
      const text = await withTimeout((signal) => generate(prompt, signal, model), budget);
      const parsed = modelOutputSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error(`model output failed validation: ${parsed.error.message}`);
      return {
        groups: parsed.data.groups.map((g) => ({
          memberIds: g.members.flatMap((alias) => {
            const id = aliases.get(alias.trim());
            return id ? [id] : [];
          }),
          reasoning: g.reasoning,
        })),
        calls,
      };
    } catch (error) {
      log.warn('batch_match.ai_attempt_failed', {
        model,
        chunkSize: chunk.length,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return calls > 0 ? { groups: [], calls } : null;
}

export interface FormBatchResult {
  groups: BatchGroup[];
  aiCalls: number;
  // Compatible people who still got no group (every fit already had 3 groups).
  unplaced: string[];
  // People with no compatible pair at all.
  isolated: string[];
}

// The whole batch: chunk, one AI call per chunk (in parallel), referee, then fill the gaps deterministically.
export async function formBatchGroups(
  graph: BatchGraph,
  options: ProposeOptions & { useAi: boolean; maxChunk?: number; existingGroupKeys?: Iterable<string> },
): Promise<FormBatchResult> {
  const state = newBatchState(options.existingGroupKeys);
  const chunks = chunkGraph(graph, options.maxChunk);
  const isolated = [...graph.people.keys()].filter((id) => (graph.neighbors.get(id)?.size ?? 0) === 0);

  let aiCalls = 0;
  if (options.useAi && chunks.length > 0) {
    const proposals = await Promise.all(chunks.map((chunk) => proposeBatchGroups(chunk, graph, options)));
    proposals.forEach((proposal, i) => {
      if (!proposal) return;
      aiCalls += proposal.calls;
      const allowed = new Set(chunks[i]);
      for (const group of proposal.groups) {
        acceptGroup(group.memberIds, group.reasoning, graph, state, 'ai', allowed);
      }
    });
  }

  const unplaced = fillUncovered(chunks.flat(), graph, state);
  return { groups: state.groups, aiCalls, unplaced, isolated };
}
