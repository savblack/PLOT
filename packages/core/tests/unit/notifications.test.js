import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime } from '../../date.js';
import { notificationPhrase, NOTIFICATIONS, NEW_EPISODE_NOTIFICATION, NEW_MOVIE_NOTIFICATION, titleBadge, titleFallback, titlePhrase } from '../../copy/notifications.js';

const NOW = Date.parse('2026-08-23T12:00:00Z');

test('relativeTime steps through seconds, minutes, hours and days', () => {
  assert.equal(relativeTime('2026-08-23T11:59:30Z', NOW), 'just now');
  assert.equal(relativeTime('2026-08-23T11:05:00Z', NOW), '55m ago');
  assert.equal(relativeTime('2026-08-23T09:00:00Z', NOW), '3h ago');
  assert.equal(relativeTime('2026-08-21T12:00:00Z', NOW), '2d ago');
});

test('relativeTime falls back to an absolute date once a week old', () => {
  // Seven days is the boundary: 6d still reads relative, 7d does not.
  assert.equal(relativeTime('2026-08-17T12:00:00Z', NOW), '6d ago');
  assert.equal(/2026/.test(relativeTime('2026-08-16T12:00:00Z', NOW)), true);
});

test('relativeTime never reports a negative age for a future timestamp', () => {
  // Clock skew between the client and Postgres shouldn't render "-3m ago".
  assert.equal(relativeTime('2026-08-23T12:05:00Z', NOW), 'just now');
});

test('relativeTime returns empty string for an unparseable date', () => {
  assert.equal(relativeTime('not a date', NOW), '');
});

test('notificationPhrase completes the sentence for every known type', () => {
  for (const [type, phrase] of Object.entries(NOTIFICATIONS)) {
    assert.equal(notificationPhrase(type), phrase);
    // Each entry has to read as "<name> <phrase>", so none may start capitalised.
    assert.equal(/^[A-Z]/.test(phrase), false, `${type} should not start with a capital`);
  }
});

test('notificationPhrase falls back for an unknown type rather than rendering blank', () => {
  assert.equal(notificationPhrase('reaction_added'), 'interacted with you');
  assert.equal(notificationPhrase(undefined), 'interacted with you');
});

test('NEW_EPISODE_NOTIFICATION words single episodes, premieres and same-day drops', () => {
  const { phrase } = NEW_EPISODE_NOTIFICATION;
  assert.equal(phrase({ season_number: 5, episode_number: 3 }), 'S5 E3 is out');
  assert.equal(phrase({ season_number: 5, episode_number: 3, episode_count: 1 }), 'S5 E3 is out');
  assert.equal(phrase({ season_number: 5, episode_number: 1, episode_count: 1 }), 'season 5 premiere is out');
  assert.equal(phrase({ season_number: 2, episode_number: 1, episode_count: 8 }), 'season 2 is out, 8 episodes');
  assert.equal(phrase({ season_number: 2, episode_number: 4, episode_count: 3 }), 'S2 E4 to E6 are out');
  // A null count (older rows, or a caller that dropped it) reads as one episode.
  assert.equal(phrase({ season_number: 1, episode_number: 2, episode_count: null }), 'S1 E2 is out');
});

test('relativeTime writes an older date out in the viewer\'s order', async () => {
  const { dateLocaleForRegion } = await import('../../date.js');
  // Noon UTC, so the day is the same in any test machine's timezone.
  const old = '2026-03-09T12:00:00Z';
  assert.equal(relativeTime(old, NOW, 'US'), 'March 9, 2026');
  assert.equal(relativeTime(old, NOW, 'GB'), '9 March 2026');
  assert.equal(relativeTime(old, NOW, 'AU'), '9 March 2026');
  // No region reads as the US, the default region.
  assert.equal(relativeTime(old, NOW), 'March 9, 2026');
  assert.equal(dateLocaleForRegion('gb'), 'en-GB');
  // Recent times are unchanged by region.
  assert.equal(relativeTime('2026-08-21T12:00:00Z', NOW, 'GB'), '2d ago');
});

test('title rows: a movie_release reads like a new_episode row, worded for a film', () => {
  assert.equal(titleBadge({ type: 'movie_release' }), 'New movie');
  assert.equal(titleFallback({ type: 'movie_release' }), NEW_MOVIE_NOTIFICATION.untitled);
  // "now", not "today": the daily job looks back a few days.
  assert.equal(titlePhrase({ type: 'movie_release', release_kind: 'theatrical' }), 'is in cinemas now');
  assert.equal(titlePhrase({ type: 'movie_release', release_kind: 'digital' }), 'is out to watch at home now');
  // An unrecognised kind never claims it is streaming.
  assert.equal(titlePhrase({ type: 'movie_release', release_kind: null }), 'is in cinemas now');
});

test('title rows: new_episode wording is unchanged through the shared helpers', () => {
  assert.equal(titleBadge({ type: 'new_episode', episode_count: 1 }), NEW_EPISODE_NOTIFICATION.badge);
  assert.equal(titleBadge({ type: 'new_episode', episode_count: 8 }), NEW_EPISODE_NOTIFICATION.badgePlural);
  assert.equal(titleFallback({ type: 'new_episode' }), NEW_EPISODE_NOTIFICATION.untitled);
  assert.equal(titlePhrase({ type: 'new_episode', season_number: 5, episode_number: 1, episode_count: 1 }), 'season 5 premiere is out');
  assert.equal(titlePhrase({ type: 'new_episode', season_number: 2, episode_number: 1, episode_count: 8 }), 'season 2 is out, 8 episodes');
});
