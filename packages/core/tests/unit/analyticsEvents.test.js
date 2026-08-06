import assert from 'node:assert/strict';
import test from 'node:test';

import { EVENTS } from '../../analyticsEvents.js';

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
  assert.equal(EVENTS.ACTIVATED, 'activated');
  assert.equal(EVENTS.TRAKT_SYNCED, 'trakt_synced');
  assert.equal(EVENTS.SIGNUP_SUBMIT_FAILED, 'signup_submit_failed');
  assert.equal(EVENTS.LOGIN_SUBMIT_FAILED, 'login_submit_failed');
});
