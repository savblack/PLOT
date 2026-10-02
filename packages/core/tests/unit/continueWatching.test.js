import test from 'node:test';
import assert from 'node:assert/strict';
import { continueItem, continueWatchingItems } from '../../continueWatching.js';
import { selectHomeUpNext } from '../../home.js';

// Ids are negative on purpose: not TMDB ids (AGENTS.md: never guess one).
const details = (lastSeason, lastEpisode, seasons) => ({
  name: 'Show',
  poster_path: '/p.jpg',
  last_episode_to_air: { season_number: lastSeason, episode_number: lastEpisode },
  seasons: [{ season_number: 0, episode_count: 4 }, ...seasons.map((n, i) => ({ season_number: i + 1, episode_count: n }))],
});
const progress = (id, s, e, updated_at = '2026-10-01T00:00:00Z') => ({ tmdb_id: id, title: `Show ${id}`, poster_path: null, current_season: s, current_episode: e, updated_at });

test('an aired, unwatched next episode puts the show on Continue watching', () => {
  const item = continueItem(progress(-1, 2, 7), details(2, 10, [10, 10]));
  assert.equal(item.season, 2);
  assert.equal(item.episode, 7);
  assert.equal(item.latest, false);
  // 16 of the 20 aired episodes watched; specials never count.
  assert.equal(item.progress, 16 / 20);
});

test('the newest aired episode reads as "is out"', () => {
  assert.equal(continueItem(progress(-1, 6, 3), details(6, 3, [6, 6, 6, 6, 6, 6])).latest, true);
});

test('caught up, or waiting for a future episode: not on the shelf', () => {
  assert.equal(continueItem(progress(-1, 6, 4), details(6, 3, [6, 6, 6, 6, 6, 6])), null);
  assert.equal(continueItem(progress(-1, 3, 1), details(2, 8, [8, 8, 8])), null);
  assert.equal(continueItem(progress(-1, 1, 1), { seasons: [] }), null);
  assert.equal(continueItem(progress(-1, 0, 0), details(1, 2, [8])), null);
});

test('the shelf is most recently touched first and skips shows with nothing out', () => {
  const byId = new Map([[-1, details(1, 8, [8])], [-2, details(1, 3, [8])], [-3, details(2, 1, [8, 8])]]);
  const items = continueWatchingItems([
    progress(-1, 1, 4, '2026-09-01T00:00:00Z'),
    progress(-2, 1, 4, '2026-09-30T00:00:00Z'),  // caught up: E4 not out
    progress(-3, 2, 1, '2026-09-20T00:00:00Z'),
  ], byId);
  assert.deepEqual(items.map(i => i.tmdbId), [-3, -1]);
});

test('Up next is future dates only and never repeats a Continue watching show', () => {
  const ev = (id, date) => ({ type: 'episode', date, item: { tmdb_id: id } });
  const events = [ev(-1, '2026-09-30'), ev(-1, '2026-10-02'), ev(-2, '2026-10-03'), ev(-3, '2026-10-04'), ev(-4, '2026-10-05')];
  assert.deepEqual(selectHomeUpNext(events, '2026-10-02', 3).map(e => e.item.tmdb_id), [-1, -2, -3]);
  assert.deepEqual(selectHomeUpNext(events, '2026-10-02', 3, new Set([-1, -3])).map(e => e.item.tmdb_id), [-2, -4]);
});
