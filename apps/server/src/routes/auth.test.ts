// Owner: Sahith (Data & Matching) — run: npx tsx apps/server/src/routes/auth.test.ts (no network).
import assert from 'node:assert/strict';
import { authEmailFor, signupRequestSchema, usernameSchema } from '@degrees/shared';

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

test('authEmailFor maps a username to its demo email, and leaves emails alone', () => {
  assert.equal(authEmailFor('maya.chen'), 'maya.chen@degrees.demo');
  assert.equal(authEmailFor('  Maya.Chen '), 'maya.chen@degrees.demo');
  assert.equal(authEmailFor('Someone@Example.com'), 'someone@example.com');
});

test('usernameSchema lowercases and trims, and enforces 3–20 of [a-z0-9._]', () => {
  assert.equal(usernameSchema.parse('  Alex_R.2 '), 'alex_r.2');
  for (const bad of ['ab', 'a'.repeat(21), 'has space', 'at@sign', 'dash-name', '']) {
    assert.equal(usernameSchema.safeParse(bad).success, false, bad);
  }
});

test('signupRequestSchema requires name, phone, and an 8+ character password', () => {
  const good = { username: 'alex', password: 'longenough', displayName: 'Alex', phone: '4045550100' };
  assert.equal(signupRequestSchema.safeParse(good).success, true);
  assert.equal(signupRequestSchema.safeParse({ ...good, password: 'short' }).success, false);
  assert.equal(signupRequestSchema.safeParse({ ...good, displayName: '  ' }).success, false);
  assert.equal(signupRequestSchema.safeParse({ ...good, phone: '' }).success, false);
  assert.equal(signupRequestSchema.safeParse({ ...good, pronouns: 'They/them' }).success, true);
});

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log('all auth tests passed');
