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

test('unsupported IMDb files and mixed title types fail explicitly before writing', () => {
  assert.throws(() => parsePlatform('imdb', 'Title,Rating\nExample,5'), /Unsupported IMDb export/);
  assert.throws(() => parsePlatform('imdb', fixture.replace(',Movie,', ',TV Episode,')), /unsupported ratings/);
  assert.throws(() => parsePlatform('imdb', fixture.replace('tt0058003', 'not-an-id')), /invalid/);
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
  assert.throws(() => parseImportDocument('imdb', text.replaceAll('2024-01-15', '2024-02-30')), /rating date is invalid/);
  configure({ importAnnotationsEnabled: false });
  assert.throws(() => parseImportDocument('imdb', text), /available/);
  configure({ importAnnotationsEnabled: true });
});
