// Owner: Sahith (Data & Matching) — run: npx tsx apps/server/src/lib/groups.test.ts (no network).
import assert from 'node:assert/strict';
import { fixedEventStart, resolveMemberDegree } from './groups.js';

let failures = 0;
function test(name: string, run: () => void) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}\n`, error);
  }
}

test('only the viewer is degree 0', () => {
  assert.equal(resolveMemberDegree('me', 'me', undefined, null), 0);
});

test("a meetup host stored as 0 is not a second 'You' for someone who hasn't met them (wave 6 bug)", () => {
  assert.equal(resolveMemberDegree('host', 'joiner', undefined, 0), 2);
});

test('a real graph path wins over the stored degree', () => {
  assert.equal(resolveMemberDegree('host', 'joiner', 1, 0), 1);
  assert.equal(resolveMemberDegree('maya', 'me', 2, 3), 2);
});

test('with no path, a positive stored matching degree is kept', () => {
  assert.equal(resolveMemberDegree('maya', 'me', undefined, 3), 3);
});

test('a plan with a future start is a fixed event time, rounded to the minute', () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z');
  assert.equal(fixedEventStart({ startsAt: '2026-10-11T23:30:45.500Z' }, now), '2026-10-11T23:30:00.000Z');
});

test('no start, or a start already gone, fixes nothing', () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z');
  assert.equal(fixedEventStart({ startsAt: null }, now), null);
  assert.equal(fixedEventStart({ startsAt: '2026-09-27T11:00:00.000Z' }, now), null);
  assert.equal(fixedEventStart(null, now), null);
});

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all groups tests passed');
