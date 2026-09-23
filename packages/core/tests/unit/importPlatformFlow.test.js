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
