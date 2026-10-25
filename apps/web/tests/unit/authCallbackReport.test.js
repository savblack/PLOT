import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JUST_CONFIRMED_WINDOW_MS,
  clearPendingBypassSignup,
  pendingBypassMatches,
  planAuthCallbackReport,
  rememberPendingBypassSignup,
  rememberSignupTracked,
  signupAlreadyTracked,
} from '../../src/utils/authCallbackReport.js';

function memoryStore(seed = {}) {
  const data = { ...seed };
  return {
    data,
    get: (key) => (key in data ? data[key] : null),
    set: (key, value) => { data[key] = value; },
    remove: (key) => { delete data[key]; },
  };
}

const NOW = Date.parse('2026-10-25T18:00:00Z');

function user(overrides = {}) {
  return {
    id: 'user-1',
    email: 'allanto1@gmail.com',
    created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    email_confirmed_at: new Date(NOW - 5_000).toISOString(),
    ...overrides,
  };
}

test('a late bypass confirmation link identifies and fires user_signed_up once', () => {
  const plan = planAuthCallbackReport({
    user: user(),
    sessionMethod: null,
    search: '?from=signup&method=email&via=bypass',
    now: NOW,
  });
  assert.equal(plan.identify, true);
  assert.equal(plan.event, 'user_signed_up');
  assert.deepEqual(plan.props, { method: 'email', via_bypass: true });
  assert.equal(plan.rememberSignup, true);
  assert.equal(plan.markReferral, true);
});

test('the same user does not fire user_signed_up a second time', () => {
  const plan = planAuthCallbackReport({
    user: user(),
    search: '?from=signup&via=bypass',
    alreadyTracked: true,
    now: NOW,
  });
  assert.equal(plan.identify, true);
  assert.equal(plan.event, null);
  assert.equal(plan.deduped, true);
  assert.equal(plan.rememberSignup, false);
});

test('a bypass link opened in the same browser still counts when the query string was stripped', () => {
  const store = memoryStore();
  rememberPendingBypassSignup('Allanto1@gmail.com', store, NOW - 60_000);
  assert.equal(pendingBypassMatches('allanto1@gmail.com', store, NOW), true);
  const plan = planAuthCallbackReport({
    user: user(),
    sessionMethod: null,
    search: '',
    pendingBypass: true,
    now: NOW,
  });
  assert.equal(plan.event, 'user_signed_up');
  assert.deepEqual(plan.props, { method: 'email', via_bypass: true });
});

test('an already-confirmed member clicking a signup link is a sign-in', () => {
  const plan = planAuthCallbackReport({
    user: user({
      email_confirmed_at: new Date(NOW - JUST_CONFIRMED_WINDOW_MS - 60_000).toISOString(),
    }),
    search: '?from=signup&method=email&via=bypass',
    now: NOW,
  });
  assert.equal(plan.event, 'user_logged_in');
  assert.deepEqual(plan.props, { method: 'email' });
});

test('oauth inside the new-account window stays method google and is not marked bypass', () => {
  const plan = planAuthCallbackReport({
    user: user({
      created_at: new Date(NOW - 5_000).toISOString(),
      email_confirmed_at: new Date(NOW - 5_000).toISOString(),
    }),
    sessionMethod: 'google',
    search: '',
    now: NOW,
  });
  assert.equal(plan.event, 'user_signed_up');
  assert.deepEqual(plan.props, { method: 'google' });
});

test('a magic link does not count as a second signup just because it was sent by signup-bypass', () => {
  const plan = planAuthCallbackReport({
    user: user({ email_confirmed_at: new Date(NOW - 5_000).toISOString() }),
    search: '?method=magic_link&via=bypass',
    now: NOW,
  });
  assert.equal(plan.event, 'user_logged_in');
  assert.deepEqual(plan.props, { method: 'magic_link' });
});

test('a returning magic link is a login when the account is old', () => {
  const plan = planAuthCallbackReport({
    user: user({
      email_confirmed_at: new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    sessionMethod: null,
    search: '?method=magic_link&via=bypass',
    now: NOW,
  });
  assert.equal(plan.event, 'user_logged_in');
  assert.deepEqual(plan.props, { method: 'magic_link' });
});

test('a callback with no method and no signup marker does not identify', () => {
  const plan = planAuthCallbackReport({
    user: user({ email_confirmed_at: new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString() }),
    sessionMethod: null,
    search: '',
    now: NOW,
  });
  assert.equal(plan.identify, false);
  assert.equal(plan.event, null);
});

test('signup dedupe and the pending bypass flag round-trip through storage', () => {
  const store = memoryStore();
  assert.equal(signupAlreadyTracked('user-1', store), false);
  rememberSignupTracked('user-1', store);
  assert.equal(signupAlreadyTracked('user-1', store), true);
  rememberPendingBypassSignup('a@b.co', store, NOW);
  assert.equal(pendingBypassMatches('a@b.co', store, NOW), true);
  assert.equal(pendingBypassMatches('a@b.co', store, NOW + PENDING_STALE()), false);
  clearPendingBypassSignup(store);
  assert.equal(pendingBypassMatches('a@b.co', store, NOW), false);
});

function PENDING_STALE() {
  return 8 * 24 * 60 * 60 * 1000;
}
