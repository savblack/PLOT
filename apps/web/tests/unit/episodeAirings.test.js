import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KEEP_AHEAD_DAYS, KEEP_PAST_DAYS, RELINK_AFTER_DAYS, RESYNC_AFTER_HOURS,
  airingRow, dedupeRows, isoDay, linkLookups, linkQueue, syncQueue, venueOf, withChanges, withdrawnRows,
} from '../../../../supabase/functions/_shared/episodeAirings.js';

// The rules behind exact episode drop times. The bar: a wrong time is worse than
// no time, so most of these pin down when a time is NOT stored.
//
// Ids are negative or fictional on purpose: they are not TMDB ids (AGENTS.md:
// never guess one), and the rules only use them as keys.

const NOW = new Date('2026-11-19T10:00:00.000Z');
const SHOW = -1;

const ep = (over = {}) => ({
  id: 9001, type: 'regular', season: 2, number: 4,
  airdate: '2026-11-21', airtime: '21:00', airstamp: '2026-11-22T02:00:00+00:00', runtime: 60,
  ...over,
});

test('a filled-in airtime is an exact instant', () => {
  const row = airingRow(ep(), SHOW, NOW);
  assert.equal(row.time_source, 'exact');
  assert.equal(row.airs_at, '2026-11-22T02:00:00.000Z');
  assert.equal(row.air_time, '21:00');
  assert.equal(row.air_date, '2026-11-21');
  assert.equal(row.runtime_minutes, 60);
});

test('a blank airtime is a date only, even though TVmaze sends a placeholder airstamp', () => {
  // Severance on Apple TV: airtime "" and airstamp 12:00 UTC on every episode.
  const row = airingRow(ep({ airtime: '', airstamp: '2026-11-21T12:00:00+00:00' }), SHOW, NOW);
  assert.equal(row.time_source, 'date');
  assert.equal(row.airs_at, null);
  assert.equal(row.air_time, null);
});

test('an airtime with no usable airstamp is a date only', () => {
  assert.equal(airingRow(ep({ airstamp: null }), SHOW, NOW).time_source, 'date');
  assert.equal(airingRow(ep({ airstamp: 'soon' }), SHOW, NOW).time_source, 'date');
});

test('specials, unnumbered and undated episodes are not stored', () => {
  assert.equal(airingRow(ep({ type: 'significant_special' }), SHOW, NOW), null);
  assert.equal(airingRow(ep({ number: null }), SHOW, NOW), null);
  assert.equal(airingRow(ep({ airdate: '' }), SHOW, NOW), null);
  assert.equal(airingRow(null, SHOW, NOW), null);
});

test('only the kept window is stored', () => {
  assert.ok(airingRow(ep({ airdate: isoDay(NOW, -KEEP_PAST_DAYS) }), SHOW, NOW));
  assert.equal(airingRow(ep({ airdate: isoDay(NOW, -KEEP_PAST_DAYS - 1) }), SHOW, NOW), null);
  assert.ok(airingRow(ep({ airdate: isoDay(NOW, KEEP_AHEAD_DAYS) }), SHOW, NOW));
  assert.equal(airingRow(ep({ airdate: isoDay(NOW, KEEP_AHEAD_DAYS + 1) }), SHOW, NOW), null);
});

test('lookups go TheTVDB first, then IMDb, and never by title', () => {
  assert.deepEqual(linkLookups({ tvdb_id: 371980, imdb_id: 'tt11280740' }), [
    { source: 'thetvdb', value: '371980' },
    { source: 'imdb', value: 'tt11280740' },
  ]);
  assert.deepEqual(linkLookups({ tvdb_id: null, imdb_id: 'tt1' }), [{ source: 'imdb', value: 'tt1' }]);
  assert.deepEqual(linkLookups({ tvdb_id: 0, imdb_id: '' }), []);
  assert.deepEqual(linkLookups(null), []);
});

test('venue: a network carries its country and time zone; a worldwide streamer has none', () => {
  assert.deepEqual(venueOf({ network: { name: 'ABC', country: { code: 'us', timezone: 'America/New_York' } } }),
    { kind: 'network', name: 'ABC', country: 'US', timezone: 'America/New_York' });
  assert.deepEqual(venueOf({ network: null, webChannel: { name: 'Apple TV', country: null } }),
    { kind: 'web', name: 'Apple TV', country: null, timezone: null });
  assert.deepEqual(venueOf({}), { kind: null, name: null, country: null, timezone: null });
});

test('a duplicate episode number keeps the row with a time', () => {
  const dated = airingRow(ep({ id: 1, airtime: '' }), SHOW, NOW);
  const timed = airingRow(ep({ id: 2 }), SHOW, NOW);
  assert.deepEqual(dedupeRows([dated, timed]), [timed]);
  assert.deepEqual(dedupeRows([timed, dated]), [timed]);
});

test('a moved drop time keeps the old value and when it moved', () => {
  const row = airingRow(ep(), SHOW, NOW);
  const existing = new Map([['2:4', { air_date: '2026-11-21', airs_at: '2026-11-22T01:00:00+00:00' }]]);
  const [out] = withChanges([row], existing, NOW);
  assert.equal(out.previous_airs_at, '2026-11-22T01:00:00+00:00');
  assert.equal(out.previous_air_date, '2026-11-21');
  assert.equal(out.changed_at, NOW.toISOString());
});

test('the same instant in another format is not a change', () => {
  const row = airingRow(ep(), SHOW, NOW);
  const existing = new Map([['2:4', { air_date: '2026-11-21', airs_at: '2026-11-22T02:00:00+00:00' }]]);
  assert.equal(withChanges([row], existing, NOW)[0].changed_at, null);
});

test('an unchanged row keeps its last recorded move, so a batch upsert cannot wipe it', () => {
  // A batch upsert nulls any column a row leaves out. Every row must carry the
  // three change columns, and an unchanged one carries its stored values.
  const moved = airingRow(ep({ id: 1, number: 4 }), SHOW, NOW);
  const steady = airingRow(ep({ id: 2, number: 5 }), SHOW, NOW);
  const existing = new Map([
    ['2:4', { air_date: '2026-11-21', airs_at: '2026-11-22T01:00:00+00:00' }],
    ['2:5', { air_date: '2026-11-21', airs_at: '2026-11-22T02:00:00+00:00',
      previous_air_date: '2026-11-20', previous_airs_at: '2026-11-21T02:00:00+00:00', changed_at: '2026-11-15T00:00:00.000Z' }],
  ]);
  const [, out] = withChanges([moved, steady], existing, NOW);
  assert.equal(out.changed_at, '2026-11-15T00:00:00.000Z');
  assert.equal(out.previous_air_date, '2026-11-20');
  assert.equal(out.previous_airs_at, '2026-11-21T02:00:00+00:00');
});

test('a first sighting is not a change; gaining a time is', () => {
  const row = airingRow(ep(), SHOW, NOW);
  const [first] = withChanges([row], new Map(), NOW);
  assert.deepEqual([first.changed_at, first.previous_air_date, first.previous_airs_at], [null, null, null]);
  const existing = new Map([['2:4', { air_date: '2026-11-21', airs_at: null }]]);
  assert.equal(withChanges([row], existing, NOW)[0].changed_at, NOW.toISOString());
});

test('sync order: never synced, then changed on TVmaze, then stale; fresh ones wait', () => {
  const recent = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
  const old = new Date(NOW.getTime() - (RESYNC_AFTER_HOURS + 1) * 60 * 60 * 1000).toISOString();
  const links = [
    { tmdb_id: -1, tvmaze_id: 1, synced_at: old, tvmaze_updated: 100 },
    { tmdb_id: -2, tvmaze_id: 2, synced_at: recent, tvmaze_updated: 100 },
    { tmdb_id: -3, tvmaze_id: 3, synced_at: recent, tvmaze_updated: 100 },
    { tmdb_id: -4, tvmaze_id: 4, synced_at: null, tvmaze_updated: null },
  ];
  const queue = syncQueue(links, { 2: 200, 3: 100 }, NOW).map(l => l.tmdb_id);
  assert.deepEqual(queue, [-4, -2, -1]);
});

test('linking: new shows, and no-match shows only after the relink wait', () => {
  const longAgo = new Date(NOW.getTime() - (RELINK_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  const links = new Map([
    [-1, { tvmaze_id: 5, checked_at: longAgo }],
    [-2, { tvmaze_id: null, checked_at: NOW.toISOString() }],
    [-3, { tvmaze_id: null, checked_at: longAgo }],
  ]);
  assert.deepEqual(linkQueue([-1, -2, -3, -4], links, NOW), [-3, -4]);
});

test('an episode TVmaze no longer lists in the window is withdrawn', () => {
  // Pulled to TBA (airingRow returns null), pushed out, or renumbered: its stored
  // time will not happen, so it must not stay for an alert to act on.
  const existing = [{ season_number: 2, episode_number: 4 }, { season_number: 2, episode_number: 5 }];
  const fresh = [airingRow(ep({ number: 4 }), SHOW, NOW), airingRow(ep({ number: 5, airdate: 'TBA' }), SHOW, NOW)].filter(Boolean);
  assert.deepEqual(withdrawnRows(existing, fresh), [{ season_number: 2, episode_number: 5 }]);
  assert.deepEqual(withdrawnRows([], fresh), []);
});
