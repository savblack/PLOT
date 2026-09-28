import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS,
  SIGNUP_FORM_TOKEN_SERVER_MAX_MS,
  signupFormTokenIsStale,
} from '../../src/utils/signupFormToken.js';

const MINUTE = 60 * 1000;

test('a missing token is stale', () => {
  assert.equal(signupFormTokenIsStale(0, 1_000), true);
  assert.equal(signupFormTokenIsStale(undefined, 1_000), true);
});

test('a token is reused inside the refresh window and replaced at the cutoff', () => {
  const issuedAt = 1_000;
  assert.equal(signupFormTokenIsStale(issuedAt, issuedAt + SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS - 1), false);
  assert.equal(signupFormTokenIsStale(issuedAt, issuedAt + 9 * MINUTE), false);
  assert.equal(signupFormTokenIsStale(issuedAt, issuedAt + SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS), true);
  assert.equal(signupFormTokenIsStale(issuedAt, issuedAt + SIGNUP_FORM_TOKEN_SERVER_MAX_MS), true);
});

test('the client refreshes at least two minutes before the server rejects the token', () => {
  const src = readFileSync(
    new URL('../../../../supabase/functions/signup-bypass/index.ts', import.meta.url),
    'utf8',
  );
  const match = src.match(/const MAX_TOKEN_AGE_MS = (\d+) \* 60 \* 1000/);
  assert.ok(match, 'signup-bypass MAX_TOKEN_AGE_MS should stay a minute literal the client can follow');
  const serverMax = Number(match[1]) * MINUTE;
  assert.equal(SIGNUP_FORM_TOKEN_SERVER_MAX_MS, serverMax);
  assert.ok(serverMax - SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS >= 2 * MINUTE);
  assert.ok(SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS < serverMax);
});
