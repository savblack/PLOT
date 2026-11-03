import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyFailure } from '../../actionFailures.js';
import {
  EPISODE_SEARCH_LIMIT,
  loadSeasonsPaced,
  matchEpisodes,
  normalizeEpisodeText,
  searchableEpisodes,
  seasonFailure,
  withEpisodeWatchState,
} from '../../episodeSearch.js';

const ep = (season_number, episode_number, name, air_date = null) => ({ season_number, episode_number, name, air_date });

test('normalizing drops case, accents and punctuation', () => {
  assert.equal(normalizeEpisodeText('Café — Part 2!'), 'cafe part 2');
  assert.equal(normalizeEpisodeText('  The   One   '), 'the one');
  assert.equal(normalizeEpisodeText(null), '');
});

test('a TMDB season becomes searchable episodes, keeping only real ones', () => {
  const data = { episodes: [
    { episode_number: 1, name: 'Pilot', air_date: '2020-01-01' },
    { episode_number: 2, name: '', air_date: '' },
    { episode_number: 'x', name: 'Bad number' },
    { episode_number: 3, name: 'Third', air_date: '' },
  ] };
  assert.deepEqual(searchableEpisodes(4, data), [
    ep(4, 1, 'Pilot', '2020-01-01'),
    ep(4, 3, 'Third', null),
  ]);
  assert.deepEqual(searchableEpisodes(1, null), []);
});

test('every word must appear, in any order', () => {
  const episodes = [
    ep(1, 1, 'Moving to Austin on a Budget'),
    ep(3, 7, 'Budget Hunt in Austin'),
    ep(2, 4, 'Seattle Starter Home'),
  ];
  const names = matchEpisodes(episodes, 'austin budget').map(e => e.name);
  assert.deepEqual(names.sort(), ['Budget Hunt in Austin', 'Moving to Austin on a Budget']);
});

test('a one-letter query searches nothing', () => {
  assert.deepEqual(matchEpisodes([ep(1, 1, 'A')], 'a'), []);
  assert.deepEqual(matchEpisodes([ep(1, 1, 'A')], ' ! '), []);
});

test('exact title, then prefix, then word starts, then anywhere', () => {
  const episodes = [
    ep(1, 1, 'The Tiny House Showdown'), // word starts
    ep(1, 2, 'Showroom Blues'),           // prefix of a word only, "show" inside
    ep(5, 9, 'Show'),                     // exact
    ep(2, 3, 'Showdown in Ohio'),         // prefix
    ep(1, 4, 'Roadshow'),                 // anywhere
  ];
  assert.deepEqual(matchEpisodes(episodes, 'show').map(e => e.name), [
    'Show',
    'Showroom Blues',
    'Showdown in Ohio',
    'The Tiny House Showdown',
    'Roadshow',
  ]);
});

test('ties sort by season then episode, with specials last', () => {
  const episodes = [ep(0, 1, 'Holiday Special'), ep(2, 1, 'Holiday Rush'), ep(1, 5, 'Holiday Home')];
  assert.deepEqual(matchEpisodes(episodes, 'holiday').map(e => e.season_number), [1, 2, 0]);
});

test('results stop at the limit', () => {
  const episodes = Array.from({ length: EPISODE_SEARCH_LIMIT + 10 }, (_, i) => ep(1, i + 1, `House ${i + 1}`));
  assert.equal(matchEpisodes(episodes, 'house').length, EPISODE_SEARCH_LIMIT);
  assert.equal(matchEpisodes(episodes, 'house', { limit: 3 }).length, 3);
});

test('watched state matches the episode guide: pointer and explicit ticks', () => {
  const results = withEpisodeWatchState(
    [ep(1, 9, 'Earlier season'), ep(2, 2, 'Before pointer'), ep(2, 5, 'At pointer'), ep(3, 1, 'Later'), ep(0, 1, 'Special')],
    { currentSeason: 2, currentEpisode: 5, episodeStates: { '3:1': true } },
  );
  assert.deepEqual(results.map(r => r.isWatched), [true, true, false, true, false]);
});

test('paced loading runs every season, no more than the concurrency at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const got = [];
  await loadSeasonsPaced([1, 2, 3, 4, 5], {
    concurrency: 2,
    spacingMs: 0,
    fetchSeason: async (season) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setImmediate(resolve));
      inFlight -= 1;
      return { season };
    },
    onSeason: (season, data) => got.push([season, data?.season]),
  });
  assert.equal(peak, 2);
  assert.deepEqual(got.map(([s]) => s).sort(), [1, 2, 3, 4, 5]);
  assert.ok(got.every(([s, d]) => s === d));
});

test('a failed season reports null and the rest still load', async () => {
  const got = [];
  await loadSeasonsPaced([1, 2, 3], {
    spacingMs: 0,
    fetchSeason: async (season) => { if (season === 2) throw new Error('429'); return {}; },
    onSeason: (season, data) => got.push([season, data]),
  });
  assert.deepEqual(got.sort((a, b) => a[0] - b[0]), [[1, {}], [2, null], [3, {}]]);
});

test('starts are spaced apart', async () => {
  const waits = [];
  await loadSeasonsPaced([1, 2, 3, 4], {
    concurrency: 2,
    spacingMs: 150,
    sleepFn: async (ms) => { waits.push(ms); },
    fetchSeason: async () => ({}),
    onSeason: () => {},
  });
  // The first start is immediate; every later one waits for its slot.
  assert.equal(waits.length, 3);
  assert.ok(waits.every(ms => ms > 0));
});

test('cancelling stops further requests and drops late results', async () => {
  let cancelled = false;
  const fetched = [];
  const got = [];
  await loadSeasonsPaced([1, 2, 3, 4], {
    concurrency: 1,
    spacingMs: 0,
    fetchSeason: async (season) => { fetched.push(season); if (season === 2) cancelled = true; return {}; },
    onSeason: (season) => got.push(season),
    isCancelled: () => cancelled,
  });
  assert.deepEqual(fetched, [1, 2]);
  assert.deepEqual(got, [1]);
});

test('a failed season keeps its cause for load_failed', () => {
  assert.deepEqual(seasonFailure({ ok: false, status: 429 }), { status: 429, message: '' });
  assert.equal(classifyFailure(seasonFailure({ ok: false, status: 404 })), 'not_found');
  assert.equal(classifyFailure(seasonFailure({ ok: false, status: 503 })), 'server');
  assert.equal(classifyFailure(seasonFailure({ ok: false, status: null })), 'network');
  assert.equal(classifyFailure(seasonFailure(null)), 'network');
});
