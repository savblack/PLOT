import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WATCH_TOGETHER_HOME_DISMISSED,
  watchTogetherHomeDismissed,
  watchTogetherHomeKey,
  watchTogetherHomeVisible,
} from '../../watchTogetherHome.js';

test('the Home card shows for a signed-in person until this device dismisses it', () => {
  assert.equal(watchTogetherHomeVisible({ signedIn: true, dismissed: false }), true);
  assert.equal(watchTogetherHomeVisible({ signedIn: true, dismissed: true }), false);
  assert.equal(watchTogetherHomeVisible({ signedIn: false, dismissed: false }), false);
});

test('dismiss is the stored marker, and the key is per account', () => {
  assert.equal(watchTogetherHomeDismissed(WATCH_TOGETHER_HOME_DISMISSED), true);
  assert.equal(watchTogetherHomeDismissed(null), false);
  assert.equal(watchTogetherHomeDismissed(''), false);
  assert.notEqual(watchTogetherHomeKey('a'), watchTogetherHomeKey('b'));
});
