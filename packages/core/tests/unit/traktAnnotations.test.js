import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTraktAnnotations } from '../../traktAnnotations.js';
import { buildWatchEvent } from '../../importEvents.js';
import { writeImportSelection } from '../../importPipeline.js';
import { configure } from '../../config.js';
import ratings from '../fixtures/imports/trakt-annotations.json' with { type: 'json' };
import comments from '../fixtures/imports/trakt-season-comment.json' with { type: 'json' };

test('Trakt annotations retain scope and unknown dates without inventing watch records', () => {
  const parsed = parseTraktAnnotations(JSON.stringify(ratings), 'rating');
  assert.equal(parsed[0].annotationScope, 'show');
  assert.equal(parsed[1].annotationScope, 'episode');
  assert.equal(parsed[1].seasonNumber, ratings[1].episode.season);
  assert.equal(parsed[1].episodeNumber, ratings[1].episode.number);
  assert.equal(parsed[1].annotation.rating, ratings[1].rating);
  assert.equal(parsed[1].annotation.ratedAt, null);
  assert.ok(parsed.every(row => !Object.hasOwn(row, 'date') && !Object.hasOwn(row, 'tmdbId')));
});

test('Trakt comments preserve text, spoiler metadata and season scope without exporting user identity', () => {
  const [row] = parseTraktAnnotations(JSON.stringify(comments), 'review');
  assert.equal(row.seasonNumber, comments[0].season.number);
  assert.equal(row.annotationScope, 'season');
  assert.equal(row.episodeNumber, undefined);
  assert.equal(row.annotation.text, 'Saved review');
  assert.equal(row.annotation.spoiler, comments[0].comment.spoiler);
  assert.equal(row.annotation.createdAt, null);
  assert.equal(row.eventId, `comment:${comments[0].comment.id}`);
  assert.equal(row.annotation.user, undefined);
});

test('malformed rating values and dates reject the entire annotation file', () => {
  for (const change of [{ rating: 0 }, { rating: 11 }, { rating: 2.5 }, { rated_at: '2024-02-30T00:00:00Z' }, { rated_at: 'yesterday' }]) {
    assert.throws(() => parseTraktAnnotations(JSON.stringify([ratings[0], { ...ratings[1], ...change }]), 'rating'), /Unsupported Trakt/);
  }
});

test('annotations cannot reach event or legacy history writers', async () => {
  const annotation = parseTraktAnnotations(JSON.stringify(ratings), 'rating')[0];
  assert.throws(() => buildWatchEvent(annotation, 'owner'), /not a watch/);
  for (const enabled of [false, true]) {
    configure({ importEventsEnabled: enabled, supabaseClient: { rpc() { assert.fail('No annotation RPC on watch path'); }, from() { assert.fail('No annotation history writes'); } } });
    assert.deepEqual(await writeImportSelection({ userId: 'owner', resolved: [{ ...annotation, status: 'matched' }], summaryRows: [] }), { inserted: 0, failed: 1, duplicates: 0 });
  }
});

test('annotation writer uses dedicated batched storage and pauses behind its own rollout flag', async () => {
  const { writeImportedAnnotations } = await import('../../importAnnotations.js');
  const { identifyImportEntries } = await import('../../importEvents.js');
  const { default: matched } = await import('../fixtures/imports/imdb-movie-match.json', { with: { type: 'json' } });
  const rows = identifyImportEntries(Array.from({ length: 51 }, (_, i) => ({ status: 'matched', tmdbId: matched.movie.id, mediaType: 'movie', annotationScope: 'movie', eventId: i, annotation: { kind: 'rating', rating: 8, ratedAt: null } })), 'trakt', 'synthetic batch');
  const calls = [];
  configure({ importAnnotationsEnabled: true, supabaseClient: { rpc: async (name, args) => { calls.push({ name, args }); return calls.length === 2 ? { error: new Error('offline') } : { data: { inserted: args.p_records.length, duplicates: 0 } }; } } });
  assert.deepEqual(await writeImportedAnnotations({ userId: 'owner', resolved: rows }), { inserted: 50, duplicates: 0, failed: 1 });
  assert.ok(calls.every(call => call.name === 'import_saved_annotations'));
  assert.deepEqual(calls.map(call => call.args.p_records.length), [50, 1]);
  configure({ importAnnotationsEnabled: false });
  assert.deepEqual(await writeImportedAnnotations({ userId: 'owner', resolved: rows }), { inserted: 0, duplicates: 0, failed: 51 });
  assert.equal(calls.length, 2);
});

test('mixed document routes annotations independently and reports a retryable partial failure', async () => {
  const { writeImportDocument, buildImportRows } = await import('../../importPipeline.js');
  const { identifyImportEntries } = await import('../../importEvents.js');
  const { default: captured } = await import('../fixtures/imports/imdb-movie-match.json', { with: { type: 'json' } });
  const common = { status: 'matched', tmdbId: captured.movie.id, mediaType: 'movie', tmdbTitle: captured.movie.title };
  const rows = identifyImportEntries([
    { ...common, eventId: 'watch', date: null },
    { ...common, eventId: 'rating', annotationScope: 'movie', annotation: { kind: 'rating', rating: 8, ratedAt: null } },
  ], 'trakt', 'synthetic mixed document');
  assert.equal(buildImportRows({ userId: 'owner', resolved: rows }).length, 1);
  const calls = [];
  const progress = [];
  let retry = false;
  configure({ importEventsEnabled: true, importAnnotationsEnabled: true, supabaseClient: {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'import_saved_annotations') return retry ? { data: { inserted: 1, duplicates: 0 } } : { error: new Error('offline') };
      assert.ok(args.p_records.every(record => !record.event.annotation));
      return { data: { inserted: retry ? 0 : 1, duplicates: retry ? 1 : 0 } };
    }, from() { assert.fail('No direct title-level writes'); },
  } });
  const input = { userId: 'owner', resolved: rows, summaryRows: [] };
  const first = await writeImportDocument(input, { onProgress: (done, total) => progress.push([done, total]) });
  assert.equal(first.inserted, 1);
  assert.equal(first.failed, 1);
  assert.deepEqual(first.annotations, { inserted: 0, duplicates: 0, failed: 1 });
  assert.deepEqual(progress.at(-1), [2, 2]);
  assert.deepEqual(calls.map(call => call.name), ['import_watch_events', 'import_saved_annotations']);
  retry = true;
  const second = await writeImportDocument(input);
  assert.equal(second.inserted, 1);
  assert.equal(second.duplicates, 1);
  assert.equal(second.failed, 0);
  configure({ importAnnotationsEnabled: false });
});

test('mixed document validates rollout flags and duplicate review before any writes', async () => {
  const { writeImportDocument } = await import('../../importPipeline.js');
  const rows = [{ status: 'matched', duplicateCandidates: [{}] }, { status: 'matched', annotation: { kind: 'rating' } }];
  const client = { rpc() { assert.fail('No writes before review'); }, from() { assert.fail('No history writes'); } };
  for (const [importEventsEnabled, importAnnotationsEnabled] of [[false, true], [true, false]]) {
    configure({ importEventsEnabled, importAnnotationsEnabled, supabaseClient: client });
    assert.deepEqual(await writeImportDocument({ userId: 'owner', resolved: rows, summaryRows: [] }), { inserted: 0, duplicates: 0, failed: 2 });
  }
  configure({ importEventsEnabled: true, importAnnotationsEnabled: true });
  await assert.rejects(writeImportDocument({ userId: 'owner', resolved: rows, summaryRows: [] }), /Duplicate review/);
  configure({ importAnnotationsEnabled: false });
});

test('saved annotation files retain their identity in a ZIP and stay unavailable when the flag is off', async () => {
  const { prepareImportFiles } = await import('../../importDocument.js');
  const { prepareImportArchive } = await import('../../importArchive.js');
  const { zipSync, strToU8 } = await import('fflate');
  const { importEventIdentity } = await import('../../importEvents.js');
  const text = JSON.stringify([ratings[0]]);
  const name = 'ratings-shows.json';
  configure({ importEventsEnabled: true, importAnnotationsEnabled: false });
  assert.throws(() => prepareImportFiles('trakt', [{ name, text }]), /not available/);
  configure({ importAnnotationsEnabled: true });
  assert.throws(() => prepareImportFiles('trakt', [{ name: 'ratings-episodes.json', text }]), /Unsupported Trakt/);
  const extracted = prepareImportFiles('trakt', [{ name, text }]);
  const archive = prepareImportArchive('trakt', zipSync({ [name]: strToU8(text) }));
  assert.equal(importEventIdentity(extracted.entries[0]), importEventIdentity(archive.entries[0]));
  assert.equal(archive.entries[0].annotation.kind, 'rating');
  configure({ importAnnotationsEnabled: false });
});

test('annotation duplicate review reads its own owner-scoped store beyond the row limit', async () => {
  const { reviewImportDuplicates } = await import('../../importPipeline.js');
  const { identifyImportEntries, importEventIdentity, alreadyImportedEvent } = await import('../../importEvents.js');
  const { createInMemorySupabase } = await import('../support/inMemorySupabase.js');
  const { default: captured } = await import('../fixtures/imports/imdb-movie-match.json', { with: { type: 'json' } });
  const candidate = { ...captured.movie, media_type: 'movie' };
  const [entry] = identifyImportEntries([{ status: 'matched', tmdbId: candidate.id, mediaType: 'movie', candidates: [candidate], annotation: { kind: 'rating' } }], 'trakt', 'synthetic annotation');
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: String(i).padStart(5, '0'), user_id: 'owner', source_key: `other:${i}`, tmdb_id: candidate.id, media_type: 'movie' }));
  rows[1000].source_key = importEventIdentity(entry);
  const client = createInMemorySupabase({ tables: { imported_annotations: rows, watch_events: [] } });
  configure({ importEventsEnabled: true, importAnnotationsEnabled: true, supabaseClient: client });
  const result = await reviewImportDuplicates({ userId: 'owner', resolved: [entry] });
  assert.equal(result.error, null);
  assert.equal(alreadyImportedEvent(result.resolved[0]), true);
  assert.deepEqual(result.resolved[0].duplicateCandidates, []);
  const other = await reviewImportDuplicates({ userId: 'other', resolved: [entry] });
  assert.equal(alreadyImportedEvent(other.resolved[0]), false);
  configure({ importAnnotationsEnabled: false });
});
