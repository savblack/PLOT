import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configure } from '../../config.js';
import { parsePlatform } from '../../importParsing.js';
import { identifyImportEntries } from '../../importEvents.js';
import { resolveImportEntries, writeImportSelection } from '../../importPipeline.js';

const matches = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-trakt-matches.json', import.meta.url))).results;
const movie = Object.values(matches).flatMap(value => value.movie_results)[0];
const series = Object.values(matches).flatMap(value => value.tv_results)[0];
// Synthetic transport cases using verified catalogue metadata. These prove
// shared pipeline behaviour, not authenticity of provider export schemas.
const movieCases = {
  netflix: `Title,Date\n${movie.title},`,
  prime: `Title,Date Watched\n${movie.title},`,
  disney: JSON.stringify([{ title: movie.title }]),
  max: JSON.stringify([{ title: movie.title }]),
  apple: JSON.stringify([{ Item_Description: movie.title }]),
  letterboxd: `Date,Name,Year,Letterboxd URI,Watched Date\n2026-09-17,${movie.title},${movie.release_date.slice(0,4)},,`,
};

for (const [source, text] of Object.entries(movieCases)) {
  test(`${source}: shared parse, resolve and write keep unknown watch dates unknown`, async () => {
    const written = [];
    configure({ importEventsEnabled: true, supabaseClient: { rpc: async (_name, args) => {
      written.push(...args.p_records); return { data: { inserted: args.p_records.length, duplicates: 0 } };
    } } });
    const identified = identifyImportEntries(parsePlatform(source, text), source, text);
    const resolved = await resolveImportEntries(identified, { search: async () => ({ results: [{ ...movie, media_type: 'movie' }] }) });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].status, 'matched');
    const result = await writeImportSelection({ userId: 'owner', resolved, summaryRows: [] });
    assert.equal(result.inserted, 1);
    assert.equal(written[0].event.watched_at, null);
    assert.equal(written[0].event.watched_on, null);
    assert.equal(written[0].event.date_precision, 'unknown');
    assert.equal(written[0].event.source, source);
  });
}

for (const source of ['netflix', 'prime', 'disney', 'max', 'apple']) {
  test(`${source}: unresolved episode identity never becomes a whole-series watch`, async () => {
    configure({ importEventsEnabled: true, supabaseClient: { rpc: async () => { throw new Error('No episode should be written'); } } });
    const entries = identifyImportEntries([{ title: series.name, hint: 'tv', date: null }], source, 'synthetic ordinal-free record');
    const resolved = await resolveImportEntries(entries, { search: async () => ({ results: [{ ...series, media_type: 'tv' }] }) });
    assert.equal(resolved[0].status, 'unmatched');
    assert.equal(resolved[0].reason, 'episode_identity_required');
    assert.deepEqual(await writeImportSelection({ userId: 'owner', resolved, summaryRows: [] }), { inserted: 0, failed: 0, duplicates: 0 });
  });
}

test('TVDB identity resolves the series before title search and never selects an episode ID as a series', async () => {
  const captured = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-tvdb-match.json', import.meta.url)));
  configure({ importEventsEnabled: true });
  const resolved = await resolveImportEntries([{
    title: 'A different export display title', hint: 'tv', externalIds: { tvdb: captured.externalId },
    seasonNumber: 2, episodeNumber: 13,
  }], {
    search: async () => { throw new Error('Should not search'); },
    findByTvdbId: async id => { assert.equal(id, captured.externalId); return captured.response; },
  });
  assert.equal(resolved[0].status, 'matched');
  assert.equal(resolved[0].tmdbId, captured.response.tv_results[0].id);
  assert.equal(resolved[0].episodeNumber, 13);
});

test('TV Time movies without IMDb identity use movie search, never a TVDB television match', async () => {
  const captured = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-tvdb-match.json', import.meta.url)));
  const resolved = await resolveImportEntries([{
    title: movie.title, hint: 'movie', source: 'tvtime', externalIds: { tvdb: captured.externalId },
  }], {
    findByTvdbId: async () => assert.fail('TVDB movie identifiers are not supported by TMDB find'),
    search: async title => { assert.equal(title, movie.title); return { results: [{ ...movie, media_type: 'movie' }] }; },
  });
  assert.equal(resolved[0].status, 'unmatched');
  assert.equal(resolved[0].reason, 'review');
  assert.equal(resolved[0].candidates[0].id, movie.id);
});

test('large repeated-title exports reuse lookups without a network pause per cached batch', { timeout: 5000 }, async () => {
  let calls = 0;
  const rows = Array.from({ length: 2000 }, (_, index) => ({ title: movie.title, hint: 'movie', eventId: index }));
  const resolved = await resolveImportEntries(rows, { search: async () => { calls++; return { results: [{ ...movie, media_type: 'movie' }] }; } });
  assert.equal(calls, 1);
  assert.equal(resolved.length, rows.length);
  assert.equal(resolved.at(-1).eventId, 1999);
  assert.ok(resolved.every(row => row.status === 'matched'));
});

test('Netflix episode names resolve only within the matched season, preserving rewatches', async () => {
  const show = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-series.json', import.meta.url))).result;
  const season = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-season-two.json', import.meta.url)));
  const { chooseImportMatch } = await import('../../importPipeline.js');
  const csv = `Title,Date\n"${show.name}: Season 2: ${season.episodes[0].name}",26/08/24\n"${show.name}: Season 2: ${season.episodes[0].name}",27/08/24`;
  const rows = identifyImportEntries(parsePlatform('netflix', csv), 'netflix', csv);
  configure({ importEventsEnabled: true });
  let requests = 0;
  const deps = { search: async () => ({ results: [show] }), getSeason: async (id, number) => {
    assert.equal(id, show.id); assert.equal(number, 2); requests++; return season;
  } };
  const resolved = await resolveImportEntries(rows, deps);
  assert.equal(requests, 1, 'One request per season, not one request per episode');
  assert.ok(resolved.every(row => row.status === 'matched' && row.episodeNumber === 1 && row.seasonNumber === 2));
  assert.notEqual(resolved[0].date, resolved[1].date);
  const changed = chooseImportMatch({ ...resolved[0], candidates: [{ ...series, media_type: 'tv' }] }, `tv:${series.id}`);
  assert.equal(changed.status, 'unmatched', 'An ordinal cannot be reused for a different series');
  const unavailable = await resolveImportEntries(rows, { ...deps, getSeason: async () => ({ episodes: [] }) });
  assert.ok(unavailable.every(row => row.status === 'unmatched' && row.reason === 'episode_identity_required'));
  const ambiguous = await resolveImportEntries(rows, { ...deps, getSeason: async () => ({ episodes: [season.episodes[0], season.episodes[0]] }) });
  assert.ok(ambiguous.every(row => row.status === 'unmatched'));
  const failed = await resolveImportEntries(rows, { ...deps, getSeason: async () => { throw Error('offline'); } });
  assert.ok(failed.every(row => row.status === 'unmatched' && row.reason === 'search_failed'));
});

test('manual Netflix series choices verify episode identity and permit retry after failure', async () => {
  const { resolveImportMatch } = await import('../../importPipeline.js');
  const show = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-series.json', import.meta.url))).result;
  const season = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-season-two.json', import.meta.url)));
  configure({ importEventsEnabled: true });
  const entry = { source: 'netflix', account: 'test', eventId: 'manual-choice', title: show.name, seasonNumber: 2, episodeTitle: season.episodes[0].name, candidates: [show], knownEvents: [] };
  const key = `tv:${show.id}`;
  const failed = await resolveImportMatch(entry, key, { getSeason: async () => { throw Error('offline'); } });
  assert.equal(failed.status, 'unmatched');
  assert.equal(failed.reason, 'search_failed');
  assert.deepEqual(failed.candidates, [show]);
  const resolved = await resolveImportMatch(failed, key, { getSeason: async (id, number) => {
    assert.equal(id, show.id); assert.equal(number, 2); return season;
  } });
  assert.equal(resolved.status, 'matched');
  assert.equal(resolved.reason, 'review');
  assert.equal(resolved.episodeNumber, 1);
  const missing = await resolveImportMatch(resolved, key, { getSeason: async () => ({ episodes: [] }) });
  assert.equal(missing.status, 'unmatched');
  assert.equal(missing.episodeNumber, undefined, 'A previous ordinal cannot survive an unverified lookup');
  const skipped = await resolveImportMatch(resolved, '', { getSeason: async () => { throw Error('must not call'); } });
  assert.equal(skipped.status, 'unmatched');
});

test('native Prime playback requires manual watch review and retains UTC start precision', async () => {
  const { prepareImportFiles, importReportMessages } = await import('../../importDocument.js');
  const text = readFileSync(new URL('../fixtures/imports/prime-viewing-history.csv', import.meta.url), 'utf8');
  const matches = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-prime-search-matches.json', import.meta.url)));
  const document = prepareImportFiles('prime', [{ name: 'PrimeVideo.ViewingHistory.csv', text }]);
  assert.equal(document.entries.length, 2);
  assert.equal(document.entries[0].title, 'Palm Springs');
  assert.equal(document.entries[0].date, '2024-01-15T12:00:00Z');
  assert.equal(document.entries[0].datePrecision, 'instant');
  assert.match(importReportMessages(document)[0], /partial plays/);
  const resolved = await resolveImportEntries(document.entries, { search: async title => matches.results[title] });
  assert.ok(resolved.every(row => row.status === 'unmatched' && row.candidates.length));
  const { chooseImportMatch } = await import('../../importPipeline.js');
  const match = resolved[0].candidates.find(row => row.title === 'Palm Springs' && row.media_type === 'movie');
  assert.ok(match);
  const chosen = chooseImportMatch(resolved[0], `movie:${match.id}`);
  assert.equal(chosen.status, 'matched');
  assert.equal(chosen.date, '2024-01-15T12:00:00Z');
  const invalid = prepareImportFiles('prime', [{ name: 'PrimeVideo.ViewingHistory.csv', text: text.replace('2024-01-15 12:00:00', '2024-02-30 12:00:00') }]);
  assert.equal(invalid.entries[0].date, null);
  assert.equal(invalid.entries[0].datePrecision, 'unknown');
});
