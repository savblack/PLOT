import assert from 'node:assert/strict';
import test from 'node:test';
import { splitImportForBackground } from '../../importBackground.js';
import { importJobStatusLine, importJobTitle, importJobActive, importJobFinished, importFileFingerprint, enqueueError } from '../../importJobs.js';
import { IMPORT_JOBS } from '../../copy/importJobs.js';

/* A background import may only write what the preview would not have asked
 * about. Everything else waits for the user on the import page. */

test('splitImportForBackground writes clean matches and keeps questions for review', () => {
  const resolved = [
    { title: 'Heat', status: 'matched', tmdbId: 949, candidates: [{ id: 949 }] },
    // Several candidates, none accepted: the user picks.
    { title: 'Crash', status: 'unmatched', reason: 'review', candidates: [{ id: 1 }, { id: 2 }] },
    // A possible duplicate of a watch already saved: the user decides.
    { title: 'Alien', status: 'matched', tmdbId: 348, candidates: [{ id: 348 }], duplicateCandidates: [{ source_key: 'x' }] },
    // The same, already decided in a preview that was later backgrounded.
    { title: 'Aliens', status: 'matched', tmdbId: 679, candidates: [{ id: 679 }], duplicateCandidates: [{ source_key: 'y' }], duplicateDecision: 'keep' },
    // Nothing to offer.
    { title: 'Zzz', status: 'unmatched', reason: 'not_found', candidates: [] },
    { title: 'Yyy', status: 'unmatched', reason: 'search_failed' },
  ];
  const { ready, review, leftOut } = splitImportForBackground(resolved);
  assert.deepEqual(ready.map(r => r.title), ['Heat', 'Aliens']);
  assert.deepEqual(review.map(r => r.title), ['Crash', 'Alien']);
  assert.deepEqual(leftOut.map(r => r.title), ['Zzz', 'Yyy']);
});

test('the Home card reads the job row', () => {
  const base = { source: 'letterboxd', kind: 'file', phase: 'resolve', progress_done: 412, progress_total: 1200, imported: 0, duplicates: 0, failed: 0, review_count: 0 };
  assert.equal(importJobTitle({ ...base, status: 'running' }), 'Importing from Letterboxd');
  assert.equal(importJobStatusLine({ ...base, status: 'running' }), 'Matching 412 of 1,200 titles');
  assert.equal(importJobStatusLine({ ...base, status: 'running', phase: 'parse' }), 'Reading your file…');
  assert.equal(importJobStatusLine({ ...base, status: 'running', phase: 'write' }), 'Saving to your history…');
  assert.equal(importJobStatusLine({ ...base, status: 'running', kind: 'connection', source: 'trakt' }), 'Pulling your history from Trakt…');
  assert.equal(importJobStatusLine({ ...base, status: 'queued', phase: 'parse', progress_total: 0 }), 'Starting…');
  assert.equal(importJobStatusLine({ ...base, status: 'retry_wait' }), 'Hit a snag. Trying again shortly…');

  const done = { ...base, status: 'partial', phase: 'done', imported: 1180, duplicates: 3, review_count: 20, failed: 0 };
  assert.equal(importJobTitle(done), 'Your Letterboxd history is in');
  assert.equal(importJobStatusLine(done), '1,180 titles added, 3 duplicates skipped. 20 titles need a match from you.');
  assert.equal(importJobStatusLine({ ...done, status: 'succeeded', imported: 1, duplicates: 0, review_count: 0 }), '1 title added.');
  assert.equal(importJobStatusLine({ ...done, status: 'failed', last_error: 'Boom' }), 'Boom');
  assert.equal(importJobTitle({ ...done, status: 'failed' }), 'Your Letterboxd import stopped');
});

test('active and finished are disjoint and cover every status', () => {
  for (const status of ['queued', 'running', 'retry_wait']) {
    assert.equal(importJobActive({ status }), true);
    assert.equal(importJobFinished({ status }), false);
  }
  for (const status of ['succeeded', 'partial', 'failed', 'cancelled']) {
    assert.equal(importJobActive({ status }), false);
    assert.equal(importJobFinished({ status }), true);
  }
  assert.equal(importJobActive(null), false);
});

/* The same upload must not be queued twice while the first is still open
 * (enqueue_file_import_job, 20261111090000). The fingerprint is what both the
 * pre-upload check and the server compare. */
test('importFileFingerprint is stable across body types and pick order', async () => {
  const text = 'Date,Name,Year\n2024-01-01,Heat,1995\n';
  const bytes = new TextEncoder().encode(text);
  const fromBlob = await importFileFingerprint([{ name: 'watched.csv', body: new Blob([text]) }]);
  assert.match(fromBlob, /^[0-9a-f]{64}$/);
  assert.equal(await importFileFingerprint([{ name: 'watched.csv', body: bytes }]), fromBlob);
  assert.equal(await importFileFingerprint([{ name: 'watched.csv', body: bytes.buffer }]), fromBlob);

  const other = { name: 'ratings.csv', body: new TextEncoder().encode('Date,Name,Year,Rating\n') };
  const pair = await importFileFingerprint([{ name: 'watched.csv', body: bytes }, other]);
  assert.equal(await importFileFingerprint([other, { name: 'watched.csv', body: bytes }]), pair);
  assert.notEqual(pair, fromBlob);
});

test('importFileFingerprint tells apart a renamed or edited file', async () => {
  const bytes = new TextEncoder().encode('Date,Name,Year\n2024-01-01,Heat,1995\n');
  const watched = await importFileFingerprint([{ name: 'watched.csv', body: bytes }]);
  // The parsers read the name: watched.csv and watchlist.csv import differently.
  assert.notEqual(await importFileFingerprint([{ name: 'watchlist.csv', body: bytes }]), watched);
  const edited = new TextEncoder().encode('Date,Name,Year\n2024-01-01,Heat,1996\n');
  assert.notEqual(await importFileFingerprint([{ name: 'watched.csv', body: edited }]), watched);
});

test('importFileFingerprint gives up rather than guess', async () => {
  assert.equal(await importFileFingerprint([]), null);
  assert.equal(await importFileFingerprint([{ name: 'x.csv', body: 'not bytes' }]), null);
});

test('enqueue errors map to the shared copy', () => {
  assert.equal(enqueueError({ message: 'import_duplicate' }).message, IMPORT_JOBS.onboarding.alreadyImporting);
  assert.equal(enqueueError({ message: 'import_queue_full' }).message, IMPORT_JOBS.onboarding.queueFull);
  assert.equal(enqueueError(null), null);
});

test('the pickers ask about IMDb list files only', async () => {
  const { readFileSync } = await import('node:fs');
  const { importListChoiceNeeded } = await import('../../importJobs.js');
  const list = readFileSync(new URL('../fixtures/imports/imdb-watchlist.csv', import.meta.url), 'utf8');
  const ratings = readFileSync(new URL('../fixtures/imports/imdb-movie-ratings.csv', import.meta.url), 'utf8');
  assert.equal(importListChoiceNeeded('imdb', list), true);
  assert.equal(importListChoiceNeeded('imdb', list.split('\n')[0]), true); // the header row is enough
  assert.equal(importListChoiceNeeded('imdb', ratings), false);
  assert.equal(importListChoiceNeeded('letterboxd', list), false);
  assert.equal(importListChoiceNeeded('imdb', ''), false);
});

test('an answered IMDb list question names the upload so the worker reads the answer', async () => {
  const { configure } = await import('../../config.js');
  const { startFileImport } = await import('../../importJobs.js');
  const uploads = [];
  let enqueued;
  const chain = { select() { return chain; }, eq() { return chain; }, in() { return chain; }, limit: async () => ({ data: [], error: null }) };
  configure({ supabaseClient: {
    from: () => chain,
    storage: { from: () => ({ upload: async (path) => { uploads.push(path.split('/').pop()); return { error: null }; }, remove: async () => ({ error: null }) }) },
    rpc: async (_name, args) => { enqueued = args; return { data: { id: args.p_job }, error: null }; },
    auth: { getSession: async () => ({ data: { session: null } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  } });
  const file = () => [{ name: '7aff628a-6ff9-4549-8146-212eae03c528.csv', body: new TextEncoder().encode('Position,Const\n') }];
  for (const [listChoice, stored] of [['watchlist', 'imdb-watchlist.csv'], ['list', 'imdb-list.csv'], [null, '7aff628a-6ff9-4549-8146-212eae03c528.csv']]) {
    uploads.length = 0;
    const { error } = await startFileImport({ userId: 'u1', source: 'imdb', listChoice, files: file() });
    assert.equal(error, null);
    assert.deepEqual(uploads, [stored]);
    assert.ok(enqueued.p_files[0].endsWith(`/${stored}`));
  }
  // Another source ignores the answer.
  uploads.length = 0;
  await startFileImport({ userId: 'u1', source: 'letterboxd', listChoice: 'watchlist', files: [{ name: 'watched.csv', body: new Uint8Array([1]) }] });
  assert.deepEqual(uploads, ['watched.csv']);
});

test('the /import page and the background sheet read an answered IMDb list under one name', async () => {
  const { importFileNameForListChoice } = await import('../../importJobs.js');
  const { configure } = await import('../../config.js');
  const { parseImportDocument } = await import('../../importDocument.js');
  const { readFileSync } = await import('node:fs');
  const list = readFileSync(new URL('../fixtures/imports/imdb-watchlist.csv', import.meta.url), 'utf8');
  configure({ importEventsEnabled: true });
  try {
    assert.equal(parseImportDocument('imdb', list, { fileName: importFileNameForListChoice('watchlist') }).entries[0].destination.kind, 'watchlist');
    assert.equal(parseImportDocument('imdb', list, { fileName: importFileNameForListChoice('list') }).entries[0].destination.key, 'imdb:list');
  } finally {
    configure({ importEventsEnabled: false });
  }
});
