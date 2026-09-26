// Owner: Pranav (Groups, Activities & Chat) — wave 2 (Sahith): the resumable stage runner's fallback chain.
// Runs without any API key (mock-mode env), so every external stage must fail closed toward the fixture.
// `npx tsx src/ai/generateActivity.test.ts` from apps/server.
import assert from 'node:assert/strict';
import type { GenerateActivityInput } from '@degrees/shared';
import { activityFixture } from '../mocks/fixtures.js';
import { activityJobSchema, newActivityJob, runActivityStage } from './generateActivity.js';

const input: GenerateActivityInput = {
  members: [{ displayName: 'Avery', interests: ['bouldering'] }],
  constraints: { maxCostCents: 3000, maxTravelMi: 10, city: 'Atlanta', lat: 33.7756, lng: -84.3963 },
};

let failures = 0;
async function test(name: string, run: () => Promise<void>): Promise<void> {
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

await test('a new job starts at the grounded stage and round-trips through the schema', async () => {
  const job = newActivityJob();
  assert.equal(job.stage, 'grounded');
  assert.deepEqual(activityJobSchema.parse(JSON.parse(JSON.stringify(job))), job);
});

await test('without a Gemini key the grounded stage skips straight to the fixture stage, unfinished', async () => {
  const result = await runActivityStage(newActivityJob(), input, 2000);
  assert.equal(result.job.stage, 'fixture');
  assert.equal(result.activity, null);
});

await test('the places stage with no grounded plan fails over to ticketmaster and records the error', async () => {
  const job = { ...newActivityJob(), stage: 'places' as const };
  const result = await runActivityStage(job, input, 2000);
  assert.equal(result.job.stage, 'ticketmaster');
  assert.equal(result.activity, null);
  assert.match(result.job.errors[0] ?? '', /^places: /);
});

await test('the ticketmaster stage without a key fails over to fixture', async () => {
  const job = { ...newActivityJob(), stage: 'ticketmaster' as const };
  const result = await runActivityStage(job, input, 2000);
  assert.equal(result.job.stage, 'fixture');
  assert.equal(result.activity, null);
});

await test('the fixture stage always finishes with the fallback plan', async () => {
  const job = { ...newActivityJob(), stage: 'fixture' as const };
  const result = await runActivityStage(job, input, 2000);
  assert.deepEqual(result.activity, activityFixture);
});

await test('a stage never throws, and errors are capped at eight', async () => {
  const base = { ...newActivityJob(), errors: Array.from({ length: 8 }, (_, i) => `old ${i}`) };
  const result = await runActivityStage({ ...base, stage: 'places' }, input, 2000);
  assert.equal(result.job.errors.length, 8);
  assert.match(result.job.errors[7] ?? '', /^places: /);
  const done = await runActivityStage({ ...base, stage: 'fixture' }, input, 2000);
  assert.ok(done.activity);
});

console.warn = silence;
if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all generateActivity tests passed');
