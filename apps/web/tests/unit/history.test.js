import assert from 'node:assert/strict';
import test from 'node:test';
import { entriesForMonth, historyMonthEmptyCopy, historyRatingLabel, monthKey, monthLabel } from '../../src/utils/history.js';

test('monthKey pads calendar months for stable comparisons', () => {
  assert.equal(monthKey(2026, 0), '2026-01');
  assert.equal(monthKey(2026, 10), '2026-11');
});

test('entriesForMonth returns only rows from the selected month', () => {
  const entries = [
    { id: 1, watched_at: '2026-06-12T10:00:00.000Z' },
    { id: 2, watched_at: '2026-06-01T10:00:00.000Z' },
    { id: 3, watched_at: '2026-05-28T10:00:00.000Z' },
    { id: 4, watched_at: null },
  ];

  assert.deepEqual(entriesForMonth(entries, 2026, 5).map(entry => entry.id), [1, 2]);
  assert.deepEqual(entriesForMonth(entries, 2026, 4).map(entry => entry.id), [3]);
});

test('historyMonthEmptyCopy is contextual to the selected month', () => {
  assert.deepEqual(historyMonthEmptyCopy({ year: 2026, month: 5, isCurrentMonth: false }), {
    title: 'Nothing in June 2026',
    body: 'Try another month, or tap Today to jump back to your latest activity.',
  });

  assert.equal(monthLabel(2026, 5), 'June 2026');
  assert.equal(
    historyMonthEmptyCopy({ year: 2026, month: 5, isCurrentMonth: true }).body,
    'Try another month or mark a title as watched to start filling your history.'
  );
});

test('historyRatingLabel returns an empty string when no rating is saved', () => {
  assert.equal(historyRatingLabel(null), '');
  assert.equal(historyRatingLabel(0), '');
});

test('historyRatingLabel preserves half-star ratings for history rows', () => {
  assert.equal(historyRatingLabel(9), '4.5 ★');
  assert.equal(historyRatingLabel(8), '4 ★');
});
