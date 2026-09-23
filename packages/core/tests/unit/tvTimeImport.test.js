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
});
