import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAKE_MIN_SAMPLE, BRAKE_SYNC_STALE_HOURS, DUE_LOOK_BACK_HOURS,
  brakeReason, dropAlertsKilled, dueDrops, tmdbAgrees,
} from '../../../../supabase/functions/_shared/dropAlerts.js';

// Alerts at the minute an episode drops. The bar: an early or false alert is
// worse than a late one, so most of these pin down when nothing is sent.
//
// Ids are negative or fictional on purpose: not TMDB ids (AGENTS.md: never
// guess one); the rules only use them as keys.

const NOW = new Date('2026-11-20T02:05:00.000Z'); // 9:05 PM Eastern
const HOUR = 60 * 60 * 1000;
const at = (ms) => new Date(NOW.getTime() + ms).toISOString();
const airing = (over = {}) => ({
  tmdb_id: -1, season_number: 2, episode_number: 4, air_date: '2026-11-19',
  airs_at: at(-5 * 60 * 1000), time_source: 'exact', changed_at: null, ...over,
});

test('a drop five minutes ago is due', () => {
  assert.deepEqual(dueDrops([airing()], NOW), [{
    tmdbId: -1, season: 2, firstEpisode: 4, count: 1, airsAt: at(-5 * 60 * 1000), airDate: '2026-11-19',
  }]);
});

test('a drop still ahead is never due, not even a minute early', () => {
  assert.deepEqual(dueDrops([airing({ airs_at: at(60 * 1000) })], NOW), []);
});

test('a drop older than the look-back is left to the daily job', () => {
  assert.equal(dueDrops([airing({ airs_at: at(-DUE_LOOK_BACK_HOURS * HOUR) })], NOW).length, 0);
  assert.equal(dueDrops([airing({ airs_at: at(-DUE_LOOK_BACK_HOURS * HOUR + 60_000) })], NOW).length, 1);
});

test('date-only airings never alert at a minute', () => {
  assert.deepEqual(dueDrops([airing({ time_source: 'date', airs_at: null })], NOW), []);
});

test('episodes released together are one drop; a gap splits it; a later time is its own drop', () => {
  const drops = dueDrops([
    airing({ episode_number: 3 }), airing({ episode_number: 1 }), airing({ episode_number: 2 }),
    airing({ episode_number: 5 }),
    airing({ episode_number: 6, airs_at: at(-60 * 1000) }),
  ], NOW);
  assert.deepEqual(drops.map(d => [d.firstEpisode, d.count]), [[1, 3], [5, 1], [6, 1]]);
});

test('the same instant written two ways is one drop', () => {
  const drops = dueDrops([
    airing({ episode_number: 1, airs_at: '2026-11-20T02:00:00+00:00' }),
    airing({ episode_number: 2, airs_at: '2026-11-20T02:00:00.000Z' }),
  ], NOW);
  assert.deepEqual(drops.map(d => [d.firstEpisode, d.count]), [[1, 2]]);
});

test('TMDB must date the same episode within a day', () => {
  const drop = { airDate: '2026-11-19' };
  assert.equal(tmdbAgrees({ air_date: '2026-11-19' }, drop), true);
  assert.equal(tmdbAgrees({ air_date: '2026-11-20' }, drop), true);
  assert.equal(tmdbAgrees({ air_date: '2026-11-21' }, drop), false);
  assert.equal(tmdbAgrees({ air_date: null }, drop), false);
  assert.equal(tmdbAgrees(undefined, drop), false);
});

const synced = at(-30 * 60 * 1000);
const nearby = (moved, total) => Array.from({ length: total }, (_, i) => airing({
  tmdb_id: -(i + 1), airs_at: at(HOUR), changed_at: i < moved ? at(-2 * HOUR) : null,
}));

test('brake: trips when more than 10% of nearby drops moved in the last day', () => {
  assert.equal(brakeReason(nearby(2, 10), synced, NOW), 'times_moving');
  assert.equal(brakeReason(nearby(1, 10), synced, NOW), null);
});

test('brake: too few nearby drops to judge is not a trip', () => {
  assert.equal(brakeReason(nearby(3, BRAKE_MIN_SAMPLE - 1), synced, NOW), null);
});

test('brake: an old move does not count', () => {
  const old = nearby(0, 10).map((a, i) => (i < 5 ? { ...a, changed_at: at(-30 * HOUR) } : a));
  assert.equal(brakeReason(old, synced, NOW), null);
});

test('brake: a stale or missing time sync trips it', () => {
  assert.equal(brakeReason([], null, NOW), 'sync_stale');
  assert.equal(brakeReason([], at(-(BRAKE_SYNC_STALE_HOURS * HOUR + 60_000)), NOW), 'sync_stale');
  assert.equal(brakeReason([], at(-(BRAKE_SYNC_STALE_HOURS * HOUR - 60_000)), NOW), null);
});

test('kill switch: only an answered, enabled flag stops alerts', () => {
  assert.equal(dropAlertsKilled({ flags: { 'kill-episode-drop-alerts': { enabled: true } } }), true);
  assert.equal(dropAlertsKilled({ featureFlags: { 'kill-episode-drop-alerts': true } }), true);
  assert.equal(dropAlertsKilled({ flags: { 'kill-episode-drop-alerts': { enabled: false } } }), false);
  assert.equal(dropAlertsKilled({ flags: {} }), false);
  assert.equal(dropAlertsKilled({ errorsWhileComputingFlags: true, featureFlags: { 'kill-episode-drop-alerts': true } }), false);
  assert.equal(dropAlertsKilled(null), false);
});
