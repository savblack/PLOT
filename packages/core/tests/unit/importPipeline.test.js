import assert from 'node:assert/strict';
import test from 'node:test';

import { configure } from '../../config.js';
import {
  pickTmdbMatch,
  resolveImportEntries,
  readExistingHistory,
  buildImportRows,
  writeImportRows,
} from '../../importPipeline.js';
import { planHistoryImport } from '../../importPlan.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

/* The import orchestration, previously ~600 hand-written lines in each app with
 * no coverage on either side. Cases are written against the divergences and the
 * data-loss path, not the happy path. */

function withHistory(rows = []) {
  const client = createInMemorySupabase({ tables: { history: rows } });
  configure({ supabaseClient: client });
  return client;
}

/* ── Match ranking ── */

test('pickTmdbMatch prefers an exact release-year match over the more popular result', () => {
  // The remake case. Mobile ignored `year` entirely and always took the first
  // result, so the same Letterboxd file imported different films per platform.
  const match = pickTmdbMatch(
    { title: 'Suspiria', year: 1977, hint: 'movie' },
    [
      { id: 2, media_type: 'movie', title: 'Suspiria', release_date: '2018-10-11' },
      { id: 1, media_type: 'movie', title: 'Suspiria', release_date: '1977-02-01' },
    ],
  );

  assert.equal(match.id, 1);
});

test('pickTmdbMatch falls back to the first result when no year matches', () => {
  const match = pickTmdbMatch(
    { title: 'Dune', year: 1999, hint: 'movie' },
    [{ id: 9, media_type: 'movie', release_date: '2021-09-15' }],
  );

  assert.equal(match.id, 9);
});

test('pickTmdbMatch narrows to the hinted media type but falls back when that leaves nothing', () => {
  const results = [{ id: 5, media_type: 'movie' }, { id: 6, media_type: 'tv' }];

  assert.equal(pickTmdbMatch({ hint: 'tv' }, results).id, 6);
  assert.equal(pickTmdbMatch({ hint: 'tv' }, [{ id: 5, media_type: 'movie' }]).id, 5);
});

test('pickTmdbMatch ignores people and other non-title results', () => {
  const match = pickTmdbMatch({ title: 'x' }, [
    { id: 100, media_type: 'person' },
    { id: 101, media_type: 'movie' },
  ]);

  assert.equal(match.id, 101);
});

test('pickTmdbMatch returns null when nothing is a title', () => {
  assert.equal(pickTmdbMatch({ title: 'x' }, [{ id: 1, media_type: 'person' }]), null);
});

/* ── Resolve ── */

test('resolveImportEntries marks entries unmatched when the search throws, without losing the rest', async () => {
  const resolved = await resolveImportEntries(
    [{ title: 'Boom' }, { title: 'Fine' }],
    {
      search: async (t) => {
        if (t === 'Boom') throw new Error('TMDB down');
        return { results: [{ id: 7, media_type: 'movie', title: 'Fine' }] };
      },
    },
  );

  assert.deepEqual(resolved.map(r => r.status), ['unmatched', 'matched']);
});

test('resolveImportEntries keeps genre ids so imported rows can carry them', async () => {
  const [resolved] = await resolveImportEntries(
    [{ title: 'Heat' }],
    { search: async () => ({ results: [{ id: 1, media_type: 'movie', genre_ids: [28, 80] }] }) },
  );

  assert.deepEqual(resolved.genreIds, [28, 80]);
});

test('resolveImportEntries reports progress across every batch', async () => {
  const seen = [];
  await resolveImportEntries(
    Array.from({ length: 9 }, (_, i) => ({ title: `t${i}` })),
    {
      search: async () => ({ results: [{ id: 1, media_type: 'movie' }] }),
      onProgress: (done, total) => seen.push([done, total]),
    },
  );

  assert.deepEqual(seen, [[4, 9], [8, 9], [9, 9]]);
});

/* ── Existing-history read ── */

test('readExistingHistory returns every match when the history is larger than one response', async () => {
  // The data-loss path. Mobile read the whole history in a single unscoped
  // call, so past PostgREST's 1000-row cap it silently saw less than was
  // there, planHistoryImport treated those rows as new, and the upsert
  // overwrote the rating and note already on them. Scoping to the ids being
  // imported and chunking those ids is what keeps each response under the cap.
  const many = Array.from({ length: 2400 }, (_, i) => ({
    user_id: 'u1', tmdb_id: 500 + i, media_type: 'movie',
  }));
  withHistory(many);

  const { rows, error } = await readExistingHistory({
    userId: 'u1',
    tmdbIds: many.map(r => r.tmdb_id),
  });

  assert.equal(error, null);
  assert.equal(rows.length, 2400);
});

test('readExistingHistory scopes to this user and to the titles being imported', async () => {
  withHistory([
    { user_id: 'u1', tmdb_id: 1, media_type: 'movie' },
    { user_id: 'u1', tmdb_id: 2, media_type: 'movie' },
    { user_id: 'u2', tmdb_id: 1, media_type: 'movie' },
  ]);

  const { rows } = await readExistingHistory({ userId: 'u1', tmdbIds: [1] });

  assert.deepEqual(rows, [{ user_id: 'u1', tmdb_id: 1, media_type: 'movie' }]);
});

test('readExistingHistory surfaces a failed read rather than reporting an empty history', async () => {
  // Returning [] here would tell the planner nothing exists, and the write
  // would overwrite every colliding row.
  const client = withHistory([{ user_id: 'u1', tmdb_id: 1, media_type: 'movie' }]);
  client.failNext('history', 'select', { message: 'connection reset' });

  const { rows, error } = await readExistingHistory({ userId: 'u1', tmdbIds: [1] });

  assert.deepEqual(rows, []);
  assert.equal(error.message, 'connection reset');
});

test('readExistingHistory does not query when there is nothing to look up', async () => {
  const client = withHistory([{ user_id: 'u1', tmdb_id: 1, media_type: 'movie' }]);
  client.failNext('history', 'select', { message: 'should not run' });

  const { rows, error } = await readExistingHistory({ userId: 'u1', tmdbIds: [] });

  assert.deepEqual(rows, []);
  assert.equal(error, null);
});

/* ── Row building ── */

test('buildImportRows keeps the rating and the review, clamped to the history scale', async () => {
  const rows = buildImportRows({
    userId: 'u1',
    resolved: [{
      status: 'matched', tmdbId: 1, mediaType: 'movie', tmdbTitle: 'A',
      date: '2026-01-02', rating: 11.4, note: 'loved it',
    }],
  });

  assert.equal(rows[0].row.rating, 10);
  assert.equal(rows[0].row.note, 'loved it');
});

test('buildImportRows carries genre ids so imported titles feed For You', () => {
  const rows = buildImportRows({
    userId: 'u1',
    resolved: [{ status: 'matched', tmdbId: 1, mediaType: 'movie', tmdbTitle: 'A', genreIds: [18] }],
  });

  assert.deepEqual(rows[0].row.genre_ids, [18]);
});

test('buildImportRows defaults genre ids to an empty array, never null', () => {
  const rows = buildImportRows({
    userId: 'u1',
    resolved: [{ status: 'matched', tmdbId: 1, mediaType: 'movie', tmdbTitle: 'A' }],
  });

  assert.deepEqual(rows[0].row.genre_ids, []);
});

test('buildImportRows skips unmatched entries but keeps the index of what it kept', () => {
  const rows = buildImportRows({
    userId: 'u1',
    resolved: [
      { status: 'unmatched' },
      { status: 'matched', tmdbId: 1, mediaType: 'movie', tmdbTitle: 'A' },
    ],
  });

  assert.deepEqual(rows.map(r => r.index), [1]);
});

/* ── Write ── */

test('writeImportRows counts a failed batch as failed rather than imported', async () => {
  const client = withHistory([]);
  const rows = Array.from({ length: 60 }, (_, i) => ({ user_id: 'u1', tmdb_id: i, media_type: 'movie' }));
  client.failNext('history', 'upsert', { message: 'constraint blew up' });

  const { inserted, failed } = await writeImportRows(rows);

  assert.equal(failed, 50);
  assert.equal(inserted, 10);
});

test('writeImportRows reports progress over the whole set, not per batch', async () => {
  withHistory([]);
  const seen = [];
  const rows = Array.from({ length: 120 }, (_, i) => ({ user_id: 'u1', tmdb_id: i, media_type: 'movie' }));

  await writeImportRows(rows, { onProgress: (done, total) => seen.push([done, total]) });

  assert.deepEqual(seen, [[50, 120], [100, 120], [120, 120]]);
});

/* ── The sequence, against the bug it exists to prevent ── */

test('an import over the row cap does not overwrite a rating already in history', async () => {
  // 1200 existing rows, one of which carries a rating the user set by hand.
  // With a truncating read, that row looks new, gets planned, and the upsert
  // replaces it with the rating-less imported version.
  const existingRows = Array.from({ length: 1200 }, (_, i) => ({
    user_id: 'u1', tmdb_id: i, media_type: 'movie', rating: null,
  }));
  existingRows[1100] = { user_id: 'u1', tmdb_id: 1100, media_type: 'movie', rating: 9, note: 'a favourite' };
  withHistory(existingRows);

  const resolved = existingRows.map((r, i) => ({
    status: 'matched', tmdbId: r.tmdb_id, mediaType: 'movie', tmdbTitle: `t${i}`, date: '2026-01-01',
  }));

  const { rows: existing, error } = await readExistingHistory({
    userId: 'u1',
    tmdbIds: resolved.map(r => r.tmdbId),
  });
  assert.equal(error, null);

  const candidates = buildImportRows({ userId: 'u1', resolved });
  const plan = planHistoryImport({ rows: candidates.map(c => c.row), existing });

  assert.equal(plan.rows.length, 0, 'every title is already in history, so nothing should be written');
  assert.equal(plan.alreadyInHistory, 1200);
});
