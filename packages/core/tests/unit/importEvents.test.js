import assert from 'node:assert/strict';
import test from 'node:test';
import { importEventIdentity, planImportedLists } from '../../importEvents.js';

const file = { source: 'letterboxd', account: 'saved-export', fileDigest: 'a'.repeat(64) };

test('duplicate files reuse identities but repeated rows remain individual watches', () => {
  const first = importEventIdentity({ ...file, recordIndex: 0 });
  assert.equal(first, importEventIdentity({ ...file, recordIndex: 0 }));
  assert.notEqual(first, importEventIdentity({ ...file, recordIndex: 1 }));
});

test('provider event IDs survive export changes and are isolated by account', () => {
  const event = { ...file, eventId: 'provider-event' };
  assert.equal(importEventIdentity(event), importEventIdentity({ ...event, fileDigest: 'b'.repeat(64) }));
  assert.notEqual(importEventIdentity(event), importEventIdentity({ ...event, account: 'another-account' }));
  assert.notEqual(importEventIdentity(event), importEventIdentity({ ...event, source: 'trakt' }));
});

test('missing provenance cannot accidentally collapse all events into one', () => {
  assert.throws(() => importEventIdentity({ source: 'trakt', account: 'one' }));
  assert.throws(() => importEventIdentity({ ...file, recordIndex: -1 }));
});

test('free list imports explicitly report selections beyond the five-list allowance', () => {
  const lists = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  const result = planImportedLists({ lists, selectedIds: ['one', 'three'], existingCount: 4 });
  assert.deepEqual(result.map(r => r.reason), [null, 'not_selected', 'free_list_limit']);
  assert.equal(result.filter(r => r.import).length, 1);
});

test('premium lists are unlimited and repeated source lists do not consume capacity', () => {
  const lists = [{ id: 'one' }, { id: 'one' }, { id: 'two' }];
  assert.deepEqual(planImportedLists({ lists, selectedIds: ['one', 'two'], existingCount: 5, premium: true }).map(r => r.reason), [null, 'duplicate', null]);
});

test('file identity agrees with SHA-256 and is identical across repeated reads', async () => {
  const { identifyImportEntries } = await import('../../importEvents.js');
  const first = identifyImportEntries([{ title: 'Example' }, { title: 'Example' }], 'letterboxd', 'abc');
  assert.equal(first[0].fileDigest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(importEventIdentity(first[0]), importEventIdentity(first[1]));
  assert.deepEqual(first, identifyImportEntries([{ title: 'Example' }, { title: 'Example' }], 'letterboxd', 'abc'));
});

test('possible duplicates need review but distinct episodes and dates remain separate', async () => {
  const { possibleWatchDuplicates, needsDuplicateReview } = await import('../../importEvents.js');
  const { readFileSync } = await import('node:fs');
  const fixture = JSON.parse(readFileSync(new URL('../support/tmdbImportMatches.json', import.meta.url), 'utf8')).results[0];
  const entry = { ...file, recordIndex: 0, status: 'matched', tmdbId: fixture.id, mediaType: fixture.media_type, date: '2026-01-02' };
  const known = { tmdb_id: entry.tmdbId, media_type: entry.mediaType, source_key: 'another-provider-event', watched_on: entry.date };
  assert.equal(possibleWatchDuplicates(entry, [known]).length, 1);
  assert.equal(possibleWatchDuplicates(entry, [{ ...known, watched_on: '2026-01-03' }]).length, 0);
  assert.equal(possibleWatchDuplicates(entry, [{ ...known, watched_on: null }]).length, 1);
  assert.equal(possibleWatchDuplicates(entry, [{ ...known, source_key: importEventIdentity(entry) }]).length, 0);
  assert.ok(needsDuplicateReview({ ...entry, duplicateCandidates: [known] }));
  assert.equal(needsDuplicateReview({ ...entry, duplicateCandidates: [known], duplicateDecision: 'keep' }), false);
  assert.equal(needsDuplicateReview({ ...entry, status: 'unmatched', duplicateCandidates: [known] }), false);
});

test('an already imported watch is not confused with another rewatch of its title', async () => {
  const { alreadyImportedEvent, possibleWatchDuplicates } = await import('../../importEvents.js');
  const entry = { ...file, recordIndex: 0, status: 'matched' };
  const own = { source_key: importEventIdentity(entry) };
  const reviewed = { ...entry, knownEvents: [own] };
  assert.equal(alreadyImportedEvent(reviewed), true);
  assert.equal(alreadyImportedEvent({ ...reviewed, recordIndex: 1 }), false);
  assert.deepEqual(possibleWatchDuplicates(reviewed, [own, { source_key: 'another-watch' }]), []);
});

test('retry review preserves distinct source watches while retaining uncertain cross-source collisions', async () => {
  const { possibleWatchDuplicates } = await import('../../importEvents.js');
  const { default: fixture } = await import('../fixtures/imports/imdb-movie-match.json', { with: { type: 'json' } });
  const entry = { ...file, status: 'matched', recordIndex: 1, tmdbId: fixture.movie.id, mediaType: 'movie', date: null };
  const event = key => ({ source_key: key, tmdb_id: entry.tmdbId, media_type: entry.mediaType, watched_on: null });
  assert.deepEqual(possibleWatchDuplicates(entry, [event(importEventIdentity({ ...entry, recordIndex: 0 }))]), []);
  assert.equal(possibleWatchDuplicates(entry, [event(importEventIdentity({ ...entry, fileDigest: 'b'.repeat(64), recordIndex: 0 }))]).length, 1);
  for (const source of ['trakt', 'letterboxd']) {
    const first = { ...entry, source, eventId: source === 'trakt' ? 1 : 'diary:entry-a' };
    const second = { ...first, eventId: source === 'trakt' ? 2 : 'diary:entry-b' };
    assert.deepEqual(possibleWatchDuplicates(first, [event(importEventIdentity(second))]), []);
    assert.equal(possibleWatchDuplicates(first, [event(importEventIdentity({ ...second, account: 'different-account' }))]).length, 1);
  }
  const summary = { ...entry, eventId: 'watched:film' };
  assert.equal(possibleWatchDuplicates(summary, [event(importEventIdentity({ ...entry, eventId: 'diary:entry' }))]).length, 1);
  assert.equal(possibleWatchDuplicates(entry, [event('malformed-source-key')]).length, 1);
});
