import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENGAGEMENT_SNOOZE_KEY,
  WATCH_PROMPT_SNOOZE_MS,
  RATE_PROMPT_SNOOZE_MS,
  engagementTitleKey,
  parseEngagementSnooze,
  serialiseEngagementSnooze,
  isEngagementSnoozed,
  snoozeEngagement,
  clearEngagementSnooze,
  canShowWatchPrompt,
  canShowRatePrompt,
} from '../../engagementPrompt.js';

test('engagementTitleKey normalises id + media type', () => {
  assert.equal(engagementTitleKey(550, 'movie'), 'movie:550');
  assert.equal(engagementTitleKey('1396', 'tv'), 'tv:1396');
});

test('ENGAGEMENT_SNOOZE_KEY is stable across platforms', () => {
  assert.equal(ENGAGEMENT_SNOOZE_KEY, 'plot_engagement_prompt_snooze');
});

test('parseEngagementSnooze tolerates null, garbage, and non-objects', () => {
  assert.deepEqual(parseEngagementSnooze(null), {});
  assert.deepEqual(parseEngagementSnooze(undefined), {});
  assert.deepEqual(parseEngagementSnooze('not-json'), {});
  assert.deepEqual(parseEngagementSnooze('[]'), {});
  assert.deepEqual(parseEngagementSnooze('{"movie:1":"nope"}'), {});
});

test('parse / serialise round-trip keeps finite until timestamps', () => {
  const map = { 'movie:1': { watch: 100, rate: 200 } };
  assert.deepEqual(parseEngagementSnooze(serialiseEngagementSnooze(map)), map);
});

test('isEngagementSnoozed is true only while until is in the future', () => {
  const map = { 'tv:9': { watch: 1_000, rate: 5_000 } };
  assert.equal(isEngagementSnoozed(map, 'tv:9', 'watch', 999), true);
  assert.equal(isEngagementSnoozed(map, 'tv:9', 'watch', 1_000), false);
  assert.equal(isEngagementSnoozed(map, 'tv:9', 'rate', 4_999), true);
  assert.equal(isEngagementSnoozed(map, 'tv:9', 'rate', 5_000), false);
  assert.equal(isEngagementSnoozed(map, 'movie:1', 'watch', 0), false);
});

test('snoozeEngagement writes until = now + duration without clobbering the other kind', () => {
  const now = 1_000;
  let map = snoozeEngagement({}, 'movie:1', 'watch', WATCH_PROMPT_SNOOZE_MS, now);
  assert.equal(map['movie:1'].watch, now + WATCH_PROMPT_SNOOZE_MS);
  map = snoozeEngagement(map, 'movie:1', 'rate', RATE_PROMPT_SNOOZE_MS, now);
  assert.equal(map['movie:1'].watch, now + WATCH_PROMPT_SNOOZE_MS);
  assert.equal(map['movie:1'].rate, now + RATE_PROMPT_SNOOZE_MS);
});

test('clearEngagementSnooze drops one kind or the whole title', () => {
  const map = { 'movie:1': { watch: 10, rate: 20 }, 'tv:2': { watch: 30 } };
  assert.deepEqual(clearEngagementSnooze(map, 'movie:1', 'watch'), {
    'movie:1': { rate: 20 },
    'tv:2': { watch: 30 },
  });
  assert.deepEqual(clearEngagementSnooze(map, 'movie:1'), { 'tv:2': { watch: 30 } });
  assert.deepEqual(clearEngagementSnooze(map, 'tv:2', 'watch'), { 'movie:1': { watch: 10, rate: 20 } });
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
