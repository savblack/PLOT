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
