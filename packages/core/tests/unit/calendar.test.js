import assert from 'node:assert/strict';
import test from 'node:test';

import {
  msUntilNextLocalMidnight,
  buildWatchlistMovieCalendarEvents,
  buildWatchlistCalendarSignature,
  buildWatchingCalendarSignature,
  buildReminderCalendarSignature,
  getCalendarRelativeLabel,
  buildCalendarEvents,
} from '../../calendar.js';

test('msUntilNextLocalMidnight returns a full day from local midnight', () => {
  assert.equal(msUntilNextLocalMidnight(new Date(2024, 0, 15, 0, 0, 0, 0)), 86400000);
});

test('msUntilNextLocalMidnight returns 1ms from one millisecond before midnight', () => {
  assert.equal(msUntilNextLocalMidnight(new Date(2024, 0, 15, 23, 59, 59, 999)), 1);
});

test('msUntilNextLocalMidnight returns half a day from local noon', () => {
  assert.equal(msUntilNextLocalMidnight(new Date(2024, 0, 15, 12, 0, 0, 0)), 43200000);
});

const today = '2024-06-15';

test('buildWatchlistMovieCalendarEvents returns nothing for a tv item', () => {
  assert.deepEqual(buildWatchlistMovieCalendarEvents({ media_type: 'tv', release_date: '2024-07-01' }, today), []);
});

test('buildWatchlistMovieCalendarEvents returns nothing when there is no release or streaming date', () => {
  assert.deepEqual(buildWatchlistMovieCalendarEvents({ media_type: 'movie' }, today), []);
});

test('buildWatchlistMovieCalendarEvents returns nothing once both dates are in the past', () => {
  const item = { media_type: 'movie', release_date: '2024-01-01', streaming_date: '2024-01-02' };
  assert.deepEqual(buildWatchlistMovieCalendarEvents(item, today), []);
});

test('buildWatchlistMovieCalendarEvents emits a single streaming event when only streaming is upcoming', () => {
  const item = { media_type: 'movie', release_date: '2024-01-01', streaming_date: '2024-07-01' };
  assert.deepEqual(buildWatchlistMovieCalendarEvents(item, today), [
    { date: '2024-07-01', type: 'streaming', label: 'Streaming', item },
  ]);
});

test('buildWatchlistMovieCalendarEvents emits a single same-day event when release and streaming coincide', () => {
  const item = { media_type: 'movie', release_date: '2024-07-01', streaming_date: '2024-07-01' };
  assert.deepEqual(buildWatchlistMovieCalendarEvents(item, today), [
    { date: '2024-07-01', type: 'streaming', label: 'Streaming', item },
  ]);
});

test('buildWatchlistMovieCalendarEvents emits a cinema event plus a later separate streaming event', () => {
  const item = { media_type: 'movie', release_date: '2024-07-01', streaming_date: '2024-08-01' };
  assert.deepEqual(buildWatchlistMovieCalendarEvents(item, today), [
    { date: '2024-07-01', type: 'cinema', label: 'Cinema', item },
    { date: '2024-08-01', type: 'streaming', label: 'Streaming', item },
  ]);
});

test('buildWatchlistMovieCalendarEvents labels a release date with no known streaming date at all as "cinema"', () => {
  // Compare with the case above: knowing about a *later* streaming date makes
  // the release-date event "cinema", and not knowing about one at all should
  // too — a bare release_date with no streaming_date is the one case that
  // most needs a "Cinema" label, since nothing else marks it as a theatrical
  // date rather than a streaming one.
  const item = { media_type: 'movie', release_date: '2024-07-01' };
  assert.deepEqual(buildWatchlistMovieCalendarEvents(item, today), [
    { date: '2024-07-01', type: 'cinema', label: 'Cinema', item },
  ]);
});

test('buildWatchlistMovieCalendarEvents treats a release date equal to today as upcoming', () => {
  const item = { media_type: 'movie', release_date: today };
  assert.deepEqual(buildWatchlistMovieCalendarEvents(item, today), [
    { date: today, type: 'cinema', label: 'Cinema', item },
  ]);
});

test('buildWatchlistCalendarSignature is stable regardless of input order and does not mutate the input', () => {
  const a = { tmdb_id: 1, media_type: 'movie', title: 'B' };
  const b = { tmdb_id: 2, media_type: 'movie', name: 'A' };
  const arr = [b, a];

  const sig1 = buildWatchlistCalendarSignature([a, b]);
  const sig2 = buildWatchlistCalendarSignature(arr);

  assert.equal(sig1, sig2);
  assert.deepEqual(arr, [b, a]);
});

test('buildWatchlistCalendarSignature defaults to an empty signature with no items', () => {
  assert.equal(buildWatchlistCalendarSignature(), '');
});

test('buildWatchlistCalendarSignature prefers title over name and fills missing fields with empty strings', () => {
  const sig = buildWatchlistCalendarSignature([{ tmdb_id: 1, media_type: 'movie', title: 'B', name: 'Ignored' }]);
  assert.equal(sig, '1|movie|B|||');
});

test('buildWatchingCalendarSignature encodes season/episode progress fields', () => {
  const sig = buildWatchingCalendarSignature([{ tmdb_id: 3, current_season: 1, current_episode: 2, title: 'X' }]);
  assert.equal(sig, '3|1|2|X|');
});

test('buildWatchingCalendarSignature defaults to an empty signature with no items', () => {
  assert.equal(buildWatchingCalendarSignature(), '');
});

test('buildReminderCalendarSignature encodes episode air fields', () => {
  const sig = buildReminderCalendarSignature([
    { tvmaze_ep_id: 9, show_name: 'Y', network_name: 'NBC', air_date: '2024-06-15', air_time: '20:00' },
  ]);
  assert.equal(sig, '9|Y|NBC|2024-06-15|20:00');
});

test('buildReminderCalendarSignature defaults to an empty signature with no items', () => {
  assert.equal(buildReminderCalendarSignature(), '');
});

test('getCalendarRelativeLabel recognizes today, tomorrow, and yesterday', () => {
  assert.equal(getCalendarRelativeLabel('2024-06-15', '2024-06-15'), 'Today');
  assert.equal(getCalendarRelativeLabel('2024-06-16', '2024-06-15'), 'Tomorrow');
  assert.equal(getCalendarRelativeLabel('2024-06-14', '2024-06-15'), 'Yesterday');
});

test('getCalendarRelativeLabel formats any other date as a weekday/month/day string', () => {
  assert.equal(getCalendarRelativeLabel('2024-06-20', '2024-06-15'), 'Thursday, Jun 20');
  assert.equal(getCalendarRelativeLabel('2024-06-10', '2024-06-15'), 'Monday, Jun 10');
});

/* ── buildCalendarEvents ──────────────────────────────────────────────────
   The derivation both apps now share. Mobile used to re-derive all of this in
   useCalendarEvents.ts and disagreed on every rule asserted below, so these
   cases are written against the divergences rather than the happy path.
   Fetchers are injected, so none of this touches the network. */

const TODAY = '2026-08-12';

function fakeFetchers({ details = {}, seasons = {} } = {}) {
  return {
    fetchTvDetails: async (id) => details[id] ?? null,
    fetchSeason:    async (id, season) => seasons[`${id}:${season}`] ?? null,
  };
}

test('buildCalendarEvents drops releases that already happened', async () => {
  const events = await buildCalendarEvents({
    watchlist: [
      { tmdb_id: 1, media_type: 'movie', title: 'Past',   release_date: '2026-08-01' },
      { tmdb_id: 2, media_type: 'movie', title: 'Future', release_date: '2026-09-01' },
    ],
    todayStr: TODAY,
    ...fakeFetchers(),
  });

  assert.deepEqual(events.map(e => e.item.title), ['Future']);
});

test('buildCalendarEvents collapses a same-day release and streaming date into one Streaming event', async () => {
  const events = await buildCalendarEvents({
    watchlist: [{
      tmdb_id: 3, media_type: 'movie', title: 'Day And Date',
      release_date: '2026-09-01', streaming_date: '2026-09-01',
    }],
    todayStr: TODAY,
    ...fakeFetchers(),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'streaming');
  assert.equal(events[0].label, 'Streaming');
});

test('buildCalendarEvents labels a cinema window Cinema and keeps the later streaming date', async () => {
  const events = await buildCalendarEvents({
    watchlist: [{
      tmdb_id: 4, media_type: 'movie', title: 'Theatrical',
      release_date: '2026-09-01', streaming_date: '2026-11-01',
    }],
    todayStr: TODAY,
    ...fakeFetchers(),
  });

  assert.deepEqual(
    events.map(e => [e.date, e.label]),
    [['2026-09-01', 'Cinema'], ['2026-11-01', 'Streaming']],
  );
});

test('buildCalendarEvents skips in-progress episodes you are already past', async () => {
  const events = await buildCalendarEvents({
    watching: [{ tmdb_id: 9, title: 'Show', current_season: 2, current_episode: 5 }],
    todayStr: TODAY,
    ...fakeFetchers({
      seasons: {
        '9:2': { episodes: [
          { episode_number: 4, season_number: 2, air_date: '2026-09-01' },
          { episode_number: 5, season_number: 2, air_date: '2026-09-08' },
          { episode_number: 6, season_number: 2, air_date: '2026-09-15' },
        ] },
      },
    }),
  });

  assert.deepEqual(events.map(e => e.label), ['S02E05', 'S02E06']);
});

test('buildCalendarEvents dedupes a show that is both saved and in progress', async () => {
  const events = await buildCalendarEvents({
    watchlist: [{ tmdb_id: 7, media_type: 'tv', title: 'Both' }],
    watching:  [{ tmdb_id: 7, title: 'Both', current_season: 1, current_episode: 1 }],
    todayStr: TODAY,
    ...fakeFetchers({
      details: { 7: { next_episode_to_air: { season_number: 1 } } },
      seasons: { '7:1': { episodes: [{ episode_number: 1, season_number: 1, air_date: '2026-09-01' }] } },
    }),
  });

  assert.equal(events.length, 1);
});

test('buildCalendarEvents returns nothing when cancelled mid-build', async () => {
  const events = await buildCalendarEvents({
    watchlist: [{ tmdb_id: 1, media_type: 'movie', title: 'X', release_date: '2026-09-01' }],
    todayStr: TODAY,
    isCancelled: () => true,
    ...fakeFetchers(),
  });

  assert.deepEqual(events, []);
});

test('buildCalendarEvents survives a fetcher that throws', async () => {
  const events = await buildCalendarEvents({
    watchlist: [
      { tmdb_id: 5, media_type: 'tv', title: 'Broken' },
      { tmdb_id: 6, media_type: 'movie', title: 'Fine', release_date: '2026-09-01' },
    ],
    todayStr: TODAY,
    fetchTvDetails: async () => { throw new Error('TMDB down'); },
    fetchSeason:    async () => null,
  });

  assert.deepEqual(events.map(e => e.item.title), ['Fine']);
});

test('buildCalendarEvents sorts every source into one date order', async () => {
  const events = await buildCalendarEvents({
    watchlist: [{ tmdb_id: 1, media_type: 'movie', title: 'Late', release_date: '2026-12-01' }],
    reminders: [{ tvmaze_ep_id: 11, show_name: 'Early', air_date: '2026-08-20', air_time: '20:30' }],
    todayStr: TODAY,
    ...fakeFetchers(),
  });

  assert.deepEqual(events.map(e => e.date), ['2026-08-20', '2026-12-01']);
  assert.equal(events[0].type, 'reminder');
});
