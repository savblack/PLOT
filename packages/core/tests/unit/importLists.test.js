import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePlatform } from '../../importParsing.js';
import { identifyImportEntries } from '../../importEvents.js';
import { writeImportedList } from '../../importLists.js';
import { configure } from '../../config.js';
import match from '../fixtures/imports/imdb-movie-match.json' with { type: 'json' };
const fixture = name => readFileSync(new URL(`../fixtures/imports/${name}`, import.meta.url),'utf8');

test('verified Letterboxd list formats retain membership without inventing watches', () => {
  const watchlist = parsePlatform('letterboxd',fixture('letterboxd-watchlist.csv'), { fileName: 'watchlist.csv' });
  assert.equal(watchlist.length,2);
  assert.equal(watchlist[0].destination.kind,'watchlist');
  assert.equal(watchlist[0].date,null);
  const list = parsePlatform('letterboxd',fixture('letterboxd-custom-list.csv'), { fileName: 'software-history.csv' });
  assert.equal(list[0].destination.name,'Software History');
  assert.equal(list[1].title,'Silicon Cowboys');
  assert.equal(list[0].date,null);
  assert.throws(() => parsePlatform('letterboxd','Name,Year\nExample,2020', { fileName: 'watchlist.csv' }), /Unsupported/);
});

test('list writes require selection, batch large imports and report the free allowance explicitly', async () => {
  const destination = { key: 'saved:list', kind: 'custom', name: 'Saved list' };
  // Catalogue identity is from a captured response; synthetic records test batching only.
  const media = match.movie;
  const entries = identifyImportEntries(Array.from({length: 101}, (_,i) => ({ title: media.title, destination, eventId: String(i), status: 'matched', tmdbId: media.id, tmdbTitle: media.title, mediaType: 'movie' })), 'letterboxd', 'synthetic batching input');
  const calls = [];
  configure({ importEventsEnabled: true, supabaseClient: { rpc: async (name,args) => { calls.push({name,args}); return { data: { inserted: args.p_records.length, duplicates: 0 } }; } } });
  const result = await writeImportedList({ userId: 'owner', resolved: entries });
  assert.equal(result.inserted,101);
  assert.deepEqual(calls.map(call => call.args.p_records.length),[50,50,1]);
  assert.ok(calls.every(call => call.name === 'import_saved_list'));
  assert.ok(calls.every(call => !call.args.p_records.some(row => row.event)));
  const skipped = await writeImportedList({ userId: 'owner', resolved: entries.map(row => ({ ...row,listSelected:false })) });
  assert.equal(skipped.notImported,'not_selected');
  assert.equal(calls.length,3);
  configure({ supabaseClient: { rpc: async () => ({ data: { inserted: 0, duplicates: 0, not_imported: 'free_list_limit' } }) } });
  const capped = await writeImportedList({ userId:'owner',resolved:entries });
  assert.equal(capped.notImported,'free_list_limit');
  assert.equal(capped.failed,101);
});

test('verified IMDb watchlists preserve external identity without treating list dates as watches', () => {
  const text=fixture('imdb-watchlist.csv');
  const entries=parsePlatform('imdb',text,{fileName:'watchlist.csv'});
  assert.equal(entries.length,2);
  assert.equal(entries[0].externalIds.imdb,'tt0054389');
  assert.equal(entries[0].date,null);
  assert.equal(entries[0].destination.kind,'watchlist');
  assert.throws(()=>parsePlatform('imdb',text,{fileName:'renamed.csv'}),/original watchlist.csv filename/);
  assert.throws(()=>parsePlatform('imdb',text.replace(',Movie,',',TV Series,'),{fileName:'watchlist.csv'}),/non-movie/);
});

test('mixed selections separate watches and lists and retain each skipped-list outcome', async () => {
  const { writeImportSelection } = await import('../../importPipeline.js');
  const media = match.movie;
  const base = { title: media.title, hint: 'movie', date: null, status: 'matched', tmdbId: media.id, tmdbTitle: media.title, mediaType: 'movie' };
  const rows = identifyImportEntries([
    { ...base, eventId: 'watch' },
    { ...base, eventId: 'member', destination: { kind: 'custom', key: 'one', name: 'One' } },
    { ...base, eventId: 'skip', listSelected: false, destination: { kind: 'custom', key: 'two', name: 'Two' } },
    { ...base, eventId: 'cap', destination: { kind: 'custom', key: 'three', name: 'Three' } },
  ], 'letterboxd', 'synthetic mixed selection');
  const calls = [];
  configure({ importEventsEnabled: true, supabaseClient: { rpc: async (name, args) => {
    calls.push({ name, args });
    if (args.p_list?.key === 'three') return { data: { not_imported: 'free_list_limit' } };
    return { data: { inserted: args.p_records.length, duplicates: 0 } };
  } } });
  const progress = [];
  const result = await writeImportSelection({ userId: 'owner', resolved: rows, summaryRows: [] }, { onProgress: (done, total) => progress.push([done, total]) });
  assert.equal(result.inserted, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.lists.map(row => row.notImported), ['', 'not_selected', 'free_list_limit']);
  assert.deepEqual(calls.map(call => call.name), ['import_watch_events', 'import_saved_list', 'import_saved_list']);
  assert.equal(calls[0].args.p_records.length, 1);
  assert.ok(calls.slice(1).every(call => call.args.p_records.every(row => !row.event)));
  assert.deepEqual(progress.at(-1), [4, 4]);
});

test('mixed imports report a failed watch batch while completing independent lists', async () => {
  const { writeImportSelection } = await import('../../importPipeline.js');
  const media = match.movie;
  const base = { title: media.title, hint: 'movie', date: null, status: 'matched', tmdbId: media.id, tmdbTitle: media.title, mediaType: 'movie' };
  const rows = identifyImportEntries([
    { ...base, eventId: 'watch' },
    { ...base, eventId: 'member', destination: { kind: 'watchlist', key: 'watchlist', name: 'Watchlist' } },
  ], 'letterboxd', 'synthetic partial failure');
  configure({ importEventsEnabled: true, supabaseClient: { rpc: async name => {
    if (name === 'import_watch_events') throw new Error('Connection interrupted');
    return { data: { inserted: 1, duplicates: 0 } };
  } } });
  const result = await writeImportSelection({ userId: 'owner', resolved: rows, summaryRows: [] });
  assert.equal(result.failed, 1);
  assert.equal(result.inserted, 1);
  assert.equal(result.lists[0].inserted, 1);
  configure({ importEventsEnabled: false, supabaseClient: {
    rpc() { assert.fail('No writes after flag is disabled'); },
    from() { assert.fail('No legacy fallback for mixed records'); },
  } });
  assert.deepEqual(await writeImportSelection({ userId: 'owner', resolved: rows, summaryRows: [] }), { inserted: 0, duplicates: 0, failed: 2 });
});

test('Trakt watchlist writer retains source notes and rating metadata without writing history', async () => {
  const media = match.movie;
  const text = JSON.stringify([{ id: 1, type: 'movie', movie: { title: media.title, year: Number(media.release_date.slice(0, 4)), ids: { imdb: 'tt0054389' } }, notes: 'Watch together', my_rating: { rating: 8 }, listed_at: null }]);
  const entries = identifyImportEntries(parsePlatform('trakt', text, { fileName: 'lists-watchlist.json' }), 'trakt', text).map(row => ({ ...row, status: 'matched', tmdbId: media.id, tmdbTitle: media.title, mediaType: 'movie' }));
  const calls = [];
  configure({ importEventsEnabled: true, supabaseClient: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { inserted: 1, duplicates: 0 } }; } } });
  await writeImportedList({ userId: 'owner', resolved: entries });
  assert.equal(calls[0].name, 'import_saved_list');
  assert.equal(calls[0].args.p_records[0].note, 'Watch together');
  assert.deepEqual(calls[0].args.p_records[0].source_metadata.trakt_rating, { rating: 8 });
  assert.equal(calls[0].args.p_records[0].event, undefined);
});
