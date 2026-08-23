import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime } from '../../date.js';
import { notificationPhrase, NOTIFICATIONS } from '../../copy/notifications.js';

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
