import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifySearchResults,
  parseSearchQuery,
  rankSearchResults,
  hasStrongTitleMatch,
  normalizeTitle,
} from '../../search.js';

test('classifySearchResults keeps playable movie and tv results', () => {
  const result = classifySearchResults([
    { id: 1, media_type: 'movie', title: 'Inception', poster_path: '/x.jpg' },
    { id: 2, media_type: 'person', name: 'Christopher Nolan' },
  ]);

  assert.equal(result.emptyMode, 'none');
  assert.deepEqual(result.filtered.map(item => item.id), [1]);
});

test('classifySearchResults drops movie/tv results with no poster, name, or title', () => {
  const result = classifySearchResults([{ id: 1, media_type: 'movie' }]);
  assert.equal(result.emptyMode, 'generic');
  assert.deepEqual(result.filtered, []);
});

test('classifySearchResults shows title guidance when only person results remain', () => {
  const result = classifySearchResults([
    { id: 2, media_type: 'person', name: 'Christopher Nolan' },
  ]);

  assert.equal(result.emptyMode, 'title-guidance');
  assert.deepEqual(result.filtered, []);
});

test('classifySearchResults keeps the generic empty state for non-person misses', () => {
  const result = classifySearchResults([
    { id: 3, media_type: 'collection', name: 'Unknown Collection' },
  ]);

  assert.equal(result.emptyMode, 'generic');
  assert.deepEqual(result.filtered, []);
});

test('classifySearchResults defaults to an empty, generic result with no argument', () => {
  const result = classifySearchResults();
  assert.deepEqual(result, { filtered: [], emptyMode: 'generic' });
});

test('classifySearchResults treats non-array input as an empty list rather than throwing', () => {
  const result = classifySearchResults('not an array');
  assert.deepEqual(result, { filtered: [], emptyMode: 'generic' });
});

test('classifySearchResults accepts tv results with only a name, no poster_path', () => {
  const result = classifySearchResults([{ id: 4, media_type: 'tv', name: 'Breaking Bad' }]);
  assert.equal(result.emptyMode, 'none');
  assert.deepEqual(result.filtered, [{ id: 4, media_type: 'tv', name: 'Breaking Bad' }]);
});


/* ── parseSearchQuery ── */

test('parseSearchQuery reads a trailing media-type qualifier as intent', () => {
  assert.deepEqual(parseSearchQuery('7 up tv series'), {
    title: '7 up', mediaType: 'tv', year: null, rawQuery: '7 up tv series',
  });
  assert.deepEqual(parseSearchQuery('the office tv show'), {
    title: 'the office', mediaType: 'tv', year: null, rawQuery: 'the office tv show',
  });
  assert.deepEqual(parseSearchQuery('dune movie'), {
    title: 'dune', mediaType: 'movie', year: null, rawQuery: 'dune movie',
  });
  assert.deepEqual(parseSearchQuery('alien film'), {
    title: 'alien', mediaType: 'movie', year: null, rawQuery: 'alien film',
  });
});

test('parseSearchQuery reads an unambiguous leading qualifier, but not a bare one', () => {
  assert.equal(parseSearchQuery('tv series 7 up').title, '7 up');
  assert.equal(parseSearchQuery('tv series 7 up').mediaType, 'tv');
  // "Show Me a Hero" and "The Movie Critic" are titles, not intents.
  assert.equal(parseSearchQuery('show me a hero').title, 'show me a hero');
  assert.equal(parseSearchQuery('show me a hero').mediaType, null);
});

test('parseSearchQuery treats a season number as a series intent', () => {
  assert.deepEqual(parseSearchQuery('severance season 2'), {
    title: 'severance', mediaType: 'tv', year: null, rawQuery: 'severance season 2',
  });
});

test('parseSearchQuery peels stacked qualifiers in either order', () => {
  assert.equal(parseSearchQuery('the office tv series season 2').title, 'the office');
  assert.equal(parseSearchQuery('the office season 2 tv series').title, 'the office');
});

test('parseSearchQuery pulls a year out of the query', () => {
  assert.deepEqual(parseSearchQuery('the bear 2022'), {
    title: 'the bear', mediaType: null, year: 2022, rawQuery: 'the bear 2022',
  });
  assert.deepEqual(parseSearchQuery('Dune (2021)'), {
    title: 'Dune', mediaType: null, year: 2021, rawQuery: 'Dune (2021)',
  });
});

test('parseSearchQuery leaves a leading year alone — 2012 and 1917 are titles', () => {
  assert.deepEqual(parseSearchQuery('1917'), {
    title: '1917', mediaType: null, year: null, rawQuery: '1917',
  });
});

test('parseSearchQuery keeps a query that is nothing but a qualifier', () => {
  for (const query of ['the movie', 'movie', 'the series', 'a film']) {
    assert.deepEqual(parseSearchQuery(query), {
      title: query, mediaType: null, year: null, rawQuery: query,
    });
  }
});

test('parseSearchQuery normalises whitespace and survives empty input', () => {
  assert.equal(parseSearchQuery('  the   office  tv show ').title, 'the office');
  assert.deepEqual(parseSearchQuery(), { title: '', mediaType: null, year: null, rawQuery: '' });
});

/* ── normalizeTitle ── */

test('normalizeTitle folds case, accents, punctuation and ampersands', () => {
  assert.equal(normalizeTitle('WALL·E'), 'wall e');
  assert.equal(normalizeTitle('Law & Order'), 'law and order');
  assert.equal(normalizeTitle("Schitt's Creek"), 'schitts creek');
  assert.equal(normalizeTitle('Amélie'), 'amelie');
});

/* ── rankSearchResults ── */

test('rankSearchResults puts an exact title match above a more popular near-miss', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Office Movers', popularity: 500 },
    { id: 2, media_type: 'tv', name: 'The Office', popularity: 9 },
  ], { title: 'the office', rawQuery: 'the office tv show', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults falls back to popularity when nothing matches textually', () => {
  // "7 Up" is on TMDB as "The Up Series" — no title heuristic finds it, so
  // TMDB's own popularity has to be the tiebreak.
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'Wake Up 7', popularity: 0.49 },
    { id: 2, media_type: 'tv', name: 'The Up Series', popularity: 5.69 },
  ], { title: '7 up', rawQuery: '7 up tv series', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults prefers the asked-for media type', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'movie', title: 'Severance', popularity: 12 },
    { id: 2, media_type: 'tv', name: 'Severance', popularity: 8 },
  ], { title: 'severance', rawQuery: 'severance season 2', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults lets an exact raw-query match beat the type intent', () => {
  // "the truman show" parses as a tv intent, but the movie is what was meant.
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Eternal Christ - Truman G. Madsen', popularity: 0.7 },
    { id: 2, media_type: 'movie', title: 'The Truman Show', popularity: 0.4 },
  ], { title: 'the truman', rawQuery: 'the truman show', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults boosts a matching year and demotes a mismatched one', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Bear', first_air_date: '2010-01-01', popularity: 90 },
    { id: 2, media_type: 'tv', name: 'The Bear', first_air_date: '2022-06-23', popularity: 3 },
  ], { title: 'the bear', rawQuery: 'the bear 2022', year: 2022 });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults matches on the original title too', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'movie', title: 'Filler', popularity: 40 },
    { id: 2, media_type: 'movie', title: 'Spirited Away', original_title: 'Sen to Chihiro', popularity: 1 },
  ], { title: 'sen to chihiro', rawQuery: 'sen to chihiro' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults returns a new array and tolerates junk input', () => {
  const input = [{ id: 1, media_type: 'movie', title: 'A' }];
  assert.notEqual(rankSearchResults(input, { title: 'a' }), input);
  assert.deepEqual(rankSearchResults(undefined), []);
  assert.deepEqual(rankSearchResults('not an array', { title: 'a' }), []);
});

/* ── hasStrongTitleMatch ── */

test('hasStrongTitleMatch only counts an exact or starts-with match', () => {
  assert.equal(hasStrongTitleMatch([{ name: 'The Office' }], 'the office'), true);
  assert.equal(hasStrongTitleMatch([{ name: 'The Office Movers' }], 'the office'), true);
  // Contains the words, but does not lead with them.
  assert.equal(hasStrongTitleMatch([{ name: 'Quiet in the Office' }], 'the office'), false);
  assert.equal(hasStrongTitleMatch([{ name: 'Glass House' }], 'the truman'), false);
  assert.equal(hasStrongTitleMatch([], 'the office'), false);
  assert.equal(hasStrongTitleMatch([{ name: 'The Office' }], ''), false);
});
