// Owner: Pranav (Groups, Activities & Chat) — wave 2 (Sahith): the resumable stage runner's fallback chain.
// Runs without any API key (mock-mode env), so every external stage must fail closed toward the fixture.
// `npx tsx src/ai/generateActivity.test.ts` from apps/server.
import assert from 'node:assert/strict';
import type { GenerateActivityInput } from '@degrees/shared';
import { activityFixture } from '../mocks/fixtures.js';
import {
  activityJobSchema,
  avoidRules,
  constraintViolation,
  isPreviousVenue,
  MAX_REJECTIONS,
  newActivityJob,
  runActivityStage,
  sharedInterests,
  violatesAvoids,
} from './generateActivity.js';

const input: GenerateActivityInput = {
  members: [{ displayName: 'Avery', interests: ['bouldering'], avoids: [] }],
  constraints: { maxCostCents: 3000, maxTravelMi: 10, city: 'Atlanta', lat: 33.7756, lng: -84.3963 },
  previousVenues: [],
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

// Wave 3: 'avoid' tags are hard rules for the planner, and earlier venues are never suggested twice.
await test('avoidRules turns every member\'s avoid tags into one de-duplicated rule list', async () => {
  const group: GenerateActivityInput = {
    ...input,
    members: [
      { displayName: 'Avery', interests: ['bouldering'], avoids: ['Alcohol', 'Late nights'] },
      { displayName: 'Maya', interests: ['coffee'], avoids: ['alcohol', 'Ferris wheels'] },
    ],
  };
  const rules = avoidRules(group);
  assert.equal(rules.length, 3);
  assert.match(rules[0] ?? '', /no bars, pubs, breweries/);
  assert.match(rules[1] ?? '', /8pm/);
  assert.equal(rules[2], 'no ferris wheels');
  assert.deepEqual(avoidRules(input), []);
});

await test('violatesAvoids flags alcohol-centred venues only when someone avoids alcohol', async () => {
  const dry: GenerateActivityInput = {
    ...input,
    members: [{ displayName: 'Avery', interests: [], avoids: ['Alcohol'] }],
  };
  assert.ok(violatesAvoids('The Local Pub', dry));
  assert.ok(violatesAvoids('Monday Night Brewing taproom', dry));
  assert.ok(violatesAvoids('Trivia at Ormsby\'s Bar', dry));
  assert.equal(violatesAvoids('Stone Summit Midtown', dry), null);
  assert.equal(violatesAvoids('The Painted Duck', dry), null);
  // Nobody avoiding alcohol: a pub is fine.
  assert.equal(violatesAvoids('The Local Pub', input), null);
});

await test('isPreviousVenue matches loosely against the venues already suggested', async () => {
  const seen: GenerateActivityInput = { ...input, previousVenues: ['Your 3rd Spot - Westside', 'The Painted Duck'] };
  assert.ok(isPreviousVenue('Your 3rd Spot', seen));
  assert.ok(isPreviousVenue('the painted duck', seen));
  assert.equal(isPreviousVenue('Stone Summit Midtown', seen), false);
  assert.equal(isPreviousVenue('', seen), false);
});

// Wave 5: budget and distance are enforced on the assembled plan, and a rejection retries the grounded stage
// with the reason in the prompt before the chain falls through.
await test('constraintViolation rejects plans outside the range or over budget, accepts the rest', async () => {
  const near = { venue: 'Stone Summit', lat: 33.7822, lng: -84.4058, priceCents: 2200 };
  assert.equal(constraintViolation(near, input), null);
  // Athens, GA is ~60 miles from campus.
  const far = { venue: 'Athens Bowl', lat: 33.951, lng: -83.3757, priceCents: 1000 };
  assert.match(constraintViolation(far, input) ?? '', /miles away/);
  const dear = { ...near, priceCents: 9900 };
  assert.match(constraintViolation(dear, input) ?? '', /budget is \$30/);
  // Unknown price is not a violation; a little past the range still counts as inside.
  assert.equal(constraintViolation({ ...near, priceCents: null }, input), null);
  const edge = { venue: 'Edge', lat: 33.7756 + 10.8 / 69, lng: -84.3963, priceCents: null };
  assert.equal(constraintViolation(edge, input), null);
});

await test('sharedInterests prefers labels two or more members share, else everyone\'s', async () => {
  const group: GenerateActivityInput = {
    ...input,
    members: [
      { displayName: 'Avery', interests: ['Bouldering', 'coffee'], avoids: [] },
      { displayName: 'Maya', interests: ['coffee', 'ceramics'], avoids: [] },
      { displayName: 'Leo', interests: ['bouldering', 'arcades'], avoids: [] },
    ],
  };
  assert.deepEqual(sharedInterests(group), ['Bouldering', 'coffee']);
  assert.deepEqual(sharedInterests(input), ['bouldering']);
});

await test('a plan that resolves too far away sends the job back to grounded with the rejection recorded', async () => {
  // No Places key: assembleFromMaps falls back to the model coordinates, which are outside the 10-mile range.
  const job = {
    ...newActivityJob(),
    stage: 'places' as const,
    plan: { venue: 'Athens Bowl', title: 'Bowling', reasoning: 'r', lat: 33.951, lng: -83.3757, estimatedPricePerPersonUsd: 10 },
    places: [],
  };
  const result = await runActivityStage(job, input, 2000);
  assert.equal(result.activity, null);
  assert.equal(result.job.stage, 'grounded');
  assert.equal(result.job.rejected.length, 1);
  assert.equal(result.job.rejected[0]?.venue, 'Athens Bowl');
  assert.match(result.job.rejected[0]?.reason ?? '', /range|miles/);
  assert.equal(result.job.plan, undefined);
});

await test('an over-budget plan is rejected the same way', async () => {
  const job = {
    ...newActivityJob(),
    stage: 'places' as const,
    plan: { venue: 'Fancy Spot', title: 'Tasting menu', reasoning: 'r', lat: 33.78, lng: -84.39, estimatedPricePerPersonUsd: 120 },
    places: [],
  };
  const result = await runActivityStage(job, input, 2000);
  assert.equal(result.activity, null);
  assert.equal(result.job.stage, 'grounded');
  assert.match(result.job.rejected[0]?.reason ?? '', /budget/);
});

await test(`after ${MAX_REJECTIONS} rejections a constraint failure falls through the chain instead of retrying`, async () => {
  const job = {
    ...newActivityJob(),
    stage: 'places' as const,
    plan: { venue: 'Athens Bowl', title: 'Bowling', reasoning: 'r', lat: 33.951, lng: -83.3757 },
    places: [],
    rejected: [
      { venue: 'A', reason: 'too far' },
      { venue: 'B', reason: 'too dear' },
    ],
  };
  const result = await runActivityStage(job, input, 2000);
  assert.equal(result.activity, null);
  assert.equal(result.job.stage, 'ticketmaster');
  assert.equal(result.job.rejected.length, MAX_REJECTIONS);
});

await test('an older job row without `rejected` still parses', async () => {
  const parsed = activityJobSchema.parse({ stage: 'grounded', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  assert.deepEqual(parsed.rejected, []);
  assert.deepEqual(parsed.errors, []);
});

console.warn = silence;
if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all generateActivity tests passed');
