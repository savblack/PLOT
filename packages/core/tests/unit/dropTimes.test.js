import test from 'node:test';
import assert from 'node:assert/strict';
import { airingKey, applyDropTimes, exactDropFor, fetchEpisodeAirings, localDrop } from '../../dropTimes.js';
import { nextEpisodeLine } from '../../episodeAlerts.js';

// Exact drop times on screen. The bar: a wrong time is worse than the day, so
// most of these pin down when the time is NOT shown.
//
// Ids are negative or fictional on purpose: not TMDB ids (AGENTS.md: never
// guess one); the rules only use them as keys.

const SHOW = -7;
// 9:00 PM Eastern on Wednesday Dec 2, as TVmaze would store it.
const AIRING = { tmdb_id: SHOW, season_number: 6, episode_number: 7, air_date: '2026-12-02', airs_at: '2026-12-03T02:00:00+00:00', time_source: 'exact' };
const airings = new Map([[airingKey(SHOW, 6, 7), AIRING]]);
const tmdbEp = (over = {}) => ({ season_number: 6, episode_number: 7, air_date: '2026-12-02', ...over });

test('a matching exact airing gives its instant', () => {
  assert.equal(exactDropFor(airings, SHOW, tmdbEp()), AIRING.airs_at);
});

test('dates a day apart still match (time zones); further apart do not', () => {
  assert.equal(exactDropFor(airings, SHOW, tmdbEp({ air_date: '2026-12-03' })), AIRING.airs_at);
  assert.equal(exactDropFor(airings, SHOW, tmdbEp({ air_date: '2026-12-04' })), null);
});

test('no time without an exact airing, numbers, or a TMDB date', () => {
  const dateOnly = new Map([[airingKey(SHOW, 6, 7), { ...AIRING, time_source: 'date', airs_at: null }]]);
  assert.equal(exactDropFor(dateOnly, SHOW, tmdbEp()), null);
  assert.equal(exactDropFor(airings, SHOW, tmdbEp({ episode_number: 8 })), null);
  assert.equal(exactDropFor(airings, SHOW, tmdbEp({ season_number: undefined })), null);
  assert.equal(exactDropFor(airings, SHOW, tmdbEp({ air_date: null })), null);
  assert.equal(exactDropFor(airings, -8, tmdbEp()), null);
});

test('the time is shown in the viewer’s clock, and can land on another date', () => {
  assert.deepEqual(localDrop(AIRING.airs_at, 'America/New_York'), { date: '2026-12-02', time: '9:00 PM' });
  assert.deepEqual(localDrop(AIRING.airs_at, 'America/Los_Angeles'), { date: '2026-12-02', time: '6:00 PM' });
  assert.deepEqual(localDrop(AIRING.airs_at, 'Europe/London'), { date: '2026-12-03', time: '2:00 AM' });
});

const episodeEvent = (over = {}) => ({
  date: '2026-12-02', type: 'episode', label: 'S06E07',
  item: { title: 'Show', tmdb_id: SHOW, media_type: 'tv', network_name: 'ABC', episode: tmdbEp() },
  ...over,
});

test('calendar events gain the time on their meta line and move to the local date', () => {
  const [ev] = applyDropTimes([episodeEvent()], airings, { timeZone: 'Europe/London' });
  assert.equal(ev.item.air_time, '2:00 AM');
  assert.equal(ev.date, '2026-12-03');
  assert.equal(ev.drops_at, AIRING.airs_at);
});

test('other events, and episodes with no match, are left exactly as they were', () => {
  const movie = { date: '2026-12-01', type: 'streaming', item: { tmdb_id: -9, media_type: 'movie' } };
  const unmatched = episodeEvent({ item: { ...episodeEvent().item, episode: tmdbEp({ episode_number: 8 }) } });
  const out = applyDropTimes([unmatched, movie], airings, { timeZone: 'America/New_York' });
  assert.deepEqual(out, [movie, unmatched]);
  assert.equal(unmatched.item.air_time, undefined);
});

test('the input events are not changed', () => {
  const ev = episodeEvent();
  applyDropTimes([ev], airings, { timeZone: 'Europe/London' });
  assert.equal(ev.date, '2026-12-02');
  assert.equal(ev.item.air_time, undefined);
});

test('an event whose local drop date is already past is dropped', () => {
  const out = applyDropTimes([episodeEvent()], airings, { timeZone: 'America/New_York', todayStr: '2026-12-03' });
  assert.deepEqual(out, []);
});

test('a failed read falls back to the day, never an error', async () => {
  const failing = { from: () => { throw new Error('offline'); } };
  assert.equal((await fetchEpisodeAirings([1], { client: failing })).size, 0);
  const erroring = { from: () => chain({ data: null, error: { message: 'nope' } }) };
  assert.equal((await fetchEpisodeAirings([1], { client: erroring })).size, 0);
  assert.equal((await fetchEpisodeAirings([], { client: failing })).size, 0);
});

test('reads only exact, upcoming rows and keys them', async () => {
  const calls = [];
  const client = { from: (table) => { calls.push(table); return chain({ data: [AIRING], error: null }, calls); } };
  // The read skips non-positive ids, so a positive stand-in is passed; the fake
  // client ignores it and returns AIRING.
  const out = await fetchEpisodeAirings([7], { client, now: new Date('2026-12-01T00:00:00Z') });
  assert.equal(out.get(airingKey(SHOW, 6, 7)), AIRING);
  assert.deepEqual(calls.slice(0, 1), ['episode_airings']);
  assert.ok(calls.some(c => c === 'eq:time_source:exact'));
  assert.ok(calls.some(c => c === 'gte:airs_at:2026-11-30T00:00:00.000Z'));
});

test('the Episode alerts card says the day and the time when it knows both', () => {
  const details = { next_episode_to_air: tmdbEp() };
  const line = nextEpisodeLine(details, '2026-11-19', AIRING.airs_at, 'America/New_York');
  assert.equal(line.when, 'Wed, Dec 2 at 9:00 PM');
  assert.equal(nextEpisodeLine(details, '2026-11-19').when, 'Wed, Dec 2');
});

/** A minimal PostgREST query builder that resolves to `result`. */
function chain(result, calls = []) {
  const q = {
    select: () => q,
    in: () => q,
    eq: (col, val) => { calls.push(`eq:${col}:${val}`); return q; },
    gte: (col, val) => { calls.push(`gte:${col}:${val}`); return q; },
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}
