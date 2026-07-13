import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMediaPanelEscapeAction } from '../../src/utils/mediaPanel.js';

test('resolveMediaPanelEscapeAction closes the panel by default', () => {
  assert.equal(resolveMediaPanelEscapeAction(), 'close-panel');
});

test('resolveMediaPanelEscapeAction closes the list sheet before the panel', () => {
  assert.equal(
    resolveMediaPanelEscapeAction({ showListSheet: true }),
    'close-list-sheet'
  );
});

test('resolveMediaPanelEscapeAction ignores Escape while the panel is already closing', () => {
  assert.equal(
    resolveMediaPanelEscapeAction({ closing: true, showListSheet: true }),
    null
  );
});
