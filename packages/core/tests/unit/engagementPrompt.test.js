import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGAGEMENT_SNOOZE_KEY,
  ENGAGEMENT_PENDING_KEY,
  WATCH_PROMPT_SNOOZE_MS,
  RATE_PROMPT_SNOOZE_MS,
  PENDING_WATCH_TTL_MS,
  engagementTitleKey,
  parseEngagementSnooze,
  serialiseEngagementSnooze,
  isEngagementSnoozed,
  snoozeEngagement,
  clearEngagementSnooze,
  canShowWatchPrompt,
  canShowRatePrompt,
  parseEngagementPending,
  serialiseEngagementPending,
  buildPendingWatch,
  isPendingWatchFresh,
  pendingWatchMatches,
  onPendingWatchQueued,
  notifyPendingWatchQueued,
} from '../../engagementPrompt.js';

// Opaque fixture ids only. Never sent to TMDB; picked high so they cannot
// collide with a real catalog hit if a future test wiring mistake calls out.
const FIXTURE_MOVIE_ID = 9_000_001;
const FIXTURE_TV_ID = 9_000_002;
const FIXTURE_OTHER_TV_ID = 9_000_003;

test('engagementTitleKey normalises id + media type', () => {
  assert.equal(engagementTitleKey(FIXTURE_MOVIE_ID, 'movie'), `movie:${FIXTURE_MOVIE_ID}`);
  assert.equal(engagementTitleKey(String(FIXTURE_TV_ID), 'tv'), `tv:${FIXTURE_TV_ID}`);
});

test('ENGAGEMENT_SNOOZE_KEY is stable across platforms', () => {
  assert.equal(ENGAGEMENT_SNOOZE_KEY, 'plot_engagement_prompt_snooze');
});

test('parseEngagementSnooze tolerates null, garbage, and non-objects', () => {
  assert.deepEqual(parseEngagementSnooze(null), {});
  assert.deepEqual(parseEngagementSnooze(undefined), {});
  assert.deepEqual(parseEngagementSnooze('not-json'), {});
  assert.deepEqual(parseEngagementSnooze('[]'), {});
  assert.deepEqual(parseEngagementSnooze(`{"movie:${FIXTURE_MOVIE_ID}":"nope"}`), {});
});

test('parse / serialise round-trip keeps finite until timestamps', () => {
  const map = { [`movie:${FIXTURE_MOVIE_ID}`]: { watch: 100, rate: 200 } };
  assert.deepEqual(parseEngagementSnooze(serialiseEngagementSnooze(map)), map);
});

test('isEngagementSnoozed is true only while until is in the future', () => {
  const map = { [`tv:${FIXTURE_TV_ID}`]: { watch: 1_000, rate: 5_000 } };
  assert.equal(isEngagementSnoozed(map, `tv:${FIXTURE_TV_ID}`, 'watch', 999), true);
  assert.equal(isEngagementSnoozed(map, `tv:${FIXTURE_TV_ID}`, 'watch', 1_000), false);
  assert.equal(isEngagementSnoozed(map, `tv:${FIXTURE_TV_ID}`, 'rate', 4_999), true);
  assert.equal(isEngagementSnoozed(map, `tv:${FIXTURE_TV_ID}`, 'rate', 5_000), false);
  assert.equal(isEngagementSnoozed(map, `movie:${FIXTURE_MOVIE_ID}`, 'watch', 0), false);
});

test('snoozeEngagement writes until = now + duration without clobbering the other kind', () => {
  const now = 1_000;
  const key = `movie:${FIXTURE_MOVIE_ID}`;
  let map = snoozeEngagement({}, key, 'watch', WATCH_PROMPT_SNOOZE_MS, now);
  assert.equal(map[key].watch, now + WATCH_PROMPT_SNOOZE_MS);
  map = snoozeEngagement(map, key, 'rate', RATE_PROMPT_SNOOZE_MS, now);
  assert.equal(map[key].watch, now + WATCH_PROMPT_SNOOZE_MS);
  assert.equal(map[key].rate, now + RATE_PROMPT_SNOOZE_MS);
});

test('clearEngagementSnooze drops one kind or the whole title', () => {
  const movieKey = `movie:${FIXTURE_MOVIE_ID}`;
  const tvKey = `tv:${FIXTURE_TV_ID}`;
  const map = { [movieKey]: { watch: 10, rate: 20 }, [tvKey]: { watch: 30 } };
  assert.deepEqual(clearEngagementSnooze(map, movieKey, 'watch'), {
    [movieKey]: { rate: 20 },
    [tvKey]: { watch: 30 },
  });
  assert.deepEqual(clearEngagementSnooze(map, movieKey), { [tvKey]: { watch: 30 } });
  assert.deepEqual(clearEngagementSnooze(map, tvKey, 'watch'), { [movieKey]: { watch: 10, rate: 20 } });
});

test('canShowWatchPrompt requires not watched and not snoozed', () => {
  assert.equal(canShowWatchPrompt({ watched: false, snoozed: false }), true);
  assert.equal(canShowWatchPrompt({ watched: true, snoozed: false }), false);
  assert.equal(canShowWatchPrompt({ watched: false, snoozed: true }), false);
});

test('canShowRatePrompt requires watched, no rating, not snoozed', () => {
  assert.equal(canShowRatePrompt({ watched: true, hasRating: false, snoozed: false }), true);
  assert.equal(canShowRatePrompt({ watched: false, hasRating: false, snoozed: false }), false);
  assert.equal(canShowRatePrompt({ watched: true, hasRating: true, snoozed: false }), false);
  assert.equal(canShowRatePrompt({ watched: true, hasRating: false, snoozed: true }), false);
});

test('ENGAGEMENT_PENDING_KEY is stable across platforms', () => {
  assert.equal(ENGAGEMENT_PENDING_KEY, 'plot_engagement_prompt_pending');
});

test('buildPendingWatch / parse / serialise round-trip', () => {
  const pending = buildPendingWatch(FIXTURE_MOVIE_ID, 'movie', 1_000);
  assert.deepEqual(pending, {
    kind: 'watch',
    tmdbId: FIXTURE_MOVIE_ID,
    mediaType: 'movie',
    at: 1_000,
  });
  assert.deepEqual(parseEngagementPending(serialiseEngagementPending(pending)), pending);
  assert.equal(parseEngagementPending(null), null);
  assert.equal(parseEngagementPending('nope'), null);
});

test('isPendingWatchFresh and pendingWatchMatches honour the session TTL', () => {
  const pending = buildPendingWatch(FIXTURE_TV_ID, 'tv', 1_000);
  assert.equal(isPendingWatchFresh(pending, 1_000), true);
  assert.equal(isPendingWatchFresh(pending, 1_000 + PENDING_WATCH_TTL_MS), true);
  assert.equal(isPendingWatchFresh(pending, 1_000 + PENDING_WATCH_TTL_MS + 1), false);
  assert.equal(pendingWatchMatches(pending, FIXTURE_TV_ID, 'tv', 1_500), true);
  assert.equal(pendingWatchMatches(pending, FIXTURE_TV_ID, 'movie', 1_500), false);
  assert.equal(pendingWatchMatches(pending, FIXTURE_OTHER_TV_ID, 'tv', 1_500), false);
});

test('onPendingWatchQueued notifies subscribers and unsubscribe stops delivery', () => {
  const seen = [];
  const stop = onPendingWatchQueued((p) => seen.push(p));
  notifyPendingWatchQueued({ tmdb_id: FIXTURE_MOVIE_ID, media_type: 'movie', source: 'in_app' });
  assert.equal(seen.length, 1);
  stop();
  notifyPendingWatchQueued({ tmdb_id: FIXTURE_TV_ID, media_type: 'tv' });
  assert.equal(seen.length, 1);
});
