import assert from 'node:assert/strict';
import test from 'node:test';
import { historyRatingLabel, monthKey } from '../../src/utils/history.js';

test('monthKey pads calendar months for stable comparisons', () => {
  assert.equal(monthKey(2026, 0), '2026-01');
  assert.equal(monthKey(2026, 10), '2026-11');
});

test('historyRatingLabel returns an empty string when no rating is saved', () => {
  assert.equal(historyRatingLabel(null), '');
  assert.equal(historyRatingLabel(0), '');
});

test('historyRatingLabel preserves half-star ratings for history rows', () => {
  assert.equal(historyRatingLabel(9), '4.5 ★');
  assert.equal(historyRatingLabel(8), '4 ★');
});
