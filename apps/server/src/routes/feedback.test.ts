// Owner: Sahith (Data & Matching) — run: npx tsx apps/server/src/routes/feedback.test.ts (no network).
import assert from 'node:assert/strict';
import { cleanAnalysis } from '../ai/analyzeFeedback.js';
import { ApiError } from '../lib/errors.js';
import { newDerivedLabels, peerAnswers } from './feedback.js';

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

const members = new Set(['me', 'maya', 'chris']);

test('peerAnswers keeps one answer per peer, last one wins', () => {
  assert.deepEqual(
    peerAnswers(
      [
        { peerId: 'maya', relationship: 'not_for_me' },
        { peerId: 'chris', relationship: 'great' },
        { peerId: 'maya', relationship: 'great' },
      ],
      'me',
      members,
    ),
    [
      { peer_id: 'maya', relationship: 'great' },
      { peer_id: 'chris', relationship: 'great' },
    ],
  );
});

test('peerAnswers rejects the author and non-members with a 400', () => {
  for (const peerId of ['me', 'stranger']) {
    assert.throws(
      () => peerAnswers([{ peerId, relationship: 'great' }], 'me', members),
      (error: unknown) =>
        error instanceof ApiError && error.status === 400 && error.code === 'invalid_request',
    );
  }
  assert.deepEqual(peerAnswers([], 'me', members), []);
});

test('newDerivedLabels skips labels the profile already has, ignoring case', () => {
  assert.deepEqual(
    newDerivedLabels(['hiking', 'live music', 'board games'], ['Board Games ', 'coffee', 'hiking']),
    ['live music'],
  );
});

test('cleanAnalysis lowercases, dedupes, drops empty and overlong labels, caps at 5', () => {
  const cleaned = cleanAnalysis({
    sentiment: 'positive',
    tags: [
      '  Live   Music ',
      'live music',
      '',
      'x'.repeat(41),
      'hiking',
      'tacos',
      'trivia',
      'karaoke',
      'pottery',
    ].map((label) => ({ label, kind: 'derived' as const })),
  });
  assert.equal(cleaned.sentiment, 'positive');
  assert.deepEqual(
    cleaned.tags.map(({ label }) => label),
    ['live music', 'hiking', 'tacos', 'trivia', 'karaoke'],
  );
});

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all feedback tests passed');
