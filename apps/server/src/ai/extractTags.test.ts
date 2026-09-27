// Owner: Sahith (Data & Matching) — run: npx tsx apps/server/src/ai/extractTags.test.ts (no network).
import assert from 'node:assert/strict';
import { cleanTags, type ExtractTagsInput } from './extractTags.js';

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

const input: ExtractTagsInput = {
  text: 'unused by cleanTags',
  knownInterests: ['Board Games', 'Live Music', 'Cooking'],
  avoidOptions: ['Alcohol', 'Late nights'],
};

test('known labels keep their canonical spelling; duplicates in any case drop', () => {
  const out = cleanTags({ interests: ['board games', 'BOARD GAMES', '  Vinyl   Records ', 'cooking'], avoids: [] }, input);
  assert.deepEqual(out.interests, ['Board Games', 'Vinyl Records', 'Cooking']);
});

test('avoids must be one of the offered options (they become hard rules on plans)', () => {
  const out = cleanTags({ interests: [], avoids: ['alcohol', 'Spiders', 'Late nights', 'ALCOHOL'] }, input);
  assert.deepEqual(out.avoids, ['Alcohol', 'Late nights']);
});

test('an interest that is also an avoid is dropped from interests', () => {
  const out = cleanTags({ interests: ['Alcohol', 'Live Music'], avoids: ['Alcohol'] }, input);
  assert.deepEqual(out.interests, ['Live Music']);
});

test('empty and over-long labels are dropped; at most eight interests', () => {
  const many = Array.from({ length: 12 }, (_, i) => `Thing ${i}`);
  const out = cleanTags({ interests: ['', 'x'.repeat(40), ...many], avoids: [] }, input);
  assert.equal(out.interests.length, 8);
  assert.equal(out.interests[0], 'Thing 0');
});

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all extractTags tests passed');
