import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySearchResults, demotePlaceholderTitles, isPlaceholderTitle, matchLibrary, mergeSearchResults, parseSearchQuery, parseSearchScope, pickLeadingMatch, pushRecentSearch, rankSearchResults } from '../../src/utils/search.js';

test('classifySearchResults keeps playable movie and tv results', () => {
  const result = classifySearchResults([
    { id: 1, media_type: 'movie', title: 'Inception', poster_path: '/x.jpg' },
    { id: 2, media_type: 'person', name: 'Christopher Nolan' },
  ]);

  assert.equal(result.emptyMode, 'none');
  assert.deepEqual(result.filtered.map(item => item.id), [1]);
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

test('parseSearchQuery reads type and year intent out of a typed query', () => {
  assert.deepEqual(parseSearchQuery('7 up tv series'), {
    title: '7 up', mediaType: 'tv', year: null, rawQuery: '7 up tv series',
  });
  assert.deepEqual(parseSearchQuery('the bear 2022'), {
    title: 'the bear', mediaType: null, year: 2022, rawQuery: 'the bear 2022',
  });
});

test('rankSearchResults puts the exact title above a more popular near-miss', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Office Movers', popularity: 500 },
    { id: 2, media_type: 'tv', name: 'The Office', popularity: 9 },
  ], { title: 'the office', rawQuery: 'the office tv show', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('parseSearchScope reads the @ and / prefixes and leaves everything else alone', () => {
  assert.deepEqual(parseSearchScope('@sam'), { scope: 'friends', term: 'sam' });
  assert.deepEqual(parseSearchScope('/ damon'), { scope: 'people', term: 'damon' });
  assert.deepEqual(parseSearchScope('  dune 2021 '), { scope: 'all', term: 'dune 2021' });
  assert.deepEqual(parseSearchScope(''), { scope: 'all', term: '' });
  assert.deepEqual(parseSearchScope('@'), { scope: 'friends', term: '' });
});

const buckets = {
  collections: [{ id: 1, name: 'A Collection' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }],
  titles: Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, media_type: i % 2 ? 'tv' : 'movie', title: `T${i}` }))
    .concat([{ id: 999, media_type: 'person', name: 'Not a title' }]),
  people: [{ id: 7, name: 'Someone' }, { id: 8, name: 'Adult', adult: true }, { id: 9, name: 'Other' }],
  friends: [{ id: 'u1', username: 'one' }, { id: 'u2' }, { id: 'u3', username: 'three' }],
};

test('mergeSearchResults orders franchise, titles, people, friends and caps each bucket', () => {
  const items = mergeSearchResults(buckets);
  const kinds = items.map(i => i.kind);
  assert.deepEqual(kinds.slice(0, 2), ['collection', 'collection']);
  assert.equal(kinds.filter(k => k === 'title').length, 8);
  assert.deepEqual(kinds.slice(-4), ['person', 'person', 'friend', 'friend']);
  // Keys are unique across kinds even when TMDB ids collide.
  assert.equal(new Set(items.map(i => i.key)).size, items.length);
  // Non-title media and adult people are dropped; a friend without a username too.
  assert.ok(!items.some(i => i.data.id === 999));
  assert.ok(!items.some(i => i.data.name === 'Adult'));
  assert.ok(!items.some(i => i.data.id === 'u2'));
});

test('mergeSearchResults honours a scope and skips the caps for it', () => {
  const friends = mergeSearchResults({ ...buckets, friends: Array.from({ length: 6 }, (_, i) => ({ id: `u${i}`, username: `u${i}` })) }, { scope: 'friends' });
  assert.equal(friends.length, 6);
  assert.ok(friends.every(i => i.kind === 'friend'));
  const people = mergeSearchResults(buckets, { scope: 'people' });
  assert.deepEqual(people.map(i => i.data.id), [7, 9]);
});

test('demotePlaceholderTitles moves poster-less, dateless or unvoted stubs after real titles', () => {
  const real = { id: 1, poster_path: '/p.jpg', release_date: '2016-07-28', vote_count: 4000 };
  const stubNoDate = { id: 2, poster_path: null, release_date: '', vote_count: 40 };
  const stubFewVotes = { id: 3, poster_path: null, release_date: '2022-01-01', vote_count: 2 };
  const datedVoted = { id: 4, poster_path: null, release_date: '2022-01-01', vote_count: 20 };
  assert.deepEqual(demotePlaceholderTitles([stubNoDate, real, stubFewVotes, datedVoted]).map(r => r.id), [1, 4, 2, 3]);
  assert.equal(isPlaceholderTitle(datedVoted), false);
});

test('pickLeadingMatch lifts an exact person or friend only when no title answers the query', () => {
  const people = [{ id: 1, name: 'Greta Gerwig' }];
  const friends = [{ id: 'u1', username: 'gretag', display_name: 'Greta' }];
  assert.deepEqual(pickLeadingMatch({ titles: [{ title: 'Greta' }], people, friends }, 'greta gerwig'), { kind: 'person', data: people[0] });
  // A friend's exact username wins over a person.
  assert.deepEqual(pickLeadingMatch({ titles: [], people, friends }, 'gretag'), { kind: 'friend', data: friends[0] });
  // A title that answers the query keeps its place.
  assert.equal(pickLeadingMatch({ titles: [{ title: 'Dune', poster_path: '/d.jpg', release_date: '2021-10-22', vote_count: 12000 }], people: [{ id: 2, name: 'Dune' }] }, 'dune'), null);
  assert.equal(pickLeadingMatch({ titles: [], people, friends }, 'ger'), null);
  // An obscure title that happens to carry the name does not block the lift;
  // only a title people have actually rated does.
  const obscure = { title: 'Greta Gerwig', poster_path: '/g.jpg', release_date: '2024-01-01', vote_count: 3 };
  assert.deepEqual(pickLeadingMatch({ titles: [obscure], people, friends }, 'greta gerwig'), { kind: 'person', data: people[0] });
});

test('mergeSearchResults puts the leading match first, once, and skips excluded titles', () => {
  const items = mergeSearchResults({
    titles: [{ id: 5, media_type: 'movie', title: 'Frances Ha' }, { id: 6, media_type: 'movie', title: 'Barbie' }],
    people: [{ id: 1, name: 'Greta Gerwig' }, { id: 2, name: 'Greta Garbo' }],
  }, { term: 'greta gerwig', exclude: ['movie-6'] });
  assert.deepEqual(items.map(i => i.key), ['person-1', 'title-movie-5', 'person-2']);
});

test('matchLibrary finds the viewer’s own titles, one row per title, best match first', () => {
  const rows = [
    { tmdb_id: 1, media_type: 'tv', title: 'Severance', status: 'watching' },
    { tmdb_id: 2, media_type: 'movie', title: 'The Severed Sun', status: 'saved' },
    { tmdb_id: 1, media_type: 'tv', title: 'Severance', status: 'watched' },
    { tmdb_id: 3, media_type: 'movie', title: 'Dune', status: 'watched' },
  ];
  const items = matchLibrary('sever', rows);
  assert.deepEqual(items.map(i => i.key), ['library-tv-1', 'library-movie-2']);
  assert.equal(items[0].data.status, 'watching');
  assert.deepEqual(matchLibrary('s', rows), []);
});

test('pushRecentSearch dedupes case-insensitively, keeps the newest first and caps the list', () => {
  let recent = [];
  for (const term of ['Dune', 'severance', 'DUNE', 'bourne', 'the bear', 'alien', 'wicked']) recent = pushRecentSearch(recent, term);
  assert.deepEqual(recent, ['wicked', 'alien', 'the bear', 'bourne', 'DUNE']);
  assert.deepEqual(pushRecentSearch(['dune'], ' d '), ['dune']);
});
