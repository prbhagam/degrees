// Owner: Sahith (Data & Matching) — run: npx tsx apps/server/src/matching/formGroups.test.ts (no network).
import assert from 'node:assert/strict';
import type { FormGroupsInput, UpdatePreferencesRequest } from '@degrees/shared';
import { ABSOLUTE_MAX_GROUP, fallbackGroup, formGroups } from './formGroups.js';
import { mapNarrowRow } from './narrow.js';

const prefs: UpdatePreferencesRequest = {
  costMinCents: 0,
  costMaxCents: 4000,
  maxTravelMi: 10,
  frequency: 'weekly',
  groupSizeMin: 3,
  groupSizeMax: 5,
  maxDegrees: 3,
};

const people = ['Alex', 'Priya', 'Maya', 'Sam', 'Zoe', 'Leo', 'Nina', 'Ethan', 'Noah', 'Sofia'];
const input: FormGroupsInput = {
  requesterId: 'me',
  candidates: people.map((name, index) => ({
    id: `c${index}`,
    displayName: name,
    degree: index < 2 ? 1 : index < 6 ? 2 : 3,
    interests: index % 2 === 0 ? ['coffee', 'design'] : ['soccer'],
    prefs,
  })),
  sizeRange: { min: 3, max: 5 },
};
const paths: Record<string, string[]> = Object.fromEntries(
  input.candidates.map((c, index) => [
    c.id,
    c.degree === 1 ? [c.displayName] : c.degree === 2 ? ['Alex', c.displayName] : ['Alex', 'Maya', c.displayName],
  ]),
);
const options = { requesterName: 'Avery', requesterInterests: ['Coffee'], paths, timeoutMs: 50 };
const reply = (value: unknown) => async () => JSON.stringify(value);

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

const silence = console.warn;
console.warn = () => {};

await test('fallback takes requester + top (max - 1) candidates in rank order', () => {
  const group = fallbackGroup(input, options);
  assert.deepEqual(group.memberIds, ['me', 'c0', 'c1', 'c2', 'c3']);
});

await test('fallback reasoning names a degree-2 path and shared interests', () => {
  const { reasoning } = fallbackGroup(input, options);
  assert.equal(reasoning, 'You and Maya both know Alex, and the group shares an interest in coffee, design, and soccer.');
});

await test('fallback reasoning renders a full degree-3 chain', () => {
  const { reasoning } = fallbackGroup({ ...input, candidates: input.candidates.slice(6) }, options);
  assert.match(reasoning, /^You know Alex, who knows Maya, who knows Nina/);
});

await test('fallback with only degree-1 candidates says who you already know', () => {
  const { reasoning } = fallbackGroup({ ...input, candidates: input.candidates.slice(0, 2) }, options);
  assert.match(reasoning, /^You already know Alex and Priya/);
});

await test('fallback reasoning credits past "would meet again" feedback', () => {
  const { reasoning } = fallbackGroup(input, {
    ...options,
    signals: { c0: { score: 1.2, meetAgain: 2 }, c2: { score: 1, meetAgain: 1 } },
  });
  assert.equal(
    reasoning,
    'You and Maya both know Alex. Alex and Maya want to hang out again, and the group shares an interest in coffee, design, and soccer.',
  );
});

await test('valid model output is kept as-is, requester first', async () => {
  const group = await formGroups(input, {
    ...options,
    generate: reply({ memberIds: ['c4', 'c2', 'c5'], reasoning: 'You and Zoe both know Alex. Enjoy!' }),
  });
  assert.deepEqual(group.memberIds, ['me', 'c4', 'c2', 'c5']);
  assert.equal(group.reasoning, 'You and Zoe both know Alex. Enjoy!');
});

await test('model reasoning that never names the connecting person is replaced', async () => {
  const group = await formGroups(input, {
    ...options,
    generate: reply({ memberIds: ['c4', 'c2', 'c5'], reasoning: 'Model says hi.' }),
  });
  assert.deepEqual(group.memberIds, ['me', 'c4', 'c2', 'c5']);
  assert.match(group.reasoning, /^You and Zoe both know Alex/);
});

await test('a model group with no friend-of-a-friend gets the best-scoring one swapped in', async () => {
  // c0, c1 are degree 1; c2 is the best-scoring degree-2 candidate. Under max: appended.
  const appended = await formGroups(input, {
    ...options,
    generate: reply({ memberIds: ['c0', 'c1'], reasoning: 'You already know them.' }),
  });
  assert.deepEqual(appended.memberIds, ['me', 'c0', 'c1', 'c2']);
  assert.match(appended.reasoning, /^You and Maya both know Alex/);
  // At max (5 with the requester): the model's last pick makes room.
  const onlyDirect = { ...input, candidates: input.candidates.map((c, index) => (index < 5 ? { ...c, degree: 1 } : c)) };
  const swapped = await formGroups(onlyDirect, {
    ...options,
    generate: reply({ memberIds: ['c0', 'c1', 'c2', 'c3'], reasoning: 'You already know them.' }),
  });
  assert.deepEqual(swapped.memberIds, ['me', 'c0', 'c1', 'c2', 'c5']);
});

await test('Flash failing falls through to Lite before the deterministic fallback', async () => {
  const models: string[] = [];
  const group = await formGroups(input, {
    ...options,
    generate: async (_prompt, _signal, model) => {
      models.push(model);
      if (models.length === 1) throw new Error('503');
      return JSON.stringify({ memberIds: ['c4', 'c2', 'c5'], reasoning: 'You and Zoe both know Alex.' });
    },
  });
  assert.deepEqual(models, ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  assert.equal(group.reasoning, 'You and Zoe both know Alex.');
});

await test('unknown + duplicate ids are dropped, underfill is backfilled, reasoning replaced', async () => {
  const group = await formGroups(input, {
    ...options,
    generate: reply({ memberIds: ['c4', 'ghost', 'c4', 'me'], reasoning: 'Ghost is great.' }),
  });
  assert.deepEqual(group.memberIds, ['me', 'c4', 'c0']);
  assert.notEqual(group.reasoning, 'Ghost is great.');
});

await test('oversized output is soft-kept but capped at the absolute max', async () => {
  const group = await formGroups(input, {
    ...options,
    generate: reply({ memberIds: input.candidates.map(({ id }) => id), reasoning: 'Everyone!' }),
  });
  assert.equal(group.memberIds.length, ABSOLUTE_MAX_GROUP);
  assert.equal(group.memberIds[0], 'me');
});

await test('timeout falls back', async () => {
  const started = Date.now();
  const group = await formGroups(input, { ...options, generate: () => new Promise<string>(() => {}) });
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(group, fallbackGroup(input, options));
});

await test('rejection, malformed JSON, schema-invalid JSON, and all-unknown ids fall back', async () => {
  const cases: Array<() => Promise<string>> = [
    async () => {
      throw new Error('503');
    },
    async () => 'not json',
    reply({ members: ['c1'] }),
    reply({ memberIds: ['ghost'], reasoning: 'x' }),
  ];
  for (const generate of cases) {
    assert.deepEqual(await formGroups(input, { ...options, generate }), fallbackGroup(input, options));
  }
});

await test('no candidates returns just the requester without calling the model', async () => {
  let called = false;
  const group = await formGroups({ ...input, candidates: [] }, {
    ...options,
    generate: async () => {
      called = true;
      return '{}';
    },
  });
  assert.equal(called, false);
  assert.deepEqual(group.memberIds, ['me']);
});

await test('prompt carries each candidate\'s match score and meet-again count', async () => {
  let prompt = '';
  await formGroups(input, {
    ...options,
    signals: { c3: { score: 1.2, meetAgain: 2 } },
    generate: async (text) => {
      prompt = text;
      return JSON.stringify({ memberIds: ['c3', 'c0'], reasoning: 'ok' });
    },
  });
  assert.match(prompt, /"id": "c3",\n\s+"name": "Sam",\n\s+"degree": 2,\n\s+"matchScore": 1\.2,\n\s+"wouldMeetAgain": 2/);
  assert.match(prompt, /"id": "c0",[\s\S]*?"matchScore": 0,\n\s+"wouldMeetAgain": 0/);
});

await test('mapNarrowRow fills missing prefs from the requester and defaults similarity to 0', () => {
  const mapped = mapNarrowRow(
    {
      id: 'c1',
      display_name: null,
      interests: null,
      similarity: null,
      distance_mi: null,
      meet_again_score: 1,
      cost_min_cents: null,
      cost_max_cents: 9000,
      max_travel_mi: null,
      frequency: 'hourly',
      group_size_min: null,
      group_size_max: null,
      max_degrees: null,
      score: 0.05,
    },
    { id: 'c1', degree: 2, path: ['me', 'c0', 'c1'] },
    prefs,
  );
  assert.equal(mapped.displayName, 'Someone');
  assert.deepEqual(mapped.interests, []);
  assert.equal(mapped.similarity, 0);
  assert.deepEqual(mapped.prefs, { ...prefs, costMaxCents: 9000 });
  assert.deepEqual(mapped.path, ['me', 'c0', 'c1']);
});

console.warn = silence;
if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all formGroups tests passed');
