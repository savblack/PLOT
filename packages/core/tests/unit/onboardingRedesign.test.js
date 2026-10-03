import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFinishingTouches, finishingTouchesVisible, hideFinishingTouches, parseFinishingTouches,
  serialiseFinishingTouches, startFinishingTouches, ACTIVE_DAYS, HIDE_DAYS,
} from '../../finishingTouches.js';
import { greetingFor, partOfDay } from '../../greeting.js';
import {
  buildingLines, firstNameFromAuthUser, picksOnServices, streamingProviderIds, topRegionServices,
} from '../../onboardingSetup.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 3, 12);

test('a step is done only when its data says so', () => {
  const fresh = deriveFinishingTouches({ savedCount: 3, followingCount: 0, importDone: false, peopleCount: 0 });
  assert.deepEqual(fresh.steps.map(s => [s.id, s.done]), [['watchlist', true], ['friends', false], ['import', false], ['people', false]]);
  assert.equal(fresh.doneCount, 1);
  assert.equal(fresh.total, 4);
  assert.equal(fresh.allDone, false);
  const all = deriveFinishingTouches({ savedCount: 1, followingCount: 2, importDone: true, peopleCount: 1 });
  assert.equal(all.allDone, true);
});

test('nothing saved means the watchlist step is not done', () => {
  assert.equal(deriveFinishingTouches({ savedCount: 0 }).steps[0].done, false);
});

test('the card shows for new accounts, hides for a week, and stops after 30 days', () => {
  const state = startFinishingTouches(NOW);
  assert.equal(finishingTouchesVisible(state, NOW), true);
  const hidden = hideFinishingTouches(state, NOW);
  assert.equal(finishingTouchesVisible(hidden, NOW + DAY), false);
  assert.equal(finishingTouchesVisible(hidden, NOW + HIDE_DAYS * DAY + 1), true);
  assert.equal(finishingTouchesVisible(state, NOW + ACTIVE_DAYS * DAY + 1), false);
  assert.equal(finishingTouchesVisible({ ...state, closed: true }, NOW), false);
  assert.equal(finishingTouchesVisible(null, NOW), false);
});

test('stored state round-trips, and junk reads as no card', () => {
  const state = { ...hideFinishingTouches(startFinishingTouches(NOW), NOW), importDone: true };
  assert.deepEqual(parseFinishingTouches(serialiseFinishingTouches(state)), { ...state, closed: false });
  assert.equal(parseFinishingTouches(null), null);
  assert.equal(parseFinishingTouches('not json'), null);
  assert.equal(parseFinishingTouches('{"startedAt":"yesterday"}'), null);
});

test('greeting follows the time of day and reads without a name', () => {
  assert.equal(partOfDay(7), 'morning');
  assert.equal(partOfDay(13), 'afternoon');
  assert.equal(partOfDay(19), 'evening');
  assert.equal(partOfDay(23), 'late');
  assert.equal(partOfDay(3), 'late');
  assert.equal(greetingFor({ name: 'Sam', date: new Date(2026, 9, 3, 19) }), 'Good evening, Sam');
  assert.equal(greetingFor({ name: 'Sam', date: new Date(2026, 9, 3, 1) }), 'Up late, Sam?');
  assert.equal(greetingFor({ name: '', date: new Date(2026, 9, 3, 1) }), 'Up late?');
  assert.equal(greetingFor({ date: new Date(2026, 9, 3, 9) }), 'Good morning');
});

test('first name comes from the sign-in provider when it has one', () => {
  assert.equal(firstNameFromAuthUser({ user_metadata: { given_name: 'Sam', full_name: 'Samantha Lee' } }), 'Sam');
  assert.equal(firstNameFromAuthUser({ user_metadata: { full_name: 'Sam Lee' } }), 'Sam');
  assert.equal(firstNameFromAuthUser({ user_metadata: { name: 'sam@example.com' } }), '');
  assert.equal(firstNameFromAuthUser({ user_metadata: {} }), '');
  assert.equal(firstNameFromAuthUser(null), '');
});

test('services: most popular first, and the match line counts picks on any selected one', () => {
  const services = topRegionServices([
    { provider_id: -2, provider_name: 'B', display_priority: 5 },
    { provider_id: -1, provider_name: 'A', display_priority: 1, logo_path: '/a.png' },
    { provider_id: -3, provider_name: 'C' },
  ], 2);
  assert.deepEqual(services, [{ id: -1, name: 'A', logo_path: '/a.png' }, { id: -2, name: 'B', logo_path: null }]);
  const ids = streamingProviderIds({ results: { US: { flatrate: [{ provider_id: -1 }] }, GB: { flatrate: [{ provider_id: -9 }] } } }, 'US');
  assert.deepEqual(ids, [-1]);
  assert.equal(picksOnServices([[-1], [-9], []], [-1, -2]), 1);
});

test('building lines swap the first line when no services were picked', () => {
  assert.match(buildingLines(true)[0], /your platforms/);
  assert.match(buildingLines(false)[0], /every platform/);
  assert.equal(buildingLines(true).length, 4);
});
