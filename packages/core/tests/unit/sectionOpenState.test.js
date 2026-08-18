import assert from 'node:assert/strict';
import test from 'node:test';

import { sectionStorageKey, parseSectionOpen, serialiseSectionOpen } from '../../sectionOpenState.js';

test('sectionStorageKey namespaces the section id', () => {
  assert.equal(sectionStorageKey('watching'), 'plot.section.watching');
  assert.equal(sectionStorageKey('history-2026-3'), 'plot.section.history-2026-3');
});

test('parseSectionOpen decodes the "1"/"0" encoding', () => {
  assert.equal(parseSectionOpen('1'), true);
  assert.equal(parseSectionOpen('0'), false);
});

test('parseSectionOpen falls back to the default (true) for null, undefined, or any unrecognised value', () => {
  assert.equal(parseSectionOpen(null), true);
  assert.equal(parseSectionOpen(undefined), true);
  assert.equal(parseSectionOpen('true'), true);
  assert.equal(parseSectionOpen('false'), true);
});

test('parseSectionOpen honors a custom fallback, but only when the value is unrecognised', () => {
  assert.equal(parseSectionOpen(null, false), false);
  assert.equal(parseSectionOpen('1', false), true);
  assert.equal(parseSectionOpen('0', true), false);
});

test('serialiseSectionOpen encodes a boolean as "1"/"0"', () => {
  assert.equal(serialiseSectionOpen(true), '1');
  assert.equal(serialiseSectionOpen(false), '0');
});

test('serialiseSectionOpen coerces any truthy/falsy value the same way', () => {
  assert.equal(serialiseSectionOpen(1), '1');
  assert.equal(serialiseSectionOpen(0), '0');
  assert.equal(serialiseSectionOpen(''), '0');
});

test('serialiseSectionOpen and parseSectionOpen round-trip', () => {
  assert.equal(parseSectionOpen(serialiseSectionOpen(true)), true);
  assert.equal(parseSectionOpen(serialiseSectionOpen(false)), false);
});
