import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLetterboxdDocument } from '../../letterboxdImport.js';
import { parseImportDocument } from '../../importDocument.js';
import { configure } from '../../config.js';
const fixture = name => readFileSync(new URL(`../fixtures/imports/letterboxd-${name}.csv`, import.meta.url), 'utf8');

test('public Letterboxd diary and watched samples preserve unknown watch dates and stable source identities', () => {
  for (const name of ['diary', 'watched']) {
    const { entries } = parseLetterboxdDocument(fixture(name), `${name}.csv`);
    assert.equal(entries.length, 2);
    assert.ok(entries.every(row => row.date === null && !Object.hasOwn(row, 'tmdbId')));
    assert.ok(entries.every(row => row.eventId === `${name}:${row.externalIds.letterboxd}`));
  }
});

test('Letterboxd ratings retain a private rating and an explicitly unknown-date watched state', () => {
  const { entries } = parseLetterboxdDocument(fixture('ratings'), 'ratings.csv');
  assert.equal(entries.length, 4);
  const [rating, watched] = entries;
  assert.equal(rating.annotation.rating, 6);
  assert.equal(rating.annotation.ratedAt, null);
  assert.equal(watched.eventId, `watched:${rating.externalIds.letterboxd}`);
  assert.equal(watched.date, null);
  assert.equal(watched.rating, 6);
});

test('Letterboxd review without a watch date preserves text without inventing a diary event', () => {
  const { entries } = parseLetterboxdDocument(fixture('reviews'), 'reviews.csv');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].annotation.text, 'Saved review');
  assert.equal(entries[0].annotation.spoilerStatus, 'unknown');
  assert.equal(entries[0].annotation.watchedOn, null);
  assert.equal(entries[0].annotation.createdAt, null);
});

test('a dated Letterboxd review uses the matching diary event identity', () => {
  const base = '2024-01-02,Example,2020,https://boxd.it/test,3,Yes,';
  const review = parseLetterboxdDocument('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n' + base + 'Saved review,,2024-01-01', 'reviews.csv').entries;
  const diary = parseLetterboxdDocument('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n' + base + ',2024-01-01', 'diary.csv').entries;
  assert.equal(review[1].eventId, diary[0].eventId);
  assert.equal(review[1].date, '2024-01-01');
  assert.equal(review[0].annotation.createdAt, '2024-01-02');
});

test('strict saved Letterboxd layouts reject malformed dates, ratings and unexpected columns', () => {
  const header = 'Date,Name,Year,Letterboxd URI,Rating';
  for (const row of ['2024-02-30,Example,2020,https://boxd.it/test,3', ',Example,2020,https://boxd.it/test,6', ',Example,2020,https://boxd.it/test,3stars', ',Example,2020,https://boxd.it/test,3,extra']) {
    assert.throws(() => parseLetterboxdDocument(`${header}\n${row}`, 'ratings.csv'), /Unsupported Letterboxd/);
  }
  assert.throws(() => parseLetterboxdDocument(fixture('ratings'), 'diary.csv'), /Unsupported Letterboxd/);
  assert.throws(() => parseLetterboxdDocument('Date,Name,Year,Letterboxd URI\n,Example,,https://boxd.it/test', 'watched.csv'), /Unsupported Letterboxd/);
});

test('Letterboxd annotation documents cannot enter the legacy watch-only UI path', () => {
  configure({ importEventsEnabled: true, importAnnotationsEnabled: false });
  assert.throws(() => parseImportDocument('letterboxd', fixture('ratings'), { fileName: 'ratings.csv' }), /not available/);
  configure({ importAnnotationsEnabled: true });
  assert.equal(parseImportDocument('letterboxd', fixture('ratings'), { fileName: 'ratings.csv' }).entries.length, 4);
  configure({ importAnnotationsEnabled: false });
});

test('Letterboxd bundle combines matching source IDs while preserving separate diary watches', async () => {
  const { prepareImportFiles } = await import('../../importDocument.js');
  const { prepareImportArchive } = await import('../../importArchive.js');
  const { zipSync, strToU8 } = await import('fflate');
  const { importEventIdentity } = await import('../../importEvents.js');
  const diary = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n,Example,2020,https://boxd.it/entry-a,3,,,2024-01-01\n,Example,2020,https://boxd.it/entry-b,4,Yes,,2024-01-02';
  const review = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n,Example,2020,https://boxd.it/entry-a,3,,Saved review,,2024-01-01';
  const watched = 'Date,Name,Year,Letterboxd URI\n,Example,2020,https://boxd.it/film';
  const ratings = 'Date,Name,Year,Letterboxd URI,Rating\n,Example,2020,https://boxd.it/film,4';
  const files = [{ name: 'diary.csv', text: diary }, { name: 'reviews.csv', text: review }, { name: 'watched.csv', text: watched }, { name: 'ratings.csv', text: ratings }];
  configure({ importEventsEnabled: true, importAnnotationsEnabled: true });
  const document = prepareImportFiles('letterboxd', files);
  assert.equal(document.entries.length, 5);
  assert.equal(document.entries.filter(row => row.eventId.startsWith('diary:')).length, 2);
  assert.equal(document.entries.find(row => row.eventId === 'diary:https://boxd.it/entry-a').note, 'Saved review');
  assert.equal(document.warnings.find(row => row.reason === 'same_source_record').count, 2);
  const archive = prepareImportArchive('letterboxd', zipSync(Object.fromEntries([...files.map(file => [file.name, strToU8(file.text)]), ['profile.csv', strToU8('private profile omitted')]])));
  assert.deepEqual(archive.entries.map(importEventIdentity), document.entries.map(importEventIdentity));
  assert.ok(archive.notImported.some(row => row.title === 'profile.csv'));
  configure({ importAnnotationsEnabled: false });
});

test('conflicting Letterboxd source records fail before lookup or writes', async () => {
  const { prepareImportFiles } = await import('../../importDocument.js');
  const text = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n,Example,2020,https://boxd.it/entry,3,,,2024-01-01';
  assert.throws(() => prepareImportFiles('letterboxd', [{ name: 'diary.csv', text }, { name: 'letterboxd-diary.csv', text: text.replace('2024-01-01', '2024-01-02') }]), /conflicting values/);
});

test('pending Letterboxd summaries are left out unless saved as a separate watch', async () => {
  const { reviewPendingWatchSummaries, needsDuplicateReview, leftOutWatchSummary, identifyImportEntries, importEventIdentity } = await import('../../importEvents.js');
  const { writeImportDocument } = await import('../../importPipeline.js');
  const { default: captured } = await import('../fixtures/imports/imdb-movie-match.json', { with: { type: 'json' } });
  const common = { status: 'matched', tmdbId: captured.movie.id, mediaType: 'movie', tmdbTitle: captured.movie.title };
  const rows = identifyImportEntries([{ ...common, eventId: 'diary:entry' }, { ...common, eventId: 'watched:film' }], 'letterboxd', 'synthetic overlap');
  const reviewed = reviewPendingWatchSummaries(rows);
  assert.equal(needsDuplicateReview(reviewed[0]), false);
  assert.equal(needsDuplicateReview(reviewed[1]), false);
  assert.equal(leftOutWatchSummary(reviewed[1]), true);
  assert.equal(leftOutWatchSummary(reviewPendingWatchSummaries([{ ...rows[0], status: 'unmatched' }, rows[1]])[1]), false);
  const written = [];
  configure({ importEventsEnabled: true, supabaseClient: { rpc: async (_name, { p_records }) => {
    written.push(...p_records.map(record => record.event.source_key));
    return { data: { inserted: p_records.length, duplicates: 0 }, error: null };
  } } });
  try {
    const first = await writeImportDocument({ userId: 'owner', resolved: rows, summaryRows: [] });
    assert.equal(first.inserted, 1);
    assert.deepEqual(written, [importEventIdentity(rows[0])]);
    const kept = rows.map(row => row.eventId === 'watched:film' ? { ...row, duplicateDecision: 'keep' } : row);
    const second = await writeImportDocument({ userId: 'owner', resolved: kept, summaryRows: [] });
    assert.equal(second.inserted, 2);
    assert.deepEqual(written.slice(1), rows.map(importEventIdentity));
  } finally {
    configure({ importEventsEnabled: false });
  }
});

test('Letterboxd archive list files remain membership records and unrelated CSVs are reported', async () => {
  const { prepareImportArchive } = await import('../../importArchive.js');
  const { zipSync, strToU8 } = await import('fflate');
  configure({ importEventsEnabled: true });
  try {
    const document = prepareImportArchive('letterboxd', zipSync({
      'lists/software-history.csv': strToU8(fixture('custom-list')),
      'watchlist.csv': strToU8(fixture('watchlist')),
      'comments.csv': strToU8('not a supported review file'),
    }));
    assert.equal(document.entries.length, 4);
    assert.ok(document.entries.every(row => row.destination && row.date === null));
    assert.equal(document.entries.filter(row => row.destination.kind === 'custom').length, 2);
    assert.deepEqual(document.notImported, [{ title: 'comments.csv', reason: 'archive_file_unsupported' }]);
  } finally {
    configure({ importEventsEnabled: false });
  }
});

test('a Letterboxd export keeps diary and watched rows when list import is off', async () => {
  const { prepareImportArchive } = await import('../../importArchive.js');
  const { zipSync, strToU8 } = await import('fflate');
  const diary = [
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
    '2024-03-02,Parasite,2019,https://boxd.it/parasite,4.5,,,2024-03-01',
    '2024-06-02,Parasite,2019,https://boxd.it/parasite-rewatch,4,Yes,rewatch,2024-06-01',
    '2024-04-02,"Goodbye, Dragon Inn",2003,https://boxd.it/dragon,3.5,,,2024-04-01',
    '2024-05-02,Moonlight,2016,https://boxd.it/moonlight,,,,',
  ].join('\n');
  const watched = [
    'Date,Name,Year,Letterboxd URI',
    '2024-03-02,Parasite,2019,https://boxd.it/parasite',
    '2024-01-02,Heat,1995,https://boxd.it/heat',
  ].join('\n');
  const ratings = 'Date,Name,Year,Letterboxd URI,Rating\n2024-05-03,Moonlight,2016,https://boxd.it/moonlight,5';
  const reviews = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2024-07-02,Past Lives,2023,https://boxd.it/pastlives,4,,Saved review,,2024-07-01';
  configure({ importEventsEnabled: false, importAnnotationsEnabled: false });
  const document = prepareImportArchive('letterboxd', zipSync({
    'diary.csv': strToU8(diary),
    'watched.csv': strToU8(watched),
    'ratings.csv': strToU8(ratings),
    'reviews.csv': strToU8(reviews),
    'watchlist.csv': strToU8(fixture('watchlist')),
    'lists/software-history.csv': strToU8(fixture('custom-list')),
    'profile.csv': strToU8('not imported'),
    'comments.csv': strToU8('not imported'),
    'likes/films.csv': strToU8('not imported'),
  }));
  assert.equal(document.entries.length, 6);
  assert.ok(document.entries.every(row => !row.destination && !row.annotation));
  const parasite = document.entries.find(row => row.eventId === 'diary:https://boxd.it/parasite');
  assert.equal(parasite.date, '2024-03-01');
  assert.equal(parasite.rating, 9);
  assert.equal(parasite.note, null);
  const rewatch = document.entries.find(row => row.eventId === 'diary:https://boxd.it/parasite-rewatch');
  assert.equal(rewatch.date, '2024-06-01');
  assert.equal(rewatch.rating, 8);
  const dragon = document.entries.find(row => row.title === 'Goodbye, Dragon Inn');
  assert.equal(dragon.year, '2003');
  assert.equal(dragon.rating, 7);
  const moonlight = document.entries.find(row => row.eventId === 'diary:https://boxd.it/moonlight');
  assert.equal(moonlight.date, null);
  assert.equal(moonlight.rating, null);
  const heat = document.entries.find(row => row.eventId === 'watched:https://boxd.it/heat');
  assert.equal(heat.date, null);
  assert.equal(heat.rating, null);
  assert.equal(document.entries.filter(row => row.eventId === 'watched:https://boxd.it/parasite').length, 1);
  const leftOut = document.notImported.map(row => `${row.title}:${row.reason}`).sort();
  assert.deepEqual(leftOut, [
    'Software History:lists_unavailable',
    'Watchlist:lists_unavailable',
    'comments.csv:archive_file_unsupported',
    'likes/films.csv:archive_file_unsupported',
    'profile.csv:archive_file_unsupported',
    'ratings.csv:archive_file_unsupported',
    'reviews.csv:archive_file_unsupported',
  ]);
});
