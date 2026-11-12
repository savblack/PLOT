import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDismissSheet, sheetDismissDuration } from '../../sheetDrag.js';

const height = 800;

test('a long slow drag closes the sheet; a short slow one springs back', () => {
  assert.equal(shouldDismissSheet({ dy: 200, vy: 0, height }), true);
  assert.equal(shouldDismissSheet({ dy: 120, vy: 0.1, height }), false);
});

test('a quick flick closes it from a short drag, but not from a slip of the finger', () => {
  assert.equal(shouldDismissSheet({ dy: 60, vy: 1.4, height }), true);
  assert.equal(shouldDismissSheet({ dy: 10, vy: 1.4, height }), false);
});

test('pulling down then flicking back up keeps it open', () => {
  assert.equal(shouldDismissSheet({ dy: 300, vy: -0.6, height }), false);
});

test('no downward drag, or no height, never closes', () => {
  assert.equal(shouldDismissSheet({ dy: 0, vy: 2, height }), false);
  assert.equal(shouldDismissSheet({ dy: -40, vy: 2, height }), false);
  assert.equal(shouldDismissSheet({ dy: 300, vy: 0, height: 0 }), false);
});

test('the closing slide follows the finger speed inside 120 to 280ms', () => {
  assert.equal(sheetDismissDuration({ dy: 100, vy: 0, height }), 280);
  assert.equal(sheetDismissDuration({ dy: 700, vy: 0, height }), 120);
  assert.equal(sheetDismissDuration({ dy: 200, vy: 3, height }), 200);
});
