import assert from 'node:assert/strict';
import test from 'node:test';
import { activeFilterGroupCount, nextSheetSnap } from '../../src/utils/mobileSheets.js';

test('activeFilterGroupCount supports ordered single and multiple groups', () => {
  assert.equal(activeFilterGroupCount([
    { mode: 'single', value: 'mine', defaultValue: 'mine', options: [{ id: 'mine' }] },
    { mode: 'single', value: 2025, defaultValue: 2026, options: [{ id: 2025 }] },
    { value: ['tv'], defaultValue: ['tv', 'movie'], options: [{ id: 'tv' }] },
    { value: [], options: [] },
  ]), 2);
});

test('nextSheetSnap expands, collapses and dismisses in order', () => {
  assert.equal(nextSheetSnap({ snap: 'collapsed', delta: -70, velocity: -0.2 }), 'expanded');
  assert.equal(nextSheetSnap({ snap: 'expanded', delta: 70, velocity: 0.2 }), 'collapsed');
  assert.equal(nextSheetSnap({ snap: 'collapsed', delta: 130, velocity: 0.2 }), 'dismissed');
  assert.equal(nextSheetSnap({ snap: 'expanded', delta: 5, velocity: 0.1 }), 'expanded');
});
