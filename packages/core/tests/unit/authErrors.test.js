import assert from 'node:assert/strict';
import test from 'node:test';

import { authErrorReason } from '../../authErrors.js';

test('authErrorReason returns unknown for empty or missing messages', () => {
  assert.equal(authErrorReason(null), 'unknown');
  assert.equal(authErrorReason(undefined), 'unknown');
  assert.equal(authErrorReason(''), 'unknown');
});

test('authErrorReason recognises each known Supabase message, as a substring match', () => {
  assert.equal(authErrorReason('User already registered'), 'already_registered');
  assert.equal(authErrorReason('Error: User already registered.'), 'already_registered');
  assert.equal(authErrorReason('Password should be at least 6 characters'), 'weak_password');
  assert.equal(authErrorReason('Unable to validate email address: invalid format'), 'invalid_email');
  assert.equal(authErrorReason('Email rate limit exceeded'), 'rate_limited');
  assert.equal(authErrorReason('too many requests, slow down'), 'rate_limited');
});

test('authErrorReason falls back to unknown for an unrecognised message', () => {
  assert.equal(authErrorReason('something unexpected happened'), 'unknown');
});

test('authErrorReason matching is case-sensitive', () => {
  assert.equal(authErrorReason('user already registered'), 'unknown');
});

test('authErrorReason splits the two PKCE verifier failures, which have different causes', () => {
  // Mismatch: a verifier was present but belonged to a different /authorize call
  // — the fingerprint of signInWithOAuth having fired more than once.
  assert.equal(
    authErrorReason('invalid request: code challenge does not match previously saved code verifier'),
    'pkce_verifier_mismatch',
  );
  // Missing: no verifier in this browser at all. Asserted second on purpose,
  // since GoTrue's mismatch wording also contains 'code verifier' and would
  // shadow this one if the order in authErrorReason were flipped.
  assert.equal(
    authErrorReason('invalid request: both auth code and code verifier should be non-empty'),
    'pkce_verifier_missing',
  );
});

test('authErrorReason recognises a spent or aged-out flow state', () => {
  assert.equal(authErrorReason('invalid flow state, no valid flow state found'), 'flow_state_expired');
});

test('authErrorReason folds both expired-email-link wordings into one slug', () => {
  assert.equal(authErrorReason('Email link is invalid or has expired'), 'otp_expired');
  assert.equal(authErrorReason('Token has expired or is invalid'), 'otp_expired');
});

test("authErrorReason maps resolveAuthCallback's own no-session sentinel", () => {
  assert.equal(authErrorReason('no-session'), 'no_session');
  // Only the exact sentinel — prose that merely mentions it stays unknown.
  assert.equal(authErrorReason('there was no-session anywhere'), 'unknown');
});

test('authErrorReason never echoes an unrecognised provider message back as a slug', () => {
  // A provider's error_description is arbitrary third-party wording and must not
  // become an analytics property. Collapsing to 'unknown' is the guarantee.
  assert.equal(authErrorReason('Google says: consent required for scope xyz'), 'unknown');
});
