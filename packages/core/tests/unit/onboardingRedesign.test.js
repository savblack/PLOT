import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFinishingTouches, finishingTouchesVisible, firstWatchlistShow, hideFinishingTouches,
  noteImportFinished, parseFinishingTouches, serialiseFinishingTouches, startFinishingTouches,
  ACTIVE_DAYS, HIDE_DAYS,
} from '../../finishingTouches.js';
import { greetingFor, partOfDay } from '../../greeting.js';
import {
  buildingFan, buildingLines, firstNameFromAuthUser, topRegionServices,
} from '../../onboardingSetup.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 3, 12);

test('a step is done only when its data says so', () => {
  const fresh = deriveFinishingTouches({ savedCount: 3, followingCount: 0, importDone: false, peopleCount: 0 });
  assert.deepEqual(fresh.steps.map(s => [s.id, s.done]), [
    ['watchlist', true], ['progress', false], ['friends', false], ['import', false], ['people', false],
  ]);
  assert.equal(fresh.doneCount, 1);
  assert.equal(fresh.total, 5);
  assert.equal(fresh.allDone, false);
  const all = deriveFinishingTouches({ savedCount: 1, followingCount: 2, importDone: true, peopleCount: 1, progressDone: true });
  assert.equal(all.allDone, true);
});

test('the progress step stays open after onboarding saves, and ticks once something is logged', () => {
  const saved = deriveFinishingTouches({ savedCount: 3, progressDone: false });
  assert.equal(saved.steps.find(step => step.id === 'watchlist').done, true);
  assert.equal(saved.steps.find(step => step.id === 'progress').done, false);
  assert.equal(deriveFinishingTouches({ savedCount: 3, progressDone: true }).steps.find(step => step.id === 'progress').done, true);
});

test('the progress step uses the first show still on the watchlist', () => {
  const film = { tmdb_id: 22, media_type: 'movie', title: 'West' };
  const show = { tmdb_id: 11, media_type: 'tv', title: 'North', poster_path: '/n.jpg' };
  const later = { id: 33, media_type: 'tv', name: 'East' };
  assert.deepEqual(firstWatchlistShow([film, show, later]), {
    id: 11, media_type: 'tv', title: 'North', poster_path: '/n.jpg',
  });
  assert.equal(firstWatchlistShow([film]), null);
  assert.equal(firstWatchlistShow([]), null);
  assert.equal(firstWatchlistShow(null), null);
  assert.equal(firstWatchlistShow([{ id: 0, media_type: 'tv' }, { media_type: 'person', id: 4 }]), null);
});

test('the progress step is hidden with no show, and a Trakt import completes it', () => {
  const hidden = deriveFinishingTouches({ savedCount: 2, showProgress: false });
  assert.equal(hidden.steps.some(step => step.id === 'progress'), false);
  assert.equal(hidden.total, 4);
  const trakt = deriveFinishingTouches({ savedCount: 2, showProgress: true, traktImportDone: true });
  assert.equal(trakt.steps.find(step => step.id === 'progress').done, true);
  const started = noteImportFinished(startFinishingTouches(NOW), 'trakt');
  assert.equal(parseFinishingTouches(serialiseFinishingTouches(started)).traktImportDone, true);
  const other = noteImportFinished(startFinishingTouches(NOW), 'letterboxd');
  assert.equal(parseFinishingTouches(serialiseFinishingTouches(other)).traktImportDone, undefined);
  assert.equal(parseFinishingTouches(serialiseFinishingTouches(other)).importDone, true);
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

test('services: most popular first', () => {
  const services = topRegionServices([
    { provider_id: -2, provider_name: 'B', display_priority: 5 },
    { provider_id: -1, provider_name: 'A', display_priority: 1, logo_path: '/a.png' },
    { provider_id: -3, provider_name: 'C' },
  ], 2);
  assert.deepEqual(services, [{ id: -1, name: 'A', logo_path: '/a.png' }, { id: -2, name: 'B', logo_path: null }]);
});

test('building lines swap the first line when no services were picked', () => {
  assert.match(buildingLines(true)[0], /your platforms/);
  assert.match(buildingLines(false)[0], /every platform/);
  assert.equal(buildingLines(true).length, 4);
});

test('the building fan is always full: first pick in front, trending fills the gaps', () => {
  const t = (id) => ({ id });
  const trending = [t(-1), t(-2), t(-3), t(-4)];
  assert.deepEqual(buildingFan([t(-2)], trending).map(x => x.id), [-1, -3, -2]);
  assert.deepEqual(buildingFan([t(-9), t(-8)], trending).map(x => x.id), [-8, -1, -9]);
  assert.deepEqual(buildingFan([t(-9), t(-8), t(-7), t(-6)], trending).map(x => x.id), [-8, -7, -9]);
  assert.deepEqual(buildingFan([], trending).map(x => x.id), [-2, -3, -1]);
  assert.deepEqual(buildingFan([t(-9)], []).map(x => x.id), [-9]);
  assert.deepEqual(buildingFan([], []), []);
});
