import assert from 'node:assert/strict';
import test from 'node:test';
import { planHistoryImport } from '@plot/core/importPlan.js';

const row = (tmdb_id, media_type, watched_at) => ({
  user_id: 'u1', tmdb_id, media_type, watched_at, title: `t${tmdb_id}`, poster_path: null,
});

/* The planner's whole job is to hand the writer a batch that cannot fail, so
   the writer never has to clean up after itself. */
const keys = plan => plan.rows.map(r => `${r.tmdb_id}::${r.media_type}::${r.watched_at}`);

test('several dates for one title collapse to one entry, keeping the most recent', () => {
  // History holds one row per title since 20260806000001, so two dates for the
  // same title are two descriptions of one row, not two entries.
  const plan = planHistoryImport({ rows: [row(1, 'movie', '2024-01-01'), row(1, 'movie', '2024-06-15')] });
  assert.deepEqual(keys(plan), ['1::movie::2024-06-15']);
  assert.equal(plan.collapsed, 1);
  assert.equal(plan.alreadyInHistory, 0);
});

test('which date survives does not depend on the order the file lists them', () => {
  const newestFirst = planHistoryImport({ rows: [row(1, 'movie', '2024-06-15'), row(1, 'movie', '2024-01-01')] });
  const oldestFirst = planHistoryImport({ rows: [row(1, 'movie', '2024-01-01'), row(1, 'movie', '2024-06-15')] });
  assert.deepEqual(keys(newestFirst), keys(oldestFirst));
});

test('a title already in the history is skipped, not rewritten', () => {
  // Skipping protects a rating or review the user wrote in the app: an import
  // knows nothing about either, and upserting would flatten both.
  const plan = planHistoryImport({
    rows: [row(1, 'movie', '2024-06-15'), row(2, 'movie', '2024-06-15')],
    existing: [{ tmdb_id: 1, media_type: 'movie' }],
  });
  assert.deepEqual(keys(plan), ['2::movie::2024-06-15']);
  assert.equal(plan.alreadyInHistory, 1);
});

test('a movie and a TV show sharing a TMDB id stay independent', () => {
  // TMDB numbers movies and TV separately: movie 262 and tv 262 are unrelated
  // titles, and the unique constraint includes media_type for exactly this.
  const plan = planHistoryImport({
    rows: [row(262, 'movie', '2024-01-01'), row(262, 'tv', '2024-01-01')],
    existing: [{ tmdb_id: 262, media_type: 'tv' }],
  });
  assert.deepEqual(keys(plan), ['262::movie::2024-01-01']);
  assert.equal(plan.alreadyInHistory, 1);
});

test('source rows that collide on the unique key collapse to one', () => {
  // The regression that broke live imports: a Netflix export lists one row per
  // episode, so a night of one series resolves to the same series many times
  // over. Left in the batch they violate the unique constraint and abort every
  // other row inserted alongside them.
  const plan = planHistoryImport({
    rows: [row(5, 'tv', '2024-03-02'), row(5, 'tv', '2024-03-02'), row(5, 'tv', '2024-03-02')],
  });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.collapsed, 2);
});

test('planning never asks for a delete, whatever the file contains', () => {
  // The data-loss case, structurally impossible rather than guarded against.
  // The old import deleted every history row for the titles in the file and
  // then inserted a set those rows had been filtered out of, destroying watches
  // it never replaced. A plan is only ever rows to upsert.
  const plan = planHistoryImport({
    rows: [row(1, 'movie', '2024-06-15'), row(2, 'movie', '2024-06-15')],
    existing: [{ tmdb_id: 1, media_type: 'movie' }],
  });
  assert.deepEqual(Object.keys(plan).sort(), ['alreadyInHistory', 'collapsed', 'rows']);
  assert.ok(plan.rows.every(r => r.user_id === 'u1'));
});

test('planned rows never collide with each other or with existing history', () => {
  const existing = [{ tmdb_id: 1, media_type: 'movie' }];
  const plan = planHistoryImport({
    rows: [
      row(1, 'movie', '2024-01-01'), row(1, 'movie', '2024-01-01'),
      row(1, 'movie', '2024-02-02'), row(1, 'tv', '2024-02-02'),
      row(2, 'tv', '2024-02-02'), row(2, 'tv', '2024-05-05'),
    ],
    existing,
  });
  const planned = plan.rows.map(r => `${r.tmdb_id}::${r.media_type}`);
  assert.equal(new Set(planned).size, planned.length, 'duplicate planned row');
  for (const e of existing) {
    assert.ok(!planned.includes(`${e.tmdb_id}::${e.media_type}`));
  }
});

test('returns the caller\'s own row objects so a preview can identify them', () => {
  const a = row(1, 'movie', '2024-01-01');
  const plan = planHistoryImport({ rows: [a] });
  assert.equal(plan.rows[0], a);
});
