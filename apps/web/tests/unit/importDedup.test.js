import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeEntries } from '@plot/core/importDedup.js';

// History holds one row per title (20260806000001 removed rewatch logging), so
// every date a file lists for a title describes that same row. Dedup collapses
// them here rather than resolving the same title against TMDB over and over.
test('dedupeEntries collapses several watches of one title, keeping the most recent', () => {
  const entries = [
    { title: 'Arcane', hint: 'tv', date: '2024-01-01' },
    { title: 'Arcane', hint: 'tv', date: '2024-06-15' },
  ];
  const deduped = dedupeEntries(entries);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].date, '2024-06-15');
});

test('the most recent date wins regardless of the order the file lists them', () => {
  const newestFirst = [
    { title: 'Arcane', hint: 'tv', date: '2024-06-15' },
    { title: 'Arcane', hint: 'tv', date: '2024-01-01' },
  ];
  assert.equal(dedupeEntries(newestFirst)[0].date, '2024-06-15');
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

test('a dated entry beats an undated one for the same title', () => {
  const entries = [
    { title: 'Arcane', hint: 'tv', date: null },
    { title: 'Arcane', hint: 'tv', date: '2024-01-01' },
  ];
  const deduped = dedupeEntries(entries);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].date, '2024-01-01');
});
