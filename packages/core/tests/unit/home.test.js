import test from 'node:test';
import assert from 'node:assert/strict';
import { homePersonalState, selectHomeUpNext } from '../../home.js';

test('selectHomeUpNext keeps the next distinct shows with episodes', () => {
  const events = [
    { date: '2026-09-18', type: 'episode', item: { tmdb_id: 1, title: 'Past' } },
    { date: '2026-09-20', type: 'episode', item: { tmdb_id: 2, title: 'First' } },
    { date: '2026-09-21', type: 'episode', item: { tmdb_id: 2, title: 'First' } },
    { date: '2026-09-22', type: 'cinema', item: { tmdb_id: 3, title: 'Film' } },
    { date: '2026-09-23', type: 'episode', item: { tmdb_id: 4, title: 'Second' } },
  ];
  assert.deepEqual(selectHomeUpNext(events, '2026-09-19').map(event => event.item.title), ['First', 'Second']);
});

test('homePersonalState distinguishes new and established accounts', () => {
  assert.equal(homePersonalState({ loading: true }), 'loading');
  assert.equal(homePersonalState({ upNext: [{}] }), 'up-next');
  assert.equal(homePersonalState({}), 'start');
  assert.equal(homePersonalState({ savedCount: 1 }), 'quiet');
  assert.equal(homePersonalState({ watchingCount: 1 }), 'quiet');
});
