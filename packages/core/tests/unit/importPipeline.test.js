import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const verifiedMatches = JSON.parse(readFileSync(new URL('../support/tmdbImportMatches.json', import.meta.url), 'utf8')).results;

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

test('pickTmdbMatch requires review when no year matches', () => {
  const match = pickTmdbMatch(
    { title: 'Dune', year: 1999, hint: 'movie' },
    [{ id: 9, media_type: 'movie', release_date: '2021-09-15' }],
  );

  assert.equal(match, null);
});

test('pickTmdbMatch never silently changes the hinted media type', () => {
  const results = [{ id: 5, media_type: 'movie' }, { id: 6, media_type: 'tv' }];

  assert.equal(pickTmdbMatch({ hint: 'tv' }, results).id, 6);
  assert.equal(pickTmdbMatch({ hint: 'tv' }, [{ id: 5, media_type: 'movie' }]), null);
});

test('pickTmdbMatch ignores people and other non-title results', () => {
  const match = pickTmdbMatch({ title: 'x' }, [
    { id: 100, media_type: 'person' },
    { id: 101, media_type: 'movie', title: 'x' },
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
    { search: async () => ({ results: [{ id: 1, media_type: 'movie', title: 'Heat', genre_ids: [28, 80] }] }) },
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

test('buildImportRows carries genre ids so imported titles match genre filters', () => {
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

test('a concurrent PLOT edit survives the write even after an empty preview read', async () => {
  const client = createInMemorySupabase({ unique: { history: ['user_id', 'tmdb_id', 'media_type'] } });
  configure({ supabaseClient: client });
  // Reuse the existing test-double identifier above, not a real title mapping.
  const row = { user_id: 'u1', tmdb_id: 1, media_type: 'movie', note: 'imported' };
  client.beforeNext('history', 'upsert', db => {
    db.tables.history = [{ ...row, note: 'edited in PLOT', rating: 9 }];
  });
  const result = await writeImportRows([row]);
  assert.equal(result.inserted, 0);
  assert.equal(result.failed, 0);
  assert.equal(client.__db.tables.history[0].note, 'edited in PLOT');
  assert.equal(client.__db.tables.history[0].rating, 9);
});

test('identically titled remakes require explicit selection and preserve every watch', async () => {
  const results = verifiedMatches;
  let calls = 0;
  const records = await resolveImportEntries([{ title: 'Suspiria' }, { title: 'Suspiria' }], {
    search: () => { calls++; return Promise.resolve({ results }); },
  });
  assert.equal(calls, 1);
  assert.equal(records.length, 2);
  assert.equal(records[0].status, 'unmatched');
  const { chooseImportMatch } = await import('../../importPipeline.js');
  assert.equal(chooseImportMatch(records[0], `movie:${results[0].id}`).status, 'matched');
  assert.equal(chooseImportMatch(records[0], 'movie:not-in-response').status, 'unmatched');
});

test('interrupted event batches can be retried without duplicating saved watches', async () => {
  const { identifyImportEntries } = await import('../../importEvents.js');
  const { writeImportSelection } = await import('../../importPipeline.js');
  // Use a captured TMDB response and preserve separate source records.
  const resolved = identifyImportEntries(Array.from({ length: 60 }, () => ({
    status: 'matched', tmdbId: verifiedMatches[0].id, mediaType: 'movie', tmdbTitle: verifiedMatches[0].title, date: null,
  })), 'letterboxd', 'sixty source records');
  const saved = new Set();
  let interrupt = true;
  configure({ importEventsEnabled: true, supabaseClient: {
    rpc: async (_name, { p_records }) => {
      if (interrupt) { interrupt = false; throw new Error('connection interrupted'); }
      let inserted = 0;
      for (const { event } of p_records) {
        if (!saved.has(event.source_key)) { saved.add(event.source_key); inserted++; }
      }
      return { data: { inserted, duplicates: p_records.length - inserted }, error: null };
    },
  } });
  try {
    assert.deepEqual(await writeImportSelection({ userId: 'u1', resolved, summaryRows: [] }), { inserted: 10, failed: 50, duplicates: 0 });
    assert.deepEqual(await writeImportSelection({ userId: 'u1', resolved, summaryRows: [] }), { inserted: 50, failed: 0, duplicates: 10 });
    assert.equal(saved.size, 60);
  } finally { configure({ importEventsEnabled: false }); }
});

test('duplicate review is paginated and isolated to the importing account', async () => {
  const { identifyImportEntries } = await import('../../importEvents.js');
  const { reviewImportDuplicates } = await import('../../importPipeline.js');
  const match = verifiedMatches[0];
  const entries = identifyImportEntries([{ title: match.title }], 'letterboxd', 'export');
  const resolved = [{ ...entries[0], status: 'matched', tmdbId: match.id, mediaType: match.media_type, candidates: [match] }];
  const events = Array.from({ length: 1201 }, (_, i) => ({ id: i, user_id: 'u1', tmdb_id: match.id, media_type: match.media_type, source_key: `other-source-${i}`, watched_on: null }));
  events.push({ ...events[0], id: 2000, user_id: 'another-user', source_key: 'private-event' });
  const client = createInMemorySupabase({ tables: { watch_events: events } });
  configure({ importEventsEnabled: true, supabaseClient: client });
  try {
    const review = await reviewImportDuplicates({ userId: 'u1', resolved });
    assert.equal(review.error, null);
    assert.equal(review.resolved[0].duplicateCandidates.length, 1201);
    assert.ok(!review.resolved[0].knownEvents.some(event => event.source_key === 'private-event'));
    client.failNext('watch_events', 'select', { message: 'offline' });
    const failed = await reviewImportDuplicates({ userId: 'u1', resolved });
    assert.equal(failed.error.message, 'offline');
    assert.deepEqual(failed.resolved, []);
  } finally { configure({ importEventsEnabled: false }); }
});

test('episode dates and reviews cannot replace a whole-series import summary', async () => {
  const { identifyImportEntries } = await import('../../importEvents.js');
  const { writeImportSelection } = await import('../../importPipeline.js');
  const match = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-series.json', import.meta.url), 'utf8')).result;
  const base = { status: 'matched', tmdbId: match.id, mediaType: 'tv', tmdbTitle: match.name };
  const resolved = identifyImportEntries([
    { ...base, date: '2025-01-01', rating: 8, note: 'Whole series review' },
    { ...base, date: '2026-01-01', rating: 3, note: 'Episode review', seasonNumber: 1, episodeNumber: 3 },
  ], 'test', 'series plus a later episode rewatch');
  let records;
  configure({ importEventsEnabled: true, supabaseClient: {
    rpc: async (_name, { p_records }) => {
      records = p_records;
      return { data: { inserted: p_records.length, duplicates: 0 }, error: null };
    },
  } });
  try {
    assert.deepEqual(await writeImportSelection({ userId: 'u1', resolved, summaryRows: [] }), { inserted: 2, failed: 0, duplicates: 0 });
    assert.equal(records[0].summary.watched_at, '2025-01-01');
    assert.equal(records[0].summary.rating, 8);
    assert.equal(records[0].summary.note, 'Whole series review');
    assert.equal(records[1].event.source_review, 'Episode review');
    assert.equal(records[1].event.episode_number, 3);
    assert.equal(records[1].event.watched_on, '2026-01-01');
    // Episode-only imports still carry matching metadata for server validation.
    await writeImportSelection({ userId: 'u1', resolved: [resolved[1]], summaryRows: [] });
    assert.equal(records[0].summary.tmdb_id, match.id);
  } finally { configure({ importEventsEnabled: false }); }
});

test('streaming TV records without verified episode identity cannot mark a whole series watched', async () => {
  const { chooseImportMatch } = await import('../../importPipeline.js');
  const { buildWatchEvent, identifyImportEntries } = await import('../../importEvents.js');
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-series.json',import.meta.url),'utf8')).result;
  configure({ importEventsEnabled:true });
  const [entry] = identifyImportEntries([{ title:fixture.name,candidates:[{...fixture,media_type:'tv'}] }],'netflix','synthetic ambiguous episode record');
  const chosen = chooseImportMatch(entry,`tv:${fixture.id}`);
  assert.equal(chosen.status,'unmatched');
  assert.equal(chosen.reason,'episode_identity_required');
  assert.throws(() => buildWatchEvent({...chosen,status:'matched'},'owner'),/verified episode identity/);
  const verified = chooseImportMatch({...entry,seasonNumber:1,episodeNumber:3},`tv:${fixture.id}`);
  assert.equal(verified.status,'matched');
  assert.equal(buildWatchEvent(verified,'owner').episode_number,3);
});
