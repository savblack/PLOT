import test from 'node:test';
import assert from 'node:assert/strict';
import { sundayLearningWindow } from '../learning/window.mjs';

test('sunday learning window captures the completed Sydney week ending on Sunday', () => {
  const window = sundayLearningWindow(new Date('2026-06-20T23:40:00Z'));
  assert.equal(window.runDate, '2026-06-21');
  assert.equal(window.weekStart, '2026-06-15');
  assert.equal(window.weekEnd, '2026-06-21');
});

test('non-sunday runs snap back to the previous completed Sunday', () => {
  const window = sundayLearningWindow(new Date('2026-06-22T03:00:00Z'));
  assert.equal(window.runDate, '2026-06-22');
  assert.equal(window.weekStart, '2026-06-15');
  assert.equal(window.weekEnd, '2026-06-21');
});
