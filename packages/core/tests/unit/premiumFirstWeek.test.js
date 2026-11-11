import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PREMIUM_FIRST_WEEK_IDS, PREMIUM_FIRST_WEEK_PATHS, derivePremiumFirstWeek, hidePremiumFirstWeek,
  parsePremiumFirstWeek, premiumFirstWeekKey, premiumFirstWeekShouldStart, premiumFirstWeekVisible, premiumSeenFreeKey,
  serialisePremiumFirstWeek, startPremiumFirstWeek,
} from '../../premiumFirstWeek.js';
import { PREMIUM_FIRST_WEEK } from '../../copy/premiumFirstWeek.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 11);
const none = { themeChosen: false, peopleCount: 0, togetherCount: 0, calendarOn: false, smartListCount: 0 };

test('the week starts once and a second checkout does not restart it', () => {
  const first = startPremiumFirstWeek(null, T0);
  assert.deepEqual(first, { startedAt: T0 });
  assert.equal(startPremiumFirstWeek(first, T0 + 3 * DAY), first);
});

test('it shows for seven days, to a Premium account only', () => {
  const state = startPremiumFirstWeek(null, T0);
  assert.equal(premiumFirstWeekVisible(state, { isPremium: true, now: T0 + 6 * DAY }), true);
  assert.equal(premiumFirstWeekVisible(state, { isPremium: true, now: T0 + 8 * DAY }), false);
  assert.equal(premiumFirstWeekVisible(state, { isPremium: false, now: T0 + DAY }), false);
  // No week was ever started on this device: a long-standing member sees nothing.
  assert.equal(premiumFirstWeekVisible(null, { isPremium: true, now: T0 }), false);
});

test('Dismiss hides it for two days, and closing it is for good', () => {
  const hidden = hidePremiumFirstWeek(startPremiumFirstWeek(null, T0), T0);
  assert.equal(premiumFirstWeekVisible(hidden, { isPremium: true, now: T0 + DAY }), false);
  assert.equal(premiumFirstWeekVisible(hidden, { isPremium: true, now: T0 + 3 * DAY }), true);
  assert.equal(premiumFirstWeekVisible({ startedAt: T0, closed: true }, { isPremium: true, now: T0 + DAY }), false);
});

test('a step ticks only from real data', () => {
  assert.equal(derivePremiumFirstWeek(none).doneCount, 0);
  const some = derivePremiumFirstWeek({ ...none, themeChosen: true, togetherCount: 1 });
  assert.deepEqual(some.steps.filter(s => s.done).map(s => s.id), ['theme', 'together']);
  assert.equal(some.allDone, false);
  const all = derivePremiumFirstWeek({ themeChosen: true, peopleCount: 2, togetherCount: 1, calendarOn: true, smartListCount: 1 });
  assert.equal(all.allDone, true);
  assert.equal(all.total, 5);
});

test('stored state survives a round trip and junk reads as no card', () => {
  const state = { startedAt: T0, hiddenUntil: T0 + DAY, closed: false };
  assert.deepEqual(parsePremiumFirstWeek(serialisePremiumFirstWeek(state)), state);
  for (const bad of [null, '', 'nope', '{}', '{"startedAt":"x"}']) assert.equal(parsePremiumFirstWeek(bad), null);
});

test('every step has wording and somewhere to go', () => {
  for (const id of PREMIUM_FIRST_WEEK_IDS) {
    assert.ok(PREMIUM_FIRST_WEEK.steps[id].title, id);
    assert.ok(PREMIUM_FIRST_WEEK.steps[id].cta, id);
    assert.match(PREMIUM_FIRST_WEEK_PATHS[id], /^\//, id);
  }
});

test('a phone starts the week when it has seen the account go from Free to Premium', () => {
  const base = { existing: null, isPremium: true, seenFree: true, accountCreatedAt: T0 - 400 * DAY, now: T0 };
  assert.equal(premiumFirstWeekShouldStart(base), true);
  // Still Free: nothing to start.
  assert.equal(premiumFirstWeekShouldStart({ ...base, isPremium: false }), false);
  // A week already stored (running, dismissed or long over) is never restarted.
  assert.equal(premiumFirstWeekShouldStart({ ...base, existing: { startedAt: T0 - 30 * DAY } }), false);
});

test('a long-standing member on a new phone gets no first week; a brand new account does', () => {
  const base = { existing: null, isPremium: true, seenFree: false, now: T0 };
  assert.equal(premiumFirstWeekShouldStart({ ...base, accountCreatedAt: T0 - 400 * DAY }), false);
  assert.equal(premiumFirstWeekShouldStart({ ...base, accountCreatedAt: null }), false);
  assert.equal(premiumFirstWeekShouldStart({ ...base, accountCreatedAt: 'not a date' }), false);
  // Signed up and upgraded on web within the week, then opened the phone.
  assert.equal(premiumFirstWeekShouldStart({ ...base, accountCreatedAt: T0 - 2 * DAY }), true);
  assert.equal(premiumFirstWeekShouldStart({ ...base, accountCreatedAt: new Date(T0 - 2 * DAY).toISOString() }), true);
  assert.equal(premiumFirstWeekShouldStart({ ...base, accountCreatedAt: T0 - 8 * DAY }), false);
  // A clock that puts the sign-up in the future proves nothing.
  assert.equal(premiumFirstWeekShouldStart({ ...base, accountCreatedAt: T0 + DAY }), false);
});

test('the seen-Free marker has its own key per account', () => {
  assert.notEqual(premiumSeenFreeKey('user-1'), premiumSeenFreeKey('user-2'));
  assert.notEqual(premiumSeenFreeKey('user-1'), premiumFirstWeekKey('user-1'));
});
