import assert from 'node:assert/strict';
import test from 'node:test';

import {
  monthKey,
  entryMonthKey,
  monthLabel,
  entriesForMonth,
  groupEntriesByMonth,
  historyMonthEmptyCopy,
  historyRatingLabel,
} from '../../history.js';

function withTZ(tz, fn) {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test('monthKey pads the 1-based month and zero-pads single digits', () => {
  assert.equal(monthKey(2026, 2), '2026-03');
  assert.equal(monthKey(2026, 11), '2026-12');
  assert.equal(monthKey(2026, 0), '2026-01');
});

test('entryMonthKey returns null for a missing entry or a missing watched_at', () => {
  assert.equal(entryMonthKey(null), null);
  assert.equal(entryMonthKey(undefined), null);
  assert.equal(entryMonthKey({}), null);
  assert.equal(entryMonthKey({ watched_at: null }), null);
});

test('entryMonthKey reads the correct month in UTC', () => {
  withTZ('UTC', () => {
    assert.equal(entryMonthKey({ watched_at: '2026-03-01' }), '2026-03');
  });
});

test('BUG: entryMonthKey can file a date-only watched_at under the wrong month (even wrong year) for timezones behind UTC', () => {
  // watched_at is a plain "YYYY-MM-DD" string, so `new Date(watched_at)` parses
  // it as UTC midnight (per the Date-only ISO 8601 rule), but this then reads
  // it back with the LOCAL getFullYear()/getMonth() — exactly the anti-pattern
  // date.js's own header comment warns about, just inverted (wrong for
  // UTC-behind users instead of UTC-ahead ones). The whole Americas is behind
  // UTC, so this is not a narrow edge case.
  withTZ('America/Los_Angeles', () => {
    assert.equal(entryMonthKey({ watched_at: '2026-03-01' }), '2026-02');
  });
  withTZ('America/New_York', () => {
    assert.equal(entryMonthKey({ watched_at: '2026-01-01' }), '2025-12', 'rolls back a full year, not just a month');
  });
});

test('monthLabel formats a long or short month name with the year', () => {
  assert.equal(monthLabel(2026, 2), 'March 2026');
  assert.equal(monthLabel(2026, 2, 'short'), 'Mar 2026');
});

test('entriesForMonth keeps only entries whose watched_at falls in the given month', () => {
  withTZ('UTC', () => {
    const entries = [
      { id: 1, watched_at: '2026-03-15' },
      { id: 2, watched_at: '2026-03-01' },
      { id: 3, watched_at: null },
      { id: 4, watched_at: '2026-02-20' },
    ];
    assert.deepEqual(entriesForMonth(entries, 2026, 2), [entries[0], entries[1]]);
  });
});

test('groupEntriesByMonth buckets by month in first-seen order and drops undated entries', () => {
  withTZ('UTC', () => {
    const entries = [
      { id: 1, watched_at: '2026-03-15' },
      { id: 2, watched_at: '2026-03-01' },
      { id: 3, watched_at: null },
      { id: 4, watched_at: '2026-02-20' },
      { id: 5, watched_at: '2026-03-10' },
    ];
    assert.deepEqual(groupEntriesByMonth(entries), [
      { year: 2026, month: 2, key: '2026-03', entries: [entries[0], entries[1], entries[4]] },
      { year: 2026, month: 1, key: '2026-02', entries: [entries[3]] },
    ]);
  });
});

test('groupEntriesByMonth returns an empty array for entries with no watched_at', () => {
  assert.deepEqual(groupEntriesByMonth([{ id: 1 }, { id: 2, watched_at: null }]), []);
});

test('historyMonthEmptyCopy varies its body between the current month and any other month', () => {
  assert.deepEqual(historyMonthEmptyCopy({ year: 2026, month: 2, isCurrentMonth: true }), {
    title: 'Nothing in March 2026',
    body: 'Try another month or mark a title as watched to start filling your history.',
  });
  assert.deepEqual(historyMonthEmptyCopy({ year: 2026, month: 2, isCurrentMonth: false }), {
    title: 'Nothing in March 2026',
    body: 'Try another month, or tap Today to jump back to your latest activity.',
  });
});

test('historyRatingLabel formats a whole-star rating without a decimal', () => {
  assert.equal(historyRatingLabel(8), '4 ★');
  assert.equal(historyRatingLabel(10), '5 ★');
});

test('historyRatingLabel formats a half-star rating with one decimal', () => {
  assert.equal(historyRatingLabel(7), '3.5 ★');
});

test('historyRatingLabel returns an empty string for an unrated or invalid value', () => {
  assert.equal(historyRatingLabel(0), '');
  assert.equal(historyRatingLabel(null), '');
  assert.equal(historyRatingLabel(undefined), '');
});
