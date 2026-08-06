import assert from 'node:assert/strict';
import test from 'node:test';

import { planHistoryImport } from '../../importPlan.js';

test('planHistoryImport returns no rows for empty input', () => {
  assert.deepEqual(planHistoryImport({ rows: [] }), { rows: [], alreadyInHistory: 0, collapsed: 0 });
});

test('planHistoryImport passes through a single new row unchanged', () => {
  const rows = [{ tmdb_id: 9, media_type: 'movie', watched_at: '2024-01-01' }];
  assert.deepEqual(planHistoryImport({ rows }), { rows, alreadyInHistory: 0, collapsed: 0 });
});

test('planHistoryImport skips rows already in history and counts them', () => {
  const result = planHistoryImport({
    rows: [{ tmdb_id: 1, media_type: 'movie', watched_at: '2024-01-01' }],
    existing: [{ tmdb_id: 1, media_type: 'movie' }],
  });
  assert.deepEqual(result, { rows: [], alreadyInHistory: 1, collapsed: 0 });
});

test('planHistoryImport treats the same tmdb_id with a different media_type as distinct', () => {
  const result = planHistoryImport({
    rows: [{ tmdb_id: 9, media_type: 'movie', watched_at: '2024-01-01' }],
    existing: [{ tmdb_id: 9, media_type: 'tv' }],
  });
  assert.deepEqual(result, {
    rows: [{ tmdb_id: 9, media_type: 'movie', watched_at: '2024-01-01' }],
    alreadyInHistory: 0,
    collapsed: 0,
  });
});

test('planHistoryImport collapses repeated rows for one title, keeping the most recent watched_at', () => {
  const result = planHistoryImport({
    rows: [
      { tmdb_id: 2, media_type: 'tv', watched_at: '2024-01-01' },
      { tmdb_id: 2, media_type: 'tv', watched_at: '2024-01-05' },
      { tmdb_id: 2, media_type: 'tv', watched_at: '2024-01-03' },
    ],
  });
  assert.deepEqual(result, {
    rows: [{ tmdb_id: 2, media_type: 'tv', watched_at: '2024-01-05' }],
    alreadyInHistory: 0,
    collapsed: 2,
  });
});

test('planHistoryImport keeps the earlier row and still counts collapsed when watched_at ties', () => {
  const result = planHistoryImport({
    rows: [
      { tmdb_id: 3, media_type: 'tv', watched_at: '2024-01-05' },
      { tmdb_id: 3, media_type: 'tv', watched_at: '2024-01-05' },
    ],
  });
  assert.deepEqual(result, {
    rows: [{ tmdb_id: 3, media_type: 'tv', watched_at: '2024-01-05' }],
    alreadyInHistory: 0,
    collapsed: 1,
  });
});

test('planHistoryImport combines alreadyInHistory and collapsed counts and preserves first-seen order', () => {
  const result = planHistoryImport({
    rows: [
      { tmdb_id: 5, media_type: 'movie', watched_at: '2024-01-01' },
      { tmdb_id: 1, media_type: 'movie', watched_at: '2024-01-01' },
      { tmdb_id: 5, media_type: 'movie', watched_at: '2024-01-09' },
    ],
    existing: [{ tmdb_id: 1, media_type: 'movie' }],
  });
  assert.deepEqual(result, {
    rows: [{ tmdb_id: 5, media_type: 'movie', watched_at: '2024-01-09' }],
    alreadyInHistory: 1,
    collapsed: 1,
  });
});
