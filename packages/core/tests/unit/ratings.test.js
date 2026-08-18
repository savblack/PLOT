import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_RATING, STAR_COUNT, normalizeRating, ratingToStars, starsToRating, starFillPercent, ratingFromPointer } from '../../ratings.js';

test('MAX_RATING and STAR_COUNT are the expected constants', () => {
  assert.equal(MAX_RATING, 10);
  assert.equal(STAR_COUNT, 5);
});

test('normalizeRating clamps non-positive or non-finite values to 0', () => {
  assert.equal(normalizeRating(0), 0);
  assert.equal(normalizeRating(-5), 0);
  assert.equal(normalizeRating(undefined), 0);
  assert.equal(normalizeRating(null), 0);
  assert.equal(normalizeRating('abc'), 0);
  assert.equal(normalizeRating(-0), 0);
});

test('normalizeRating rounds and clamps positive values into 1..MAX_RATING', () => {
  assert.equal(normalizeRating(0.4), 1, 'rounds to 0 but is clamped up to the 1 floor');
  assert.equal(normalizeRating(0.5), 1);
  assert.equal(normalizeRating(7), 7);
  assert.equal(normalizeRating('7'), 7, 'coerces numeric strings');
  assert.equal(normalizeRating(10.6), 10);
  assert.equal(normalizeRating(100), 10);
});

test('ratingToStars halves a normalized rating and keeps 0 as 0', () => {
  assert.equal(ratingToStars(0), 0);
  assert.equal(ratingToStars(-3), 0);
  assert.equal(ratingToStars(7), 3.5);
  assert.equal(ratingToStars(10), 5);
});

test('starsToRating doubles a 1-5 star count into the shared 1-10 scale', () => {
  assert.equal(starsToRating(1), 2);
  assert.equal(starsToRating(3), 6);
  assert.equal(starsToRating(5), 10);
});

test('starsToRating treats 0, negative, and non-finite input as a clear (0)', () => {
  assert.equal(starsToRating(0), 0);
  assert.equal(starsToRating(-2), 0);
  assert.equal(starsToRating(undefined), 0);
  assert.equal(starsToRating(NaN), 0);
});

test('starsToRating clamps a star count above STAR_COUNT to MAX_RATING instead of overflowing', () => {
  assert.equal(starsToRating(6), 10);
  assert.equal(starsToRating(100), 10);
});

test('ratingToStars(starsToRating(n)) round-trips for every whole 1-5 tap value, pinning the mobile StarRow contract', () => {
  for (let n = 1; n <= STAR_COUNT; n++) {
    assert.equal(ratingToStars(starsToRating(n)), n, `star ${n} must round-trip back to itself`);
  }
});

test('starFillPercent reports 100 once the rating reaches a star\'s full step', () => {
  assert.equal(starFillPercent(10, 1), 100);
  assert.equal(starFillPercent(10, 5), 100);
});

test('starFillPercent reports 50 for a half-filled star and 0 below that', () => {
  assert.equal(starFillPercent(9, 5), 50);
  assert.equal(starFillPercent(8, 5), 0);
  assert.equal(starFillPercent(0, 1), 0);
});

function pointerEvent(clientX, { left = 100, width = 20 } = {}) {
  return { currentTarget: { getBoundingClientRect: () => ({ left, width }) }, clientX };
}

test('ratingFromPointer returns the half-star value when the pointer is in the left half', () => {
  assert.equal(ratingFromPointer(pointerEvent(105), 3), 5);
});

test('ratingFromPointer returns the full-star value when the pointer is in the right half', () => {
  assert.equal(ratingFromPointer(pointerEvent(115), 3), 6);
});

test('ratingFromPointer treats the exact midpoint as the right half', () => {
  assert.equal(ratingFromPointer(pointerEvent(110), 3), 6);
});
