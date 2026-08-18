import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupeEntries } from '../../importDedup.js';

test('dedupeEntries returns an empty array for empty input', () => {
  assert.deepEqual(dedupeEntries([]), []);
});

test('dedupeEntries keeps a single entry unchanged', () => {
  const entries = [{ title: 'Inception', date: '2024-01-01' }];
  assert.deepEqual(dedupeEntries(entries), entries);
});

test('dedupeEntries collapses same-title entries case-insensitively and trims whitespace', () => {
  const result = dedupeEntries([
    { title: 'Inception', date: '2024-01-01' },
    { title: ' inception ', date: '2024-01-05' },
    { title: 'INCEPTION', date: '2024-01-03' },
  ]);
  assert.deepEqual(result, [{ title: ' inception ', date: '2024-01-05' }]);
});

test('dedupeEntries keeps the first entry when neither duplicate has a date', () => {
  const result = dedupeEntries([
    { title: 'A', date: null },
    { title: 'a', date: undefined },
  ]);
  assert.deepEqual(result, [{ title: 'A', date: null }]);
});

test('dedupeEntries prefers a dated entry over an undated one for the same title', () => {
  const result = dedupeEntries([
    { title: 'A' },
    { title: 'A', date: '2024-01-01' },
  ]);
  assert.deepEqual(result, [{ title: 'A', date: '2024-01-01' }]);
});

test('dedupeEntries preserves first-seen order across distinct titles', () => {
  const result = dedupeEntries([
    { title: 'B' },
    { title: 'A' },
    { title: 'B', date: '2024-01-01' },
  ]);
  assert.deepEqual(result, [{ title: 'B', date: '2024-01-01' }, { title: 'A' }]);
});
