import test from 'node:test';
import assert from 'node:assert/strict';
import { importReportMessages, importListSelections, importListResultMessage } from '../../importDocument.js';
import { writeImportSelection } from '../../importPipeline.js';
import { configure } from '../../config.js';

test('document reports keep skipped records and date warnings visible', () => {
  const messages = importReportMessages({ notImported: [{ title: 'A', reason: 'aggregate_rewatches', count: 3 }], warnings: [{ title: 'B', reason: 'timezone_unknown' }] });
  assert.equal(messages.length, 2);
  assert.match(messages[0], /A: 3 repeat watches/);
  assert.match(messages[1], /B: Watch time has no timezone/);
});

test('list review exposes every destination and reports each omitted list', () => {
  const a = { destination: { key: 'a', name: 'A' } };
  const b = { destination: { key: 'b', name: 'B' }, listSelected: false };
  assert.deepEqual(importListSelections([{}, a, a, b]), [a, b]);
  const message = importListResultMessage({ lists: [{ ...a, notImported: 'free_list_limit' }, { ...b, notImported: 'not_selected' }] });
  assert.match(message, /A:.*five free custom lists/);
  assert.match(message, /B:.*not selected/);
});

test('TV Time preview cannot write after its separate flag is disabled', async () => {
  configure({ importEventsEnabled: true, tvTimeImportEnabled: false, supabaseClient: { rpc() { assert.fail('Unexpected RPC'); }, from() { assert.fail('Unexpected legacy write'); } } });
  assert.deepEqual(await writeImportSelection({ userId: 'owner', resolved: [{ source: 'tvtime', status: 'matched' }], summaryRows: [] }), { inserted: 0, failed: 1, duplicates: 0 });
});

test('bundled TV Time files retain the exact identities of individual-file imports', async () => {
  const { prepareImportFiles } = await import('../../importDocument.js');
  const { importEventIdentity } = await import('../../importEvents.js');
  const { default: sample } = await import('../fixtures/imports/trakt-history.json', { with: { type: 'json' } });
  const movie = { title: sample[1].movie.title, id: sample[1].movie.ids, is_watched: true, watched_at: null, rating: null };
  const movies = { name: 'movies.json', text: JSON.stringify([movie]) };
  const lists = { name: 'lists.json', text: JSON.stringify([{ name: 'Together', shows: [], movies: [movie] }]) };
  const single = prepareImportFiles('tvtime', [movies]);
  const bundle = prepareImportFiles('tvtime', [lists, movies]);
  assert.equal(importEventIdentity(single.entries[0]), importEventIdentity(bundle.entries[1]));
  assert.equal(bundle.entries[0].destination.name, 'Together');
  assert.equal(bundle.entries[1].destination, undefined);
  assert.equal(bundle.entries[1].sourceFile, 'movies.json');
  const repeated = prepareImportFiles('tvtime', [movies, movies]);
  assert.equal(repeated.entries.length, 1);
  assert.equal(repeated.notImported[0].reason, 'duplicate_file');
  assert.throws(() => prepareImportFiles('tvtime', [movies, { ...movies, text: '[]' }]), /same name/);
  assert.throws(() => prepareImportFiles('tvtime', [movies, { name: 'shows.json', text: 'invalid' }]), /Unsupported TV Time/);
  assert.throws(() => prepareImportFiles('imdb', [movies, lists]), /one extracted file/);
});

test('large saved exports preserve every record without overflowing the argument stack', async () => {
  const { prepareImportFiles } = await import('../../importDocument.js');
  const { default: fixture } = await import('../fixtures/imports/trakt-history.json', { with: { type: 'json' } });
  // Repeated synthetic event identities stress transport size; catalogue IDs
  // come from the sourced fixture, not generated TMDB identifiers.
  const count = 150000;
  const text = JSON.stringify(Array.from({ length: count }, (_, index) => ({ ...fixture[1], id: index + 1 })));
  const document = prepareImportFiles('trakt', [{ name: 'watched-history.json', text }]);
  assert.equal(document.entries.length, count);
  assert.equal(document.entries[0].recordIndex, 0);
  assert.equal(document.entries.at(-1).recordIndex, count - 1);
  assert.equal(document.entries.at(-1).eventId, count);
  assert.ok(document.entries.every(entry => entry.date === null));
});
