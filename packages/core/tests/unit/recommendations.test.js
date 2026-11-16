import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seedWeight, pickSeeds, ownedKeys, becauseYouWatched, recommendedForYou, recKey,
  MIN_BECAUSE_ITEMS,
} from '../../recommendations.js';

// Ids here are made-up fixture numbers for pure functions, never sent to TMDB.
const NOW = Date.parse('2026-11-16T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

const row = (id, extra = {}) => ({ tmdb_id: id, media_type: 'movie', title: `T${id}`, watched_at: daysAgo(1), genre_ids: [18], ...extra });
const rec = (id, extra = {}) => ({ id, media_type: 'movie', title: `R${id}`, poster_path: `/p${id}.jpg`, genre_ids: [18], ...extra });
const details = (...ids) => ({ recommendations: { results: ids.map(id => (typeof id === 'object' ? id : rec(id))) } });

test('seedWeight drops did-not-finish and low ratings, prefers high ratings', () => {
  assert.equal(seedWeight(row(1, { dnf: true, rating: 10 }), NOW), 0);
  assert.equal(seedWeight(row(1, { rating: 4 }), NOW), 0);
  assert.ok(seedWeight(row(1, { rating: 10 }), NOW) > seedWeight(row(2), NOW));
});

test('seedWeight: recency counts, but an old favorite beats last night\'s unrated title', () => {
  assert.ok(seedWeight(row(1, { rating: 8 }), NOW) > seedWeight(row(1, { rating: 8, watched_at: daysAgo(400) }), NOW));
  assert.ok(seedWeight(row(1, { rating: 10, watched_at: daysAgo(700) }), NOW) > seedWeight(row(2, { watched_at: daysAgo(0) }), NOW));
});

test('pickSeeds keeps one row per title, strongest first, and skips episodes and bad rows', () => {
  const seeds = pickSeeds([
    row(1, { rating: 6 }),
    row(1, { rating: 10 }), // a rewatch rated higher wins
    row(2, { rating: 8 }),
    row(3, { media_type: 'episode' }),
    row(4, { dnf: true }),
    { tmdb_id: null, media_type: 'movie' },
  ], { now: NOW });
  assert.deepEqual(seeds.map(s => s.tmdbId), [1, 2]);
  assert.equal(seeds[0].title, 'T1');
});

test('pickSeeds caps at the limit', () => {
  const history = Array.from({ length: 20 }, (_, i) => row(i + 1));
  assert.equal(pickSeeds(history, { now: NOW, limit: 5 }).length, 5);
});

test('ownedKeys reads tmdb_id or id across lists', () => {
  const keys = ownedKeys([{ tmdb_id: 1, media_type: 'movie' }], [{ id: 2, media_type: 'tv' }], undefined);
  assert.deepEqual([...keys].sort(), ['movie:1', 'tv:2']);
});

test('becauseYouWatched leaves out owned titles and needs enough to show', () => {
  const seeds = pickSeeds([row(1, { rating: 10 })], { now: NOW });
  const owned = new Set([recKey('movie', 11)]);
  const byKey = new Map([['movie:1', details(11, 12, 13, 14, 15)]]);
  const shelf = becauseYouWatched(seeds, byKey, { owned, today: '2026-11-16' });
  assert.equal(shelf?.seed.tmdbId, 1);
  assert.deepEqual(shelf.items.map(i => i.id), [12, 13, 14, 15]);

  const thin = new Map([['movie:1', details(...Array.from({ length: MIN_BECAUSE_ITEMS - 1 }, (_, i) => 20 + i))]]);
  assert.equal(becauseYouWatched(seeds, thin, { owned: new Set(), today: '2026-11-16' }), null);
});

test('becauseYouWatched rotates daily among the top seeds', () => {
  const seeds = pickSeeds([row(1, { rating: 10 }), row(2, { rating: 9 }), row(3, { rating: 8 })], { now: NOW });
  const byKey = new Map([
    ['movie:1', details(11, 12, 13, 14)],
    ['movie:2', details(21, 22, 23, 24)],
    ['movie:3', details(31, 32, 33, 34)],
  ]);
  const picked = new Set(['2026-11-16', '2026-11-17', '2026-11-18']
    .map(today => becauseYouWatched(seeds, byKey, { owned: new Set(), today })?.seed.tmdbId));
  assert.deepEqual([...picked].sort(), [1, 2, 3]);
});

test('becauseYouWatched keeps kids titles out unless a seed is one', () => {
  const kid = rec(12, { genre_ids: [10751] });
  const byKey = new Map([['movie:1', details(11, kid, 13, 14, 15)]]);
  const adult = pickSeeds([row(1)], { now: NOW });
  assert.ok(!becauseYouWatched(adult, byKey, { owned: new Set(), today: '2026-11-16' }).items.some(i => i.id === 12));
  const family = pickSeeds([row(1, { genre_ids: [10751] })], { now: NOW });
  assert.ok(becauseYouWatched(family, byKey, { owned: new Set(), today: '2026-11-16' }).items.some(i => i.id === 12));
});

test('recommendedForYou ranks titles several seeds agree on first, and says why', () => {
  const seeds = pickSeeds([row(1, { rating: 10 }), row(2, { rating: 8 }), row(3, { rating: 8 })], { now: NOW });
  const byKey = new Map([
    ['movie:1', details(50, 99)],
    ['movie:2', details(60, 99)],
    ['movie:3', details(70, 99)],
  ]);
  const items = recommendedForYou(seeds, byKey, { owned: new Set() });
  assert.equal(items[0].id, 99);
  assert.equal(items[0]._because, 'T1');
  assert.deepEqual(items.map(i => i.id).sort(), [50, 60, 70, 99]);
});

test('recommendedForYou skips owned and excluded titles, and needs three seeds', () => {
  const seeds = pickSeeds([row(1), row(2), row(3)], { now: NOW });
  const byKey = new Map([['movie:1', details(10, 11)], ['movie:2', details(12)], ['movie:3', details(13)]]);
  const items = recommendedForYou(seeds, byKey, { owned: new Set(['movie:10']), exclude: new Set(['movie:11']) });
  assert.deepEqual(items.map(i => i.id).sort(), [12, 13]);

  const two = new Map([['movie:1', details(10)], ['movie:2', details(12)]]);
  assert.deepEqual(recommendedForYou(seeds, two, { owned: new Set() }), []);
});

test('recommendedForYou breaks a tie toward the viewer\'s usual genres', () => {
  const seeds = pickSeeds([row(1, { genre_ids: [27] }), row(2, { genre_ids: [27] }), row(3, { genre_ids: [27] })], { now: NOW });
  const horror = rec(80, { genre_ids: [27] });
  const comedy = rec(81, { genre_ids: [35] });
  const byKey = new Map([['movie:1', details(comedy)], ['movie:2', details(horror)], ['movie:3', details(82)]]);
  const ids = recommendedForYou(seeds, byKey, { owned: new Set() }).map(i => i.id);
  assert.ok(ids.indexOf(80) < ids.indexOf(81));
});
