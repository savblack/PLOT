import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { writeImportDocument } from '../../importPipeline.js';

// The import-worker is the service role. The three import writers read the
// account from the caller's session, so they refused every batch from it and
// a background import saved nothing (found on production, 2026-11-16). The
// worker now sets importActsForUser and the calls name the account.

const USER = '00000000-0000-4000-8000-0000000000aa';
const matched = extra => ({ status: 'matched', tmdbId: 603, mediaType: 'movie', tmdbTitle: 'The Matrix', posterPath: null, title: 'The Matrix', year: '1999', hint: 'movie', date: null, source: 'letterboxd', account: 'local', fileDigest: 'd', recordIndex: 0, ...extra });
const rows = [
  matched({ eventId: 'watched:https://boxd.it/a' }),
  matched({ eventId: 'letterboxd:watchlist:https://boxd.it/b', destination: { kind: 'watchlist', key: 'letterboxd:watchlist', name: 'Watchlist' } }),
  matched({ eventId: 'rating:https://boxd.it/c', annotationScope: 'movie', annotation: { kind: 'rating', rating: 6, ratedAt: null } }),
];

function client(calls) {
  return { rpc: async (name, args) => { calls.push([name, args]); return { data: { inserted: 1, duplicates: 0 }, error: null }; } };
}

test('the apps call the import writers as the signed-in person', async () => {
  const calls = [];
  configure({ supabaseClient: client(calls), importEventsEnabled: true, importAnnotationsEnabled: true, importActsForUser: false });
  const outcome = await writeImportDocument({ userId: USER, resolved: rows, summaryRows: [] });
  assert.equal(outcome.failed, 0);
  assert.deepEqual(calls.map(([name]) => name).sort(), ['import_saved_annotations', 'import_saved_list', 'import_watch_events']);
  for (const [, args] of calls) assert.equal('p_user' in args, false);
});

test('the worker calls the same writers by account, so its saves are not refused', async () => {
  const calls = [];
  configure({ supabaseClient: client(calls), importEventsEnabled: true, importAnnotationsEnabled: true, importActsForUser: true });
  try {
    const outcome = await writeImportDocument({ userId: USER, resolved: rows, summaryRows: [] });
    assert.equal(outcome.failed, 0);
    assert.equal(outcome.inserted, 3);
    assert.deepEqual(calls.map(([name]) => name).sort(), ['import_saved_annotations_as', 'import_saved_list_as', 'import_watch_events_as']);
    for (const [, args] of calls) assert.equal(args.p_user, USER);
    const list = calls.find(([name]) => name === 'import_saved_list_as')[1];
    assert.equal(list.p_list.kind, 'watchlist');
    assert.equal(list.p_records.length, 1);
  } finally {
    configure({ importActsForUser: false, importEventsEnabled: false, importAnnotationsEnabled: false });
  }
});

test('the worker turns the setting on, and neither app does', async () => {
  const { readFileSync } = await import('node:fs');
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(read('../../../../supabase/functions/import-worker/index.ts'), /importActsForUser: true/);
  assert.doesNotMatch(read('../../../../apps/web/src/main.jsx'), /importActsForUser/);
  assert.doesNotMatch(read('../../../../apps/mobile/lib/configureCore.ts'), /importActsForUser/);
});

test('an import that tried to save and saved nothing is a failure, not a partial import', async () => {
  const { importSavedNothing } = await import('../../importBackground.js');
  assert.equal(importSavedNothing({ inserted: 0, duplicates: 0, failed: 4 }), true);
  // Some saved, everything already there, or nothing attempted: not this.
  assert.equal(importSavedNothing({ inserted: 1, duplicates: 0, failed: 3 }), false);
  assert.equal(importSavedNothing({ inserted: 0, duplicates: 4, failed: 0 }), false);
  assert.equal(importSavedNothing({ inserted: 0, duplicates: 2, failed: 2 }), false);
  assert.equal(importSavedNothing({ inserted: 0, duplicates: 0, failed: 0 }), false);
  assert.equal(importSavedNothing(undefined), false);
  // The worker stops before it removes the uploaded files, so the job can retry.
  const { readFileSync } = await import('node:fs');
  const worker = readFileSync(new URL('../../../../supabase/functions/import-worker/index.ts', import.meta.url), 'utf8');
  assert.ok(worker.indexOf('engine.importSavedNothing(outcome)') > 0);
  assert.ok(worker.indexOf('engine.importSavedNothing(outcome)') < worker.indexOf("await removeArtifacts(admin, job, [...job.files, '_entries.json', '_resolved.json']);\n    return finish"));
});
