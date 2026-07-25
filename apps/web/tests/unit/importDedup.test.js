import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeEntries } from '../../src/domain/importDedup.js';

// SUS-66: rewatches (same title, different date) must survive import dedup —
// only an exact title+date duplicate from the source file should collapse.
test('dedupeEntries keeps two watches of the same title on different dates', () => {
  const entries = [
    { title: 'Arcane', hint: 'tv', date: '2024-01-01' },
    { title: 'Arcane', hint: 'tv', date: '2024-06-15' },
  ];
  const deduped = dedupeEntries(entries);
  assert.equal(deduped.length, 2);
  assert.deepEqual(deduped.map(e => e.date).sort(), ['2024-01-01', '2024-06-15']);
});

test('dedupeEntries collapses an exact title+date duplicate', () => {
  const entries = [
    { title: 'Arcane', hint: 'tv', date: '2024-01-01' },
    { title: 'arcane', hint: 'tv', date: '2024-01-01' }, // same day, different case
  ];
  const deduped = dedupeEntries(entries);
  assert.equal(deduped.length, 1);
});

test('dedupeEntries treats undated entries of the same title as one bucket', () => {
  const entries = [
    { title: 'Arcane', hint: 'tv', date: null },
    { title: 'Arcane', hint: 'tv', date: null },
  ];
  assert.equal(dedupeEntries(entries).length, 1);
});
