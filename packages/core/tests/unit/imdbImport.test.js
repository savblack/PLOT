import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parsePlatform } from '../../importParsing.js';
const fixture = readFileSync(new URL('../fixtures/imports/imdb-movie-ratings.csv', import.meta.url), 'utf8');

test('verified IMDb movie ratings preserve external IDs and ratings, not inferred watch dates', () => {
  const rows = parsePlatform('imdb', fixture);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].externalIds.imdb, 'tt0058003');
  assert.equal(rows[0].rating, 5);
  assert.equal(rows[0].year, '1964');
  assert.ok(rows.every(row => row.date === null && row.hint === 'movie'));
});

test('unsupported IMDb files fail explicitly before writing', () => {
  assert.throws(() => parsePlatform('imdb', 'Title,Rating\nExample,5'), /Unsupported IMDb export/);
  // A single unidentifiable row is left out and counted, not fatal.
  const leftOut = [];
  assert.equal(parsePlatform('imdb', fixture.replace('tt0058003', 'not-an-id'), { onLeftOut: r => leftOut.push(r) }).length, 1);
  assert.deepEqual(leftOut, ['record_incomplete']);
});

test('verified external IDs take precedence over translated title text', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/imports/imdb-movie-match.json', import.meta.url), 'utf8'));
  const { resolveImportEntries } = await import('../../importPipeline.js');
  let searches = 0;
  const [entry] = await resolveImportEntries([{ title: 'Il deserto rosso', hint: 'movie', externalIds: { imdb: fixture.imdb } }], {
    search: () => { searches++; return Promise.resolve({ results: [] }); },
    findByImdbId: id => {
      assert.equal(id, fixture.imdb);
      return Promise.resolve({ movie_results: [fixture.movie] });
    },
  });
  assert.equal(entry.tmdbId, fixture.movie.id);
  assert.equal(entry.status, 'matched');
  assert.equal(searches, 0);
});

test('a failed identifier lookup never silently falls back to title matching', async () => {
  const { resolveImportEntries } = await import('../../importPipeline.js');
  const [entry] = await resolveImportEntries(parsePlatform('imdb', fixture).slice(0, 1), {
    search: () => { throw new Error('Title fallback must not run'); },
    findByImdbId: () => Promise.resolve(null),
  });
  assert.equal(entry.status, 'unmatched');
  assert.equal(entry.reason, 'search_failed');
});


test('saved IMDb series ratings preserve rating dates without asserting any watched episodes', async () => {
  const { parseImportDocument } = await import('../../importDocument.js');
  const { configure } = await import('../../config.js');
  const text = readFileSync(new URL('../fixtures/imports/imdb-tv-ratings.csv', import.meta.url), 'utf8');
  configure({ importAnnotationsEnabled: true, importEventsEnabled: true });
  const { entries } = parseImportDocument('imdb', text, { fileName: 'ratings.csv' });
  assert.equal(entries.length, 2);
  assert.ok(entries.every(row => row.hint === 'tv' && row.annotationScope === 'show' && row.date === null));
  assert.ok(entries.every(row => row.annotation.rating === 7 && row.annotation.ratedAt === '2024-01-15'));
  assert.ok(entries.every(row => row.episodeNumber == null && row.seasonNumber == null && row.eventId === `rating:${row.externalIds.imdb}`));
  const badDate = parseImportDocument('imdb', text.replaceAll('2024-01-15', '2024-02-30'));
  assert.equal(badDate.entries.length, 0);
  assert.deepEqual(badDate.notImported, [{ title: 'IMDb', reason: 'record_incomplete', count: 2 }]);
  configure({ importAnnotationsEnabled: false });
  // With show ratings off, the series rows are left out and counted rather
  // than failing the file. This file holds nothing else.
  const off = parseImportDocument('imdb', text);
  assert.equal(off.entries.length, 0);
  assert.deepEqual(off.notImported, [{ title: 'IMDb', reason: 'show_ratings_unavailable', count: 2 }]);
  configure({ importAnnotationsEnabled: true });
});

// A ratings export mixing movies with series, episodes and other title types,
// assembled from the two verified fixtures. IMDb IDs come from those files.
const tvFixture = readFileSync(new URL('../fixtures/imports/imdb-tv-ratings.csv', import.meta.url), 'utf8');
const movieRows = fixture.trim().split('\n').slice(1);
const seriesRows = tvFixture.trim().split('\n').slice(1)
  // Re-shape to the movie fixture's column order (it adds Original Title).
  .map(line => line.replace(/^(tt\d+,\d+,[^,]*,)([^,]+,)/, '$1$2$2'));
const mixedRatings = [fixture.split('\n')[0], ...movieRows, ...seriesRows,
  movieRows[0].replace(',Movie,', ',TV Episode,'),
  movieRows[1].replace(',Movie,', ',TV Special,'),
].join('\n');

test('IMDb ratings leave out episodes and other title types instead of refusing the file', () => {
  const leftOut = [];
  const rows = parsePlatform('imdb', mixedRatings, { onLeftOut: reason => leftOut.push(reason) });
  assert.equal(rows.filter(row => row.hint === 'movie').length, 2);
  assert.equal(rows.filter(row => row.annotation).length, 2);
  assert.deepEqual(leftOut, ['title_type_unsupported', 'title_type_unsupported']);
});

test('TV movies, shorts and videos import as movies, resolved by their IMDb ID', () => {
  for (const type of ['TV Movie', 'Short', 'tvShort', 'Video']) {
    const rows = parsePlatform('imdb', fixture.replace(',Movie,', `,${type},`));
    assert.equal(rows[0].hint, 'movie');
    assert.equal(rows[0].externalIds.imdb, 'tt0058003');
  }
});

test('with show ratings off, an IMDb ratings export still imports its movies', async () => {
  const { parseImportDocument, importReportMessages } = await import('../../importDocument.js');
  const { configure } = await import('../../config.js');
  configure({ importAnnotationsEnabled: false, importEventsEnabled: false });
  const document = parseImportDocument('imdb', mixedRatings, { fileName: '3f2a9c1e-ratings.csv' });
  assert.equal(document.entries.length, 2);
  assert.ok(document.entries.every(row => row.hint === 'movie' && row.rating === 5 && !row.annotation));
  assert.deepEqual(document.notImported, [
    { title: 'IMDb', reason: 'title_type_unsupported', count: 2 },
    { title: 'IMDb', reason: 'show_ratings_unavailable', count: 2 },
  ]);
  assert.match(importReportMessages(document).join(' '), /2 TV show ratings were left out/);
});

test('IMDb movie ratings write through the standard history path when the event importer is off', async () => {
  const { configure } = await import('../../config.js');
  const { identifyImportEntries } = await import('../../importEvents.js');
  const { writeImportSelection, buildImportRows } = await import('../../importPipeline.js');
  const { createInMemorySupabase } = await import('../support/inMemorySupabase.js');
  const match = JSON.parse(readFileSync(new URL('../fixtures/imports/imdb-movie-match.json', import.meta.url), 'utf8')).movie;
  const [entry] = identifyImportEntries(parsePlatform('imdb', fixture).slice(0, 1), 'imdb', fixture);
  const resolved = [{ ...entry, status: 'matched', tmdbId: match.id, mediaType: 'movie', tmdbTitle: match.title }];
  const client = createInMemorySupabase({ tables: { history: [] } });
  configure({ importEventsEnabled: false, importAnnotationsEnabled: false, supabaseClient: client });
  const summaryRows = buildImportRows({ userId: 'u1', resolved }).map(({ row }) => row);
  const outcome = await writeImportSelection({ userId: 'u1', resolved, summaryRows });
  assert.equal(outcome.inserted, 1);
  assert.equal(outcome.failed, 0);
  assert.equal(summaryRows[0].rating, 5);
  assert.equal(summaryRows[0].watched_at, null);
  // A show rating is an annotation and still never takes this path.
  const show = [{ ...resolved[0], annotation: { kind: 'rating', rating: 7 } }];
  assert.equal((await writeImportSelection({ userId: 'u1', resolved: show, summaryRows: [] })).inserted, 0);
});

const watchlistFixture = readFileSync(new URL('../fixtures/imports/imdb-watchlist.csv', import.meta.url), 'utf8');

test('an IMDb watchlist or list says lists are unavailable while the event importer is off', async () => {
  const { parseImportDocument } = await import('../../importDocument.js');
  const { configure } = await import('../../config.js');
  configure({ importEventsEnabled: false });
  for (const fileName of ['watchlist.csv', 'WATCHLIST (1).csv', '7aff628a-6ff9-4549-8146-212eae03c528.csv', '']) {
    assert.throws(() => parseImportDocument('imdb', watchlistFixture, { fileName }), /can’t import lists from IMDb yet/);
  }
});

test('an IMDb watchlist is recognised by name; any other list becomes a custom list, never the watchlist', async () => {
  const { parseImportDocument } = await import('../../importDocument.js');
  const { configure } = await import('../../config.js');
  configure({ importEventsEnabled: true });
  try {
    for (const fileName of ['watchlist.csv', 'watchlist (1).csv', 'Watchlist 2.csv', 'imdb-watchlist.csv']) {
      const { entries } = parseImportDocument('imdb', watchlistFixture, { fileName });
      assert.equal(entries.length, 2, fileName);
      assert.ok(entries.every(row => row.destination.kind === 'watchlist'));
    }
    // IMDb's current exports are named with a random ID, like this one.
    for (const [fileName, key] of [['7aff628a-6ff9-4549-8146-212eae03c528.csv', 'imdb:list:7aff628a-6ff9-4549-8146-212eae03c528'], ['favorites (1).csv', 'imdb:list:favorites']]) {
      const { entries } = parseImportDocument('imdb', watchlistFixture, { fileName });
      assert.equal(entries.length, 2, fileName);
      assert.ok(entries.every(row => row.destination.kind === 'custom' && row.destination.key === key && row.destination.name === 'IMDb list'));
      assert.ok(entries.every(row => row.eventId === `${key}:${row.externalIds.imdb}` && row.date === null));
    }
    // Retrying the same file gives the same keys, so nothing is added twice.
    const again = parseImportDocument('imdb', watchlistFixture, { fileName: '7aff628a-6ff9-4549-8146-212eae03c528.csv' });
    assert.equal(again.entries[0].eventId, `imdb:list:7aff628a-6ff9-4549-8146-212eae03c528:${again.entries[0].externalIds.imdb}`);
  } finally {
    configure({ importEventsEnabled: false });
  }
});

test('a long IMDb list with shorts, episodes and unreleased titles imports what Plot can match', async () => {
  const { parseImportDocument, importReportMessages } = await import('../../importDocument.js');
  const { configure } = await import('../../config.js');
  const [header, first, second] = watchlistFixture.trim().split('\n');
  // Hand-made odd rows from the two verified records; IMDb IDs are unchanged.
  const text = [header, first, second,
    first.replace(',Movie,', ',Short,'),
    second.replace(',Movie,', ',TV Episode,'),
    first.replace(',Movie,', ',Video Game,'),
    second.replace(',2023,', ',,'),
    first.replace('tt0054389', ''),
    second.replace(',Movie,', ',TV Movie,').replace(',,\r', ',11,\r').replace(/,,$/, ',11,'),
  ].join('\n');
  configure({ importEventsEnabled: true });
  try {
    const document = parseImportDocument('imdb', text, { fileName: '7aff628a-6ff9-4549-8146-212eae03c528.csv' });
    // two originals, the short, the no-year title, and the TV movie
    assert.equal(document.entries.length, 5);
    assert.ok(document.entries.every(row => row.destination.kind === 'custom' && /^tt\d+$/.test(row.externalIds.imdb)));
    assert.equal(document.entries.filter(row => row.year === null).length, 1);
    assert.equal(document.entries.at(-1).rating, null); // 11 is not a rating
    assert.deepEqual(document.notImported, [
      { title: 'IMDb', reason: 'title_type_unsupported', count: 2 },
      { title: 'IMDb', reason: 'record_incomplete', count: 1 },
    ]);
    assert.match(importReportMessages(document).join(' '), /2 episodes, TV specials, games/);
  } finally {
    configure({ importEventsEnabled: false });
  }
});

test('an IMDb rated title with no year is still imported by its IMDb ID', () => {
  const rows = parsePlatform('imdb', fixture.replace(',1964,', ',,'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].year, null);
  assert.equal(rows[0].externalIds.imdb, 'tt0058003');
});
