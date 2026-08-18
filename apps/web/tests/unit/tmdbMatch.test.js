import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTitle, yearFrom, tmdbIdFromGuid, tmdbIdFromGuids, selectTmdbMatch,
} from '../../../../supabase/functions/_shared/tmdbMatch.js';

// The behaviour being locked down: Plex sync used to end with `candidates[0]`,
// TMDB's most popular hit for the name. A generic title with no year therefore
// wrote a confident, wrong tmdb_id into the watchlist and history. Nothing here
// may return a title the entry did not name.

const MATRIX = { id: 603, media_type: 'movie', title: 'The Matrix', release_date: '1999-03-31' };
const MATRIX_DOC = { id: 84291, media_type: 'movie', title: 'The Matrix Revisited', release_date: '2001-11-06' };
const GHOSTS_UK = { id: 85422, media_type: 'tv', name: 'Ghosts', first_air_date: '2019-04-15' };
const GHOSTS_US = { id: 115265, media_type: 'tv', name: 'Ghosts', first_air_date: '2021-10-07' };

test('normalizeTitle folds case, accents, punctuation and a leading article', () => {
  assert.equal(normalizeTitle('The Matrix'), 'matrix');
  assert.equal(normalizeTitle('Amélie'), 'amelie');
  assert.equal(normalizeTitle('Spider-Man: No Way Home'), 'spider man no way home');
  assert.equal(normalizeTitle('  A  Ghost   Story '), 'ghost story');
  assert.equal(normalizeTitle(undefined), '');
});

test('normalizeTitle does not conflate a title with a longer one', () => {
  assert.notEqual(normalizeTitle('Alone'), normalizeTitle('Alone Together'));
});

test('yearFrom reads the year out of either date shape', () => {
  assert.equal(yearFrom('1999-03-31'), 1999);
  assert.equal(yearFrom(2016), 2016);
  assert.equal(yearFrom(''), null);
  assert.equal(yearFrom(null), null);
});

test('tmdbIdFromGuid reads legacy and current Plex guid forms', () => {
  assert.equal(tmdbIdFromGuid('com.plexapp.agents.themoviedb://603?lang=en'), 603);
  assert.equal(tmdbIdFromGuid('tmdb://603'), 603);
  assert.equal(tmdbIdFromGuid('imdb://tt0133093'), null, 'imdb ids are not TMDB ids');
  assert.equal(tmdbIdFromGuid('plex://movie/5d7768ba96b655001fdc0409'), null);
  assert.equal(tmdbIdFromGuid(undefined), null);
});

test('tmdbIdFromGuids takes the TMDB id out of a mixed guid list', () => {
  assert.equal(tmdbIdFromGuids(['imdb://tt0133093', 'tmdb://603', 'tvdb://12345']), 603);
  assert.equal(tmdbIdFromGuids(['imdb://tt0133093', 'tvdb://12345']), null);
  assert.equal(tmdbIdFromGuids([]), null);
  assert.equal(tmdbIdFromGuids(undefined), null);
});

test('an exact title and year is a match', () => {
  const match = selectTmdbMatch([MATRIX_DOC, MATRIX], { title: 'The Matrix', media_type: 'movie', year: 1999 });
  assert.equal(match?.id, 603);
});

test('the popular near-miss is never returned just for being first', () => {
  // This is the old bug verbatim: only "The Matrix Revisited" comes back, and it
  // is not what Plex named.
  assert.equal(selectTmdbMatch([MATRIX_DOC], { title: 'The Matrix', media_type: 'movie', year: 1999 }), null);
  assert.equal(selectTmdbMatch([MATRIX_DOC], { title: 'The Matrix', media_type: 'movie' }), null);
});

test('two shows of the same name and no year is not a match', () => {
  assert.equal(selectTmdbMatch([GHOSTS_UK, GHOSTS_US], { title: 'Ghosts', media_type: 'tv' }), null);
});

test('a year separates two shows of the same name', () => {
  assert.equal(selectTmdbMatch([GHOSTS_UK, GHOSTS_US], { title: 'Ghosts', media_type: 'tv', year: 2021 })?.id, 115265);
  assert.equal(selectTmdbMatch([GHOSTS_UK, GHOSTS_US], { title: 'Ghosts', media_type: 'tv', year: 2019 })?.id, 85422);
});

test('a single same-title result matches with no year to check', () => {
  assert.equal(selectTmdbMatch([GHOSTS_UK], { title: 'Ghosts', media_type: 'tv' })?.id, 85422);
});

test('a year off by one still matches when only one candidate is close', () => {
  // 2018 is within a year of the 2019 UK show and nothing else.
  assert.equal(selectTmdbMatch([GHOSTS_UK, GHOSTS_US], { title: 'Ghosts', media_type: 'tv', year: 2018 })?.id, 85422);
});

test('a year equally close to two same-title candidates matches neither', () => {
  // 2020 sits one year from both the 2019 UK show and the 2021 US one.
  assert.equal(selectTmdbMatch([GHOSTS_UK, GHOSTS_US], { title: 'Ghosts', media_type: 'tv', year: 2020 }), null);
});

test('a lone exact-title candidate survives a wrong Plex year', () => {
  // Plex year metadata is user-editable and often wrong. With one exact-title
  // candidate there is nothing to confuse it with, so the title decides.
  assert.equal(selectTmdbMatch([MATRIX], { title: 'The Matrix', media_type: 'movie', year: 2015 })?.id, 603);
});

test('among several same-title candidates, a distant year matches none', () => {
  assert.equal(selectTmdbMatch([GHOSTS_UK, GHOSTS_US], { title: 'Ghosts', media_type: 'tv', year: 1995 }), null);
});

test('the wanted media type is respected', () => {
  assert.equal(selectTmdbMatch([GHOSTS_UK], { title: 'Ghosts', media_type: 'movie' }), null);
  // person results and anything else TMDB returns from /search/multi
  assert.equal(selectTmdbMatch([{ id: 1, media_type: 'person', name: 'Ghosts' }], { title: 'Ghosts' }), null);
});

test('an entry with no usable title is never matched', () => {
  assert.equal(selectTmdbMatch([MATRIX], { title: '', media_type: 'movie' }), null);
  assert.equal(selectTmdbMatch([MATRIX], {}), null);
});

test('empty or missing results are handled', () => {
  assert.equal(selectTmdbMatch([], { title: 'The Matrix' }), null);
  assert.equal(selectTmdbMatch(undefined, { title: 'The Matrix' }), null);
});
