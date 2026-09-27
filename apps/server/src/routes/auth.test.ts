// Owner: Sahith (Data & Matching) — run: npx tsx apps/server/src/routes/auth.test.ts (no network).
import assert from 'node:assert/strict';
import {
  emailSchema,
  isDemoEmail,
  loginRequestSchema,
  signupRequestSchema,
  usernameSchema,
} from '@degrees/shared';

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

test('emailSchema trims and lowercases, and rejects non-emails (a bare username no longer logs in)', () => {
  assert.equal(emailSchema.parse('  Someone@Example.com '), 'someone@example.com');
  for (const bad of ['maya.chen', 'no-at-sign.com', 'a@', '@b.com', '']) {
    assert.equal(emailSchema.safeParse(bad).success, false, bad);
  }
});

test('isDemoEmail matches only the reserved demo domain', () => {
  assert.equal(isDemoEmail('maya.chen@degrees.demo'), true);
  assert.equal(isDemoEmail(' Maya.Chen@DEGREES.demo '), true);
  assert.equal(isDemoEmail('maya@gatech.edu'), false);
  assert.equal(isDemoEmail('maya@notdegrees.demo'), false);
});

test('usernameSchema lowercases and trims, and enforces 3–20 of [a-z0-9._]', () => {
  assert.equal(usernameSchema.parse('  Alex_R.2 '), 'alex_r.2');
  for (const bad of ['ab', 'a'.repeat(21), 'has space', 'at@sign', 'dash-name', '']) {
    assert.equal(usernameSchema.safeParse(bad).success, false, bad);
  }
});

test('loginRequestSchema takes a username with or without the @, and never an email', () => {
  assert.equal(loginRequestSchema.parse({ username: ' @Maya.Chen ', password: 'x' }).username, 'maya.chen');
  assert.equal(loginRequestSchema.parse({ username: 'maya.chen', password: 'x' }).username, 'maya.chen');
  assert.equal(loginRequestSchema.safeParse({ username: 'maya@degrees.demo', password: 'x' }).success, false);
  assert.equal(loginRequestSchema.safeParse({ username: 'maya.chen', password: '' }).success, false);
});

test('signupRequestSchema requires a real (non-demo) email, name, phone, and an 8+ character password', () => {
  const good = {
    email: 'Alex@GaTech.edu',
    username: 'alex',
    password: 'longenough',
    displayName: 'Alex',
    phone: '4045550100',
  };
  const parsed = signupRequestSchema.safeParse(good);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.email, 'alex@gatech.edu');
  assert.equal(signupRequestSchema.safeParse({ ...good, email: 'alex' }).success, false);
  assert.equal(signupRequestSchema.safeParse({ ...good, email: 'alex@degrees.demo' }).success, false);
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
