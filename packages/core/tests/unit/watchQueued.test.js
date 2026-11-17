import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALENDAR_SUGGESTIONS_SOURCE, QUICK_ADD_SOURCE, onPendingWatchQueued,
  notifyPendingWatchQueued, shouldOpenPendingWatchPanel,
} from '../../watchQueued.js';

// Opaque integers for queue tests only. Derived from dates so they are not guessed
// TMDB catalog ids and are never passed to tmdb.search.
const FIXTURE_MOVIE_ID = Date.parse('2099-01-01T00:00:00.000Z');
const FIXTURE_TV_ID = Date.parse('2099-01-02T00:00:00.000Z');

test('onPendingWatchQueued notifies subscribers and unsubscribe stops delivery', () => {
  const seen = [];
  const stop = onPendingWatchQueued((p) => seen.push(p));
  notifyPendingWatchQueued({ tmdb_id: FIXTURE_MOVIE_ID, media_type: 'movie', source: 'in_app' });
  assert.deepEqual(seen, [{ tmdb_id: FIXTURE_MOVIE_ID, media_type: 'movie', source: 'in_app' }]);
  stop();
  notifyPendingWatchQueued({ tmdb_id: FIXTURE_TV_ID, media_type: 'tv' });
  assert.equal(seen.length, 1);
});

test('a listener that throws does not stop the others or the save', () => {
  const seen = [];
  const stopBad = onPendingWatchQueued(() => { throw new Error('boom'); });
  const stopGood = onPendingWatchQueued((p) => seen.push(p));
  assert.doesNotThrow(() => notifyPendingWatchQueued({ tmdb_id: FIXTURE_MOVIE_ID, media_type: 'movie' }));
  assert.equal(seen.length, 1);
  stopBad();
  stopGood();
});

test('quick-add and calendar saves stay on their surface while ordinary saves open a panel', () => {
  assert.equal(shouldOpenPendingWatchPanel(QUICK_ADD_SOURCE), false);
  assert.equal(shouldOpenPendingWatchPanel(CALENDAR_SUGGESTIONS_SOURCE), false);
  assert.equal(shouldOpenPendingWatchPanel('in_app'), true);
  assert.equal(shouldOpenPendingWatchPanel(undefined), true);
});
