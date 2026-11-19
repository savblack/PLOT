import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { configure } from '../../config.js';
import { parseTmdbAccount, tmdbRatingToPlot } from '../../tmdbAccountImport.js';
import { parseImportDocument } from '../../importDocument.js';
import { buildImportRows, resolveImportEntries } from '../../importPipeline.js';
import { buildWatchEvent } from '../../importEvents.js';

const text = readFileSync(new URL('../fixtures/imports/tmdb-account.json', import.meta.url), 'utf8');
const movie = JSON.parse(readFileSync(new URL('../fixtures/imports/imdb-movie-match.json', import.meta.url), 'utf8')).movie;
const series = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-series.json', import.meta.url), 'utf8')).result;

test('a TMDB account becomes watchlist, list, watched-movie and rating entries', () => {
  const { entries, warnings, notImported } = parseTmdbAccount(text);
  assert.equal(entries.length, 5);
  const [watchlist, listItem, ratedMovie, ratedShow, ratedEpisode] = entries;

  assert.deepEqual(watchlist.destination, { kind: 'watchlist', key: 'tmdb:watchlist', name: 'Watchlist' });
  assert.deepEqual(watchlist.tmdbRef, { id: series.id, mediaType: 'tv' });

  assert.deepEqual(listItem.destination, { kind: 'custom', key: 'tmdb:list:test-list', name: 'Antonioni' });

  // A rated movie is a watch with no date; its rating stays exact.
  assert.equal(ratedMovie.annotation, undefined);
  assert.equal(ratedMovie.destination, undefined);
  assert.equal(ratedMovie.date, null);
  assert.equal(ratedMovie.rating, 7.5);

  // Show and episode ratings are annotations: whole Plot rating, exact score kept.
  assert.equal(ratedShow.annotationScope, 'show');
  assert.deepEqual(ratedShow.annotation, { kind: 'rating', rating: 9, ratedAt: null, sourceRating: 9 });
  assert.equal(ratedEpisode.annotationScope, 'episode');
  assert.equal(ratedEpisode.seasonNumber, 1);
  assert.equal(ratedEpisode.episodeNumber, 2);
  assert.deepEqual(ratedEpisode.annotation, { kind: 'rating', rating: 9, ratedAt: null, sourceRating: 8.5 });

  // Every record has a stable identity so a re-import adds nothing twice.
  assert.equal(new Set(entries.map(e => e.eventId)).size, entries.length);
  assert.deepEqual(warnings.map(w => [w.reason, w.count]), [['tmdb_rated_movies_watched', 1], ['tmdb_ratings_rounded', 2]]);
  assert.deepEqual(notImported, []);
});

test('TMDB scores round to the nearest whole point, within 1-10', () => {
  assert.equal(tmdbRatingToPlot(7.5), 8);
  assert.equal(tmdbRatingToPlot(7), 7);
  assert.equal(tmdbRatingToPlot(0.5), 1);
  assert.equal(tmdbRatingToPlot(10), 10);
});

test('anything that is not the tmdb-account shape is refused', () => {
  for (const bad of ['', 'not json', '[]', '{"format":"other"}',
    text.replace('"version": 1', '"version": 2'),
    text.replace('"rating": 7.5', '"rating": 11'),
    text.replace('"media_type": "movie", "title": "Red Desert", "year": "1964", "rating"', '"media_type": "person", "title": "Red Desert", "year": "1964", "rating"'),
    text.replace('"id": "test-list"', '"id": "../x"'),
  ]) assert.throws(() => parseTmdbAccount(bad), /TMDB account import/, bad.slice(0, 40));
});

test('a build without list or annotation import leaves those out and says so', () => {
  try {
    configure({ importEventsEnabled: false, importAnnotationsEnabled: false });
    const document = parseImportDocument('tmdb', text);
    assert.equal(document.entries.length, 1);
    assert.equal(document.entries[0].rating, 7.5);
    assert.deepEqual(document.notImported.map(n => [n.reason, n.count]), [['tmdb_lists_unavailable', 2], ['tmdb_show_ratings_unavailable', 2]]);
  } finally {
    configure({ importEventsEnabled: false, importAnnotationsEnabled: false });
  }
});

test('TMDB entries match by ID, with title and poster from TMDB, not the file', async () => {
  configure({ importEventsEnabled: true, importAnnotationsEnabled: true });
  try {
    const { entries } = parseTmdbAccount(text.replaceAll('"Red Desert"', '"Edited in the file"'));
    let searches = 0;
    const looked = [];
    const resolved = await resolveImportEntries(entries, {
      search: () => { searches++; return Promise.resolve({ results: [] }); },
      getTitle: (mediaType, id) => {
        looked.push(`${mediaType}:${id}`);
        const item = mediaType === 'movie' && id === movie.id ? { id, title: movie.title, release_date: movie.release_date, poster_path: '/p.jpg', genres: [{ id: 18 }] }
          : mediaType === 'tv' && id === series.id ? { id, name: series.name, first_air_date: series.first_air_date, poster_path: null, genres: [] }
          : null;
        return Promise.resolve(item);
      },
    });
    assert.equal(searches, 0);
    // One lookup per distinct title, however many records name it.
    assert.deepEqual(looked.sort(), [`movie:${movie.id}`, `tv:${series.id}`]);
    assert.ok(resolved.every(r => r.status === 'matched'));
    const ratedMovie = resolved[2];
    assert.equal(ratedMovie.tmdbTitle, movie.title);
    assert.equal(ratedMovie.posterPath, '/p.jpg');
    assert.deepEqual(ratedMovie.genreIds, [18]);

    // History gets Plot's whole rating; the watch event keeps TMDB's exact score.
    const [{ row }] = buildImportRows({ userId: 'u', resolved: [ratedMovie] });
    assert.equal(row.rating, 8);
    assert.equal(row.watched_at, null);
    const event = buildWatchEvent({ ...ratedMovie, source: 'tmdb', account: 'saved-export' }, 'u');
    assert.equal(event.source_rating, 7.5);
    assert.equal(event.date_precision, 'unknown');
  } finally {
    configure({ importEventsEnabled: false, importAnnotationsEnabled: false });
  }
});

test('a TMDB title that no longer exists is left out, not guessed', async () => {
  const { entries } = parseTmdbAccount(text);
  const [entry] = await resolveImportEntries([entries[2]], {
    search: () => Promise.reject(new Error('should not search')),
    getTitle: () => Promise.resolve({ success: false }),
  });
  assert.equal(entry.status, 'unmatched');
  assert.equal(entry.reason, 'not_found');
});

test('a brief TMDB error on an exact ID is tried once more', async () => {
  const { entries } = parseTmdbAccount(text);
  let calls = 0;
  const [entry] = await resolveImportEntries([entries[2]], {
    search: () => Promise.reject(new Error('should not search')),
    getTitle: (mediaType, id) => (++calls === 1 ? Promise.reject(new Error('TMDB 503'))
      : Promise.resolve({ id, title: movie.title, release_date: movie.release_date, poster_path: null, genres: [] })),
  });
  assert.equal(calls, 2);
  assert.equal(entry.status, 'matched');
  assert.equal(entry.tmdbTitle, movie.title);
});
