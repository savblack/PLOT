import test from 'node:test';
import assert from 'node:assert/strict';
import { homeKind, hasHomeProvider } from '../planner/triggers/now-streaming.mjs';
import { awaitingRelease } from '../planner/triggers/trailer-drop.mjs';

const home = (streaming = {}, digital = {}) => ({
  streaming: { US: [], UK: [], AU: [], ...streaming },
  digital: { US: [], UK: [], AU: [], ...digital },
});

test('a subscription provider anywhere wins over a store, US first', () => {
  assert.equal(homeKind(home({ US: ['Netflix'] }, { US: ['Apple TV'] })), 'streaming');
  assert.equal(homeKind(home({ UK: ['Sky Go'] }, { US: ['Apple TV'] })), 'rental');
  assert.equal(homeKind(home({}, { UK: ['Apple TV'] })), 'rental');
});

test('no provider anywhere means not yet watchable at home', () => {
  assert.equal(homeKind(home()), null);
  assert.equal(hasHomeProvider(home()), false);
  assert.equal(hasHomeProvider(home({}, { AU: ['Google Play'] })), true);
});

test('a trailer post is only for a title that has not opened', () => {
  assert.equal(awaitingRelease({ release_date: '2026-09-18' }, '2026-09-13'), true);
  assert.equal(awaitingRelease({ release_date: '2026-09-13' }, '2026-09-13'), true);
  assert.equal(awaitingRelease({ release_date: '2026-08-14' }, '2026-09-13'), false);
  assert.equal(awaitingRelease({ release_date: null }, '2026-09-13'), false);
});
