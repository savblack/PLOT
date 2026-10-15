import assert from 'node:assert/strict';
import test from 'node:test';
import { splitImportForBackground } from '../../importBackground.js';
import { importJobStatusLine, importJobTitle, importJobActive, importJobFinished } from '../../importJobs.js';

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
