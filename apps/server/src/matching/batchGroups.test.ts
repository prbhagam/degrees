// Owner: Sahith (Data & Matching) — run: npx tsx apps/server/src/matching/batchGroups.test.ts (no network).
import assert from 'node:assert/strict';
import type { UpdatePreferencesRequest } from '@degrees/shared';
import {
  acceptGroup,
  buildBatchGraph,
  chunkGraph,
  compatible,
  fillUncovered,
  formBatchGroups,
  MAX_GROUPS_PER_USER,
  newBatchState,
  type BatchGraph,
  type BatchPerson,
  type DirectionalScore,
} from './batchGroups.js';

let failures = 0;
async function test(name: string, run: () => Promise<void> | void) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}\n`, error);
  }
}

const PREFS: UpdatePreferencesRequest = {
  costMinCents: 0,
  costMaxCents: 5000,
  maxTravelMi: 10,
  frequency: 'weekly',
  groupSizeMin: 3,
  groupSizeMax: 5,
  maxDegrees: 2,
};

const person = (id: string, interests: string[] = ['coffee']): BatchPerson => ({
  id,
  name: `Person ${id.toUpperCase()}`,
  interests,
  prefs: PREFS,
});

// Symmetric directional scores from an edge list [a, b, score, degree].
function graphFrom(ids: string[], edges: [string, string, number, number?][]): BatchGraph {
  const directional = new Map<string, DirectionalScore[]>(ids.map((id) => [id, []]));
  for (const [a, b, score, degree = 2] of edges) {
    directional.get(a)!.push({ id: b, degree, score, meetAgainScore: 0 });
    directional.get(b)!.push({ id: a, degree, score, meetAgainScore: 0 });
  }
  return buildBatchGraph(ids.map((id) => person(id)), directional);
}

// Everyone compatible with everyone.
function clique(n: number, prefix = 'u'): { ids: string[]; graph: BatchGraph } {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
  const edges: [string, string, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([ids[i]!, ids[j]!, 0.5 + ((i * j) % 5) / 10, j === i + 1 ? 1 : 2]);
  return { ids, graph: graphFrom(ids, edges) };
}

await test('a pair is compatible only when both sides ranked each other', () => {
  const directional = new Map<string, DirectionalScore[]>([
    ['a', [{ id: 'b', degree: 1, score: 0.8, meetAgainScore: 0 }, { id: 'c', degree: 2, score: 0.4, meetAgainScore: 0 }]],
    ['b', [{ id: 'a', degree: 1, score: 0.6, meetAgainScore: 1 }]],
    ['c', []], // c's own degree limit / budget ruled a out
  ]);
  const graph = buildBatchGraph([person('a'), person('b'), person('c')], directional);
  assert.equal(compatible(graph, 'a', 'b'), true);
  assert.equal(compatible(graph, 'a', 'c'), false);
  const pair = graph.pairs.get('a|b')!;
  assert.equal(pair.affinity, 0.7);
  assert.equal(pair.meetAgain, 1);
});

await test('chunks split components and cap size; isolated people are left out', () => {
  const { graph } = clique(70);
  const chunks = chunkGraph(graph, 30);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((c) => c.length <= 30));
  assert.equal(new Set(chunks.flat()).size, 70);

  const small = graphFrom(['a', 'b', 'c', 'd', 'z'], [['a', 'b', 0.5], ['c', 'd', 0.5]]);
  const smallChunks = chunkGraph(small, 30);
  assert.equal(smallChunks.length, 2);
  assert.ok(!smallChunks.flat().includes('z'));
});

await test('referee drops incompatible members, unknown ids, and duplicate groups', () => {
  const graph = graphFrom(['a', 'b', 'c', 'd'], [['a', 'b', 0.9], ['a', 'c', 0.8], ['b', 'c', 0.7], ['a', 'd', 0.6]]);
  const state = newBatchState();
  const group = acceptGroup(['a', 'b', 'c', 'd', 'ghost'], 'You all love coffee.', graph, state, 'ai');
  assert.deepEqual(group?.memberIds, ['a', 'b', 'c']); // d conflicts with b and c
  assert.notEqual(group?.reasoning, 'You all love coffee.'); // selection changed → deterministic text
  assert.equal(acceptGroup(['c', 'b', 'a'], 'Again.', graph, state, 'ai'), null);
});

await test('referee keeps clean model reasoning but rejects text that names a member', () => {
  const graph = graphFrom(['a', 'b', 'c'], [['a', 'b', 0.9], ['a', 'c', 0.8], ['b', 'c', 0.7]]);
  const state = newBatchState();
  assert.equal(acceptGroup(['a', 'b'], 'You all love coffee.', graph, state, 'ai')?.reasoning, 'You all love coffee.');
  const named = acceptGroup(['a', 'c'], 'Person C loves coffee too.', graph, state, 'ai');
  assert.ok(named && !/person c/i.test(named.reasoning));
});

await test('a group where everyone has met gains a compatible friend of a friend', () => {
  // a, b, c all know each other (degree 1); d is compatible with all three but has met none of them.
  const graph = graphFrom(['a', 'b', 'c', 'd'], [
    ['a', 'b', 0.9, 1], ['a', 'c', 0.9, 1], ['b', 'c', 0.9, 1],
    ['d', 'a', 0.4, 2], ['d', 'b', 0.4, 2], ['d', 'c', 0.4, 2],
  ]);
  const group = acceptGroup(['a', 'b', 'c'], 'You all love coffee.', graph, newBatchState(), 'ai');
  assert.deepEqual(group?.memberIds, ['a', 'b', 'c', 'd']);
});

await test('nobody ends up in more than 3 groups, even if the model asks for more', async () => {
  const { ids, graph } = clique(8);
  const hub = ids[0]!;
  const others = ids.slice(1);
  const response = JSON.stringify({
    groups: others.map((_, i) => ({ members: ['p1', `p${i + 2}`, `p${((i + 1) % others.length) + 2}`], reasoning: 'You all like coffee.' })),
  });
  const result = await formBatchGroups(graph, { useAi: true, generate: async () => response });
  const count = result.groups.filter((g) => g.memberIds.includes(hub)).length;
  assert.equal(count, MAX_GROUPS_PER_USER);
  for (const id of ids) {
    const n = result.groups.filter((g) => g.memberIds.includes(id)).length;
    assert.ok(n >= 1 && n <= MAX_GROUPS_PER_USER, `${id} has ${n} groups`);
  }
});

await test('one AI call per chunk, not per user', async () => {
  const { graph } = clique(60);
  let calls = 0;
  const result = await formBatchGroups(graph, {
    useAi: true,
    maxChunk: 30,
    generate: async () => {
      calls += 1;
      return JSON.stringify({ groups: [] });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.aiCalls, 2);
});

await test('AI failure falls back to deterministic groups covering every compatible person', async () => {
  const { ids, graph } = clique(20);
  const isolatedGraph = graphFrom([...ids, 'loner'], [...graph.pairs.keys()].map((k) => {
    const [a, b] = k.split('|') as [string, string];
    return [a, b, graph.pairs.get(k)!.affinity, graph.pairs.get(k)!.degree] as [string, string, number, number];
  }));
  const result = await formBatchGroups(isolatedGraph, {
    useAi: true,
    generate: async () => {
      throw new Error('503');
    },
  });
  assert.equal(result.aiCalls, 2); // Lite, then Flash, for the one chunk
  assert.ok(result.groups.every((g) => g.source === 'fallback'));
  const counts = ids.map((id) => result.groups.filter((g) => g.memberIds.includes(id)).length);
  assert.ok(counts.every((n) => n >= 1 && n <= MAX_GROUPS_PER_USER), counts.join(','));
  // The busy penalty spreads the fill: most people get exactly one group, nobody is dragged into every one.
  assert.ok(counts.filter((n) => n === 1).length >= ids.length * 0.8, counts.join(','));
  assert.deepEqual(result.isolated, ['loner']);
  for (const group of result.groups) {
    for (const a of group.memberIds) for (const b of group.memberIds) if (a !== b) assert.ok(compatible(isolatedGraph, a, b));
  }
});

await test('fill joins an existing group when a new one would be too small', () => {
  // d fits a, b, c only; a–b–c is already a group, and d can't form a 3-person group of its own.
  const graph = graphFrom(['a', 'b', 'c', 'd'], [['a', 'b', 0.9], ['a', 'c', 0.9], ['b', 'c', 0.9], ['d', 'a', 0.5], ['d', 'b', 0.5], ['d', 'c', 0.5]]);
  const state = newBatchState();
  acceptGroup(['a', 'b', 'c'], '', graph, state, 'ai');
  state.counts.set('a', 3);
  state.counts.set('b', 3);
  const unplaced = fillUncovered(['a', 'b', 'c', 'd'], graph, state);
  assert.deepEqual(unplaced, []);
  assert.deepEqual(state.groups[0]!.memberIds, ['a', 'b', 'c', 'd']);
});

await test("someone whose only fit is at the cap still gets a group (the fit gives up their largest group)", () => {
  // hub fits everyone; x fits only hub. The model already put hub in 3 groups.
  const ids = ['hub', 'a', 'b', 'c', 'd', 'e', 'f', 'x'];
  const edges: [string, string, number, number?][] = [['x', 'hub', 0.5]];
  for (const id of ids.slice(1, 7)) edges.push(['hub', id, 0.9]);
  edges.push(['a', 'b', 0.8], ['c', 'd', 0.8], ['e', 'f', 0.8], ['a', 'c', 0.7]);
  const graph = graphFrom(ids, edges);
  const state = newBatchState();
  acceptGroup(['hub', 'a', 'b'], '', graph, state, 'ai');
  acceptGroup(['hub', 'c', 'd'], '', graph, state, 'ai');
  acceptGroup(['hub', 'e', 'f'], '', graph, state, 'ai');
  const unplaced = fillUncovered(ids, graph, state);
  assert.deepEqual(unplaced, []);
  assert.ok(state.groups.some((g) => g.memberIds.includes('x') && g.memberIds.includes('hub')));
  assert.ok(state.groups.filter((g) => g.memberIds.includes('hub')).length <= MAX_GROUPS_PER_USER);
  assert.ok(state.groups.every((g) => g.memberIds.length >= 2));
});

await test('no AI (mock / no key) still places everyone compatible', async () => {
  const { ids, graph } = clique(9);
  const result = await formBatchGroups(graph, { useAi: false });
  assert.equal(result.aiCalls, 0);
  for (const id of ids) assert.ok(result.groups.some((g) => g.memberIds.includes(id)), id);
});

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all batchGroups tests passed');
