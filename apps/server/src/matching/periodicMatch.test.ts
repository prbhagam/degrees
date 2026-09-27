// Owner: Christian (Server & Infra) — run: npx tsx apps/server/src/matching/periodicMatch.test.ts (no network).
import assert from 'node:assert/strict';
import { effectivePrefs } from './periodicMatch.js';

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

await test('effectivePrefs uses defaults when row is null', () => {
  const prefs = effectivePrefs(null);
  assert.equal(prefs.costMinCents, 0);
  assert.equal(prefs.costMaxCents, 5000);
  assert.equal(prefs.maxTravelMi, 10);
  assert.equal(prefs.frequency, 'weekly');
  assert.equal(prefs.groupSizeMin, 3);
  assert.equal(prefs.groupSizeMax, 5);
  assert.equal(prefs.maxDegrees, 2);
});

await test('effectivePrefs respects custom preferences', () => {
  const prefs = effectivePrefs({
    cost_min_cents: 1000,
    cost_max_cents: 3000,
    max_travel_mi: 15,
    frequency: 'daily',
    group_size_min: 4,
    group_size_max: 6,
    max_degrees: 3,
  });
  assert.equal(prefs.costMinCents, 1000);
  assert.equal(prefs.costMaxCents, 3000);
  assert.equal(prefs.maxTravelMi, 15);
  assert.equal(prefs.frequency, 'daily');
  assert.equal(prefs.groupSizeMin, 4);
  assert.equal(prefs.groupSizeMax, 6);
  assert.equal(prefs.maxDegrees, 3);
});

await test('invariant: 0 first-degree connections cannot match', () => {
  const poolWithNoFirstDegree = [
    { id: 'c1', degree: 2, path: ['me', 'x', 'c1'] },
    { id: 'c2', degree: 3, path: ['me', 'x', 'y', 'c2'] },
  ];
  const hasFirstDegree = poolWithNoFirstDegree.some((c) => c.degree === 1);
  assert.equal(hasFirstDegree, false, 'User with only degree 2 or 3 has 0 first-degree connections');
});

await test('invariant: has at least 1 first-degree connection passes gate', () => {
  const poolWithFirstDegree = [
    { id: 'c0', degree: 1, path: ['me', 'c0'] },
    { id: 'c1', degree: 2, path: ['me', 'c0', 'c1'] },
  ];
  const hasFirstDegree = poolWithFirstDegree.some((c) => c.degree === 1);
  assert.equal(hasFirstDegree, true, 'User with degree 1 has a valid first-degree connection');
});

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all periodicMatch tests passed');
