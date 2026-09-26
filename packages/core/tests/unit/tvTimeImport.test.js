import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTvTimeDocument } from '../../tvTimeImport.js';
import { identifyImportEntries, buildWatchEvent } from '../../importEvents.js';
import { resolveImportEntries } from '../../importPipeline.js';
import source from '../fixtures/imports/trakt-history.json' with { type: 'json' };
import matches from '../fixtures/imports/tmdb-trakt-matches.json' with { type: 'json' };

// Synthetic transport cases using externally sourced identities, not a claim
// that these are untouched TV Time account exports.
const episode = () => ({ id: { ...source[0].episode.ids }, number: source[0].episode.number, is_watched: true, watched_at: null, rating: 8 });
const show = () => ({ title: source[0].show.title, id: { ...source[0].show.ids }, seasons: [{ number: source[0].episode.season, episodes: [episode()] }] });
const movie = () => ({ title: source[1].movie.title, id: { ...source[1].movie.ids }, is_watched: true, watched_at: null, rating: 7 });
const parse = (rows, name = 'shows.json') => parseTvTimeDocument(JSON.stringify(rows), name);

test('TV Time episode snapshots preserve identity, rating and unknown watch dates through resolution', async () => {
  const doc = parse([show()]);
  assert.deepEqual(doc.notImported, []);
  const entries = identifyImportEntries(doc.entries, 'tvtime', JSON.stringify([show()]));
  const resolved = await resolveImportEntries(entries, { search: async () => assert.fail('Expected identifier lookup'), findByImdbId: async id => matches.results[id] });
  const event = buildWatchEvent(resolved[0], 'owner');
  assert.equal(event.tmdb_id, matches.results[source[0].show.ids.imdb].tv_results[0].id);
  assert.equal(event.season_number, source[0].episode.season);
  assert.equal(event.episode_number, source[0].episode.number);
  assert.equal(event.source_rating, 8);
  assert.equal(event.watched_at, null);
  assert.equal(event.watched_on, null);
  assert.equal(event.date_precision, 'unknown');
  assert.equal(event.external_ids.episode.tvdb, source[0].episode.ids.tvdb);
});

test('TV Time keeps timezone-free dates as days and reports counts without inventing rewatch events', () => {
  const doc = parse([{ ...movie(), watched_at: '2024-02-29 12:30:15.123456', rewatch_count: 3 }], 'movies.json');
  assert.equal(doc.entries.length, 1);
  assert.equal(doc.entries[0].date, '2024-02-29');
  assert.equal(doc.entries[0].datePrecision, 'day');
  assert.equal(doc.entries[0].externalIds.rewatch_count, 3);
  assert.equal(doc.notImported[0].count, 3);
  assert.equal(doc.notImported[0].reason, 'aggregate_rewatches');
  assert.equal(doc.warnings[0].reason, 'timezone_unknown');
  const exact = parse([{ ...movie(), watched_at: '2024-02-29T12:30:15.123456Z' }], 'movies.json');
  assert.equal(exact.entries[0].date, '2024-02-29T12:30:15.123456Z');
  assert.equal(exact.entries[0].datePrecision, 'instant');
});

test('TV Time official episode CSV preserves each watch and its episode identity', () => {
  const csv = [
    'user_id,created_at,s_id,ep_id,key,updated_at,is_followed,series_name,season_number,episode_number',
    '10000001,2018-05-20 16:27:22,318201,6453863,watch-episode-example,2018-05-20 16:27:22,,Trollhunters: Tales of Arcadia,2,7',
    '10000001,2020-05-30 15:54:20,153021,4444269,rewatch-episode-example,2020-05-30 15:54:20,,The Walking Dead,3,10',
    '10000001,2021-02-12 16:56:12,348545,,user-series-example,2025-04-28 19:57:30,true,Demon Slayer: Kimetsu no Yaiba,,',
  ].join('\n');
  const doc = parseTvTimeDocument(csv, 'tracking-prod-records-v2.csv');
  assert.deepEqual(doc.entries, [
    { title: 'Trollhunters: Tales of Arcadia', hint: 'tv', date: '2018-05-20', datePrecision: 'day', seasonNumber: 2, episodeNumber: 7, year: null, externalIds: {}, eventId: 'watch-episode-example' },
    { title: 'The Walking Dead', hint: 'tv', date: '2020-05-30', datePrecision: 'day', seasonNumber: 3, episodeNumber: 10, year: null, externalIds: {}, eventId: 'rewatch-episode-example' },
  ]);
  assert.equal(doc.warnings.length, 2);
  assert.ok(doc.warnings.every(row => row.reason === 'timezone_unknown'));
});

test('TV Time official movie CSV imports watches and ignores watchlist rows', () => {
  const csv = [
    'type,updated_at,created_at,entity_type,release_date,movie_name,series_name,season_number,episode_number',
    'watch,2024-01-02 07:16:58,2024-01-02 07:16:58,movie,2015-10-28 00:00:00,The Lobster,,,',
    'towatch,2025-09-14 07:52:34,2025-09-14 07:52:34,movie,2024-11-07 00:00:00,Anora,,,',
    'watch,2019-01-01 10:00:00,2019-01-01 10:00:00,episode,,,Game of Thrones,1,1',
  ].join('\n');
  const doc = parseTvTimeDocument(csv, 'tracking-prod-records.csv');
  assert.deepEqual(doc.entries, [
    { title: 'The Lobster', hint: 'movie', date: '2024-01-02', datePrecision: 'day', year: '2015', externalIds: {} },
    { title: 'Game of Thrones', hint: 'tv', date: '2019-01-01', datePrecision: 'day', seasonNumber: 1, episodeNumber: 1, year: null, externalIds: {} },
  ]);
});

test('TV Time list files never turn nested watched episodes into watches', () => {
  const list = { name: 'Together', description: 'Weekend films', shows: [show()], movies: [movie()] };
  for (const name of ['lists.json', 'favorites.json']) {
    const doc = parse(name === 'lists.json' ? [list] : list, name);
    assert.equal(doc.entries.length, 2);
    assert.ok(doc.entries.every(row => row.destination?.kind === 'custom' && row.date === null));
    assert.ok(doc.entries.every(row => row.episodeNumber === undefined));
  }
  const empty = parse([{ ...list, shows: [], movies: [] }], 'lists.json');
  assert.equal(empty.notImported[0].reason, 'empty_list');
});

test('TV Time unwatched ratings and followed shows are reported without invented watches', () => {
  const doc = parse([{ ...movie(), is_watched: false }], 'movies.json');
  assert.equal(doc.entries.length, 0);
  assert.equal(doc.notImported[0].reason, 'unwatched_rating');
  const unwatched = show();
  unwatched.seasons[0].episodes[0].is_watched = false;
  const shows = parse([unwatched]);
  assert.equal(shows.entries.length, 0);
  assert.equal(shows.warnings[0].reason, 'followed_show_without_watches');
});

test('TV Time rejects malformed rows and unsupported filenames before any import', () => {
  for (const change of [{ watched_at: '2024-02-30' }, { watched_at: '2024-01-01 25:00:00' }, { watched_at: 'yesterday' }, { is_watched: 'true' }, { rewatch_count: -1 }, { rating: 11 }, { id: {} }]) {
    assert.throws(() => parse([movie(), { ...movie(), ...change }], 'movies.json'), /Unsupported TV Time/);
  }
  assert.throws(() => parse([show()], 'export.json'), /Unsupported TV Time/);
  assert.throws(() => parseTvTimeDocument('not JSON', 'shows.json'), /Unsupported TV Time/);
  const malformed = show();
  malformed.seasons[0].episodes[0].number = 0;
  assert.throws(() => parse([malformed]), /Unsupported TV Time/);
  assert.throws(() => parseTvTimeDocument('series_name,key,created_at,season_number,episode_number\nExample,watch-episode-id,2024-01-01,1,1', 'renamed.csv'), /Unsupported TV Time/);
  assert.throws(() => parseTvTimeDocument('series_name,key,created_at,season_number,episode_number\nExample,watch-episode-id,2024-01-01,1,0', 'tracking-prod-records-v2.csv'), /Unsupported TV Time/);
});
