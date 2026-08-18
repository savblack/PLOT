import assert from 'node:assert/strict';
import test from 'node:test';

import { EVENTS, personPropsFromProfile } from '../../analyticsEvents.js';

test('EVENTS is frozen', () => {
  assert.ok(Object.isFrozen(EVENTS));
  assert.throws(() => { EVENTS.NEW_EVENT = 'new_event'; }, TypeError);
});

test('every event value is a snake_case string', () => {
  for (const value of Object.values(EVENTS)) {
    assert.equal(typeof value, 'string');
    assert.match(value, /^[a-z0-9]+(_[a-z0-9]+)*$/, value);
  }
});

test('every event name maps to a unique value', () => {
  const values = Object.values(EVENTS);
  assert.equal(new Set(values).size, values.length);
});

test('spot-checks a few specific event name mappings', () => {
  assert.equal(EVENTS.SIGNUP_FORM_VIEWED, 'signup_form_viewed');
  // Retired: no longer emitted by either app (activation is a PostHog cohort
  // now), but the key must stay so a missed call site is a loud reference
  // rather than a silent `undefined` event name.
  assert.equal(EVENTS.ACTIVATED, 'activated');
  assert.equal(EVENTS.EPISODE_UNWATCHED, 'episode_unwatched');
  assert.equal(EVENTS.SEASON_UNWATCHED, 'season_unwatched');
  assert.equal(EVENTS.TRAKT_SYNCED, 'trakt_synced');
  assert.equal(EVENTS.SIGNUP_SUBMIT_FAILED, 'signup_submit_failed');
  assert.equal(EVENTS.LOGIN_SUBMIT_FAILED, 'login_submit_failed');
});

test('personPropsFromProfile handles a missing profile as all-inactive', () => {
  assert.deepEqual(personPropsFromProfile(null), {
    is_premium: false,
    premium_status: 'inactive',
    is_supporter: false,
    supporter_status: 'inactive',
  });
  assert.deepEqual(personPropsFromProfile(undefined), personPropsFromProfile(null));
});

test('premium_status mirrors is_premium directly', () => {
  assert.equal(personPropsFromProfile({ is_premium: true }).premium_status, 'active');
  assert.equal(personPropsFromProfile({ is_premium: false }).premium_status, 'inactive');
});

test('supporter_status is a 35-day recency window on last_kofi_tip_at, not is_supporter itself', () => {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86_400_000).toISOString();

  assert.equal(
    personPropsFromProfile({ is_supporter: true, last_kofi_tip_at: daysAgo(10) }).supporter_status,
    'active',
  );
  assert.equal(
    personPropsFromProfile({ is_supporter: true, last_kofi_tip_at: daysAgo(34) }).supporter_status,
    'active',
    'still active just inside the window',
  );
  assert.equal(
    personPropsFromProfile({ is_supporter: true, last_kofi_tip_at: daysAgo(36) }).supporter_status,
    'inactive',
    'a lapsed tipper stays is_supporter: true but goes supporter_status: inactive',
  );
  assert.equal(
    personPropsFromProfile({ is_supporter: true, last_kofi_tip_at: null }).supporter_status,
    'inactive',
  );
});

test('the auth-callback failure event is in the shared catalog', () => {
  // Web's /auth/callback is the only emitter today, but the name lives here so a
  // future mobile deep-link failure reports into the same funnel.
  assert.equal(EVENTS.AUTH_CALLBACK_FAILED, 'auth_callback_failed');
});
