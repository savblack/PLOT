import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWatchedOn } from '@plot/core/date.js';

/* The reason this helper exists at all: `history.watched_at` is timestamptz, so
   Postgres hands back a full ISO string, and parsing that through `new Date()`
   shifts the day for anyone west of UTC. These assert the date survives.

   The "Aug 21, 2026" ordering is the `en` locale, matching the panel's own meta
   row. It is deliberately not region-aware yet; see the note on the function. */

test('formats a bare YYYY-MM-DD', () => {
  assert.equal(formatWatchedOn('2026-08-21'), 'Aug 21, 2026');
});

test('formats a full timestamptz without shifting the day', () => {
  assert.equal(formatWatchedOn('2026-08-21T00:00:00+00:00'), 'Aug 21, 2026');
});

test('keeps the first of the month on the first', () => {
  assert.equal(formatWatchedOn('2026-01-01T00:00:00+00:00'), 'Jan 1, 2026');
});

test('returns the input unchanged when it cannot be parsed', () => {
  assert.equal(formatWatchedOn(''), '');
  assert.equal(formatWatchedOn('not a date'), 'not a date');
});
