import assert from 'node:assert/strict';
import test from 'node:test';
import { planHistoryImport } from '../../src/domain/importPlan.js';

const row = (tmdb_id, media_type, watched_at) => ({
  user_id: 'u1', tmdb_id, media_type, watched_at, title: `t${tmdb_id}`, poster_path: null,
});

/* The planner's whole job is to hand the writer a batch that cannot fail, so
   the writer never has to clean up after itself. */
const keys = plan => plan.rows.map(r => `${r.tmdb_id}::${r.media_type}::${r.watched_at}`);

test('a rewatch on a different date is planned as its own entry', () => {
  const plan = planHistoryImport({ rows: [row(1, 'movie', '2024-01-01'), row(1, 'movie', '2024-06-15')] });
  assert.equal(plan.rows.length, 2);
  assert.equal(plan.alreadyInHistory, 0);
});

test('a watch already in the history is skipped, not rewritten', () => {
  const plan = planHistoryImport({
    rows: [row(1, 'movie', '2024-01-01'), row(1, 'movie', '2024-06-15')],
    existing: [{ tmdb_id: 1, media_type: 'movie', watched_at: '2024-01-01' }],
  });
  assert.deepEqual(keys(plan), ['1::movie::2024-06-15']);
  assert.equal(plan.alreadyInHistory, 1);
});

test('a movie and a TV show sharing a TMDB id stay independent', () => {
  // TMDB numbers movies and TV separately: movie 262 and tv 262 are unrelated
  // titles, and the unique constraint includes media_type for exactly this.
  const plan = planHistoryImport({
    rows: [row(262, 'movie', '2024-01-01'), row(262, 'tv', '2024-01-01')],
    existing: [{ tmdb_id: 262, media_type: 'tv', watched_at: '2024-01-01' }],
  });
  assert.deepEqual(keys(plan), ['262::movie::2024-01-01']);
  assert.equal(plan.alreadyInHistory, 1);
});

test('source rows that collide on the unique key collapse to one', () => {
  // The regression that broke live imports: a Netflix export lists one row per
  // episode, so a night of one series resolves to the same series and date
  // many times over. Left in the batch they violate the unique constraint and
  // abort every other row inserted alongside them.
  const plan = planHistoryImport({
    rows: [row(5, 'tv', '2024-03-02'), row(5, 'tv', '2024-03-02'), row(5, 'tv', '2024-03-02')],
  });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.collapsed, 2);
});

test('an earlier watch of a title already in the history still imports', () => {
  // The data-loss case, now structurally impossible. The old import deleted
  // every history row for the titles in the file and then inserted a set those
  // rows had already been filtered out of, destroying watches it never
  // replaced. Planning is additive: it yields rows to add and never asks for a
  // delete, so the 2019 watch survives an import that mentions the same title.
  const plan = planHistoryImport({
    rows: [row(1, 'movie', '2024-06-15'), row(2, 'movie', '2024-06-15')],
    existing: [{ tmdb_id: 1, media_type: 'movie', watched_at: '2019-01-01' }],
  });
  assert.deepEqual(keys(plan).sort(), ['1::movie::2024-06-15', '2::movie::2024-06-15']);
  assert.equal(plan.alreadyInHistory, 0);
});

test('planned rows never collide with each other or with existing history', () => {
  const existing = [{ tmdb_id: 1, media_type: 'movie', watched_at: '2024-01-01' }];
  const plan = planHistoryImport({
    rows: [
      row(1, 'movie', '2024-01-01'), row(1, 'movie', '2024-01-01'),
      row(1, 'movie', '2024-02-02'), row(1, 'tv', '2024-02-02'),
      row(2, 'tv', '2024-02-02'), row(2, 'tv', '2024-05-05'),
    ],
    existing,
  });
  const planned = keys(plan);
  assert.equal(new Set(planned).size, planned.length, 'duplicate planned row');
  for (const e of existing) {
    assert.ok(!planned.includes(`${e.tmdb_id}::${e.media_type}::${e.watched_at}`));
  }
});

test('returns the caller\'s own row objects so a preview can identify them', () => {
  const a = row(1, 'movie', '2024-01-01');
  const plan = planHistoryImport({ rows: [a] });
  assert.equal(plan.rows[0], a);
});
