import test from 'node:test';
import assert from 'node:assert/strict';
import { homePersonalState, selectHomeHero, selectHomeUpNext } from '../../home.js';

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

test('selectHomeHero follows the active type chart', () => {
  const heroes = {
    overall: { id: 1, media_type: 'tv', title: 'Overall' },
    tv: { id: 2, media_type: 'tv', title: 'TV' },
    movie: { id: 3, media_type: 'movie', title: 'Movie' },
    cinema: { id: 4, media_type: 'movie', _cinema: true, title: 'Cinema' },
  };

  assert.equal(selectHomeHero(heroes, ['tv', 'cinema', 'movie']).title, 'Overall');
  assert.equal(selectHomeHero(heroes, ['tv']).title, 'TV');
  assert.equal(selectHomeHero(heroes, ['movie']).title, 'Movie');
  assert.equal(selectHomeHero(heroes, ['cinema']).title, 'Cinema');
});
