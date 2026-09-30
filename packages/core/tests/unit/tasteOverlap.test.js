import assert from 'node:assert/strict';
import test from 'node:test';

import {
  byTitle, matchPercent, favouriteDecade, genreSplit, sharedTopGenreId, tasteOverlap,
  MIN_SHARED_RATINGS, canCompare, canNameOnShareCard, shareCardContent, SHARE_CARD_THEMES,
} from '../../tasteOverlap.js';

// Synthetic ids: these rows never reach TMDB, they only need to be distinct.
const row = (id, extra = {}) => ({
  tmdb_id: id, media_type: 'movie', title: `Title ${id}`, poster_path: null,
  rating: null, genre_ids: [], release_date: null, ...extra,
});

test('byTitle keeps one row per title and prefers a rated one', () => {
  const m = byTitle([row(1), row(1, { rating: 8 }), row(1, { rating: 4 }), row(1, { media_type: 'tv' })]);
  assert.equal(m.size, 2);
  assert.equal(m.get('movie:1').rating, 8);
});

test('matchPercent needs enough shared ratings, then scales the mean gap', () => {
  const same = Array.from({ length: MIN_SHARED_RATINGS }, () => ({ mine: 7, theirs: 7 }));
  assert.equal(matchPercent(same.slice(1)), null);
  assert.equal(matchPercent(same), 100);
  const opposite = Array.from({ length: MIN_SHARED_RATINGS }, () => ({ mine: 1, theirs: 10 }));
  assert.equal(matchPercent(opposite), 0);
  // Mean gap of 2 on a 9-point range.
  const close = Array.from({ length: MIN_SHARED_RATINGS }, () => ({ mine: 8, theirs: 6 }));
  assert.equal(matchPercent(close), 78);
});

test('favouriteDecade counts release years and breaks ties towards recent', () => {
  assert.equal(favouriteDecade([row(1, { release_date: '1994-01-01' }), row(2, { release_date: '1999-05-02' }), row(3, { release_date: '2015-01-01' })]), 1990);
  assert.equal(favouriteDecade([row(1, { release_date: '1994-01-01' }), row(2, { release_date: '2015-01-01' })]), 2010);
  assert.equal(favouriteDecade([row(1)]), null);
});

test('genreSplit gives each person their own share, top by combined', () => {
  const mine = [row(1, { genre_ids: [18] }), row(2, { genre_ids: [18, 35] })];
  const theirs = [row(3, { genre_ids: [27] }), row(4, { genre_ids: [35] }), row(5, { genre_ids: [35] }), row(6, { genre_ids: [18] })];
  const split = genreSplit(mine, theirs);
  assert.deepEqual(split[0], { id: 18, mine: 100, theirs: 25 });
  assert.deepEqual(split.find(g => g.id === 35), { id: 35, mine: 50, theirs: 50 });
  assert.equal(sharedTopGenreId(split), 35);
  assert.deepEqual(genreSplit([], []), []);
});

test('tasteOverlap puts it together', () => {
  const mine = [
    row(1, { rating: 10 }), row(2, { rating: 9 }), row(3, { rating: 10 }), row(4, { rating: 2 }),
    row(5, { rating: 6 }), row(6), row(7, { rating: 8 }),
  ];
  const theirs = [
    row(1, { rating: 10 }), row(2, { rating: 8 }), row(3, { rating: 4 }), row(4, { rating: 9 }),
    row(5, { rating: 6 }), row(6, { rating: 7 }), row(8, { rating: 3 }),
  ];
  const o = tasteOverlap(mine, theirs);
  assert.deepEqual(o.watched, { mine: 7, theirs: 7, both: 6 });
  assert.equal(o.sharedRated, 5);          // title 6 is unrated on my side
  assert.equal(o.match, Math.round(100 * (1 - (0 + 1 + 6 + 7 + 0) / 5 / 9)));
  assert.deepEqual(o.loved.map(t => t.tmdb_id), [1, 2]);
  assert.deepEqual(o.disagree.map(t => [t.tmdb_id, t.mine, t.theirs]), [[4, 2, 9], [3, 10, 4]]);
  assert.equal(o.critic.tougher, 'theirs');
});

test('tasteOverlap with nothing in common is empty, not broken', () => {
  const o = tasteOverlap([row(1, { rating: 6 })], []);
  assert.deepEqual(o.watched, { mine: 1, theirs: 0, both: 0 });
  assert.equal(o.match, null);
  assert.deepEqual(o.loved, []);
  assert.equal(o.critic.tougher, null);
  assert.equal(o.decades.theirs, null);
});

test('canCompare follows the same visibility as the RPC', () => {
  assert.equal(canCompare({ is_public: true }), true);
  assert.equal(canCompare({ is_public: false, follow_status: 'accepted' }), true);
  assert.equal(canCompare({ is_public: false, follow_status: 'pending' }), false);
  assert.equal(canCompare({ is_public: false }), false);
});

test('the share card only names people with public profiles', () => {
  const overlap = tasteOverlap([row(1, { rating: 8 })], [row(1, { rating: 8 })]);
  assert.equal(canNameOnShareCard({ is_public: false }), false);
  assert.equal(shareCardContent(overlap, { display_name: 'Sam', is_public: false }, { showName: true }).friendName, null);
  assert.equal(shareCardContent(overlap, { display_name: 'Sam', is_public: true }).friendName, null);
  assert.equal(shareCardContent(overlap, { display_name: 'Sam', is_public: true }, { showName: true }).friendName, 'Sam');
  assert.equal(shareCardContent(overlap, { username: 'sam', is_public: true }, { showName: true }).friendName, 'sam');
});

test('share card themes all resolve to real colours', () => {
  for (const theme of Object.values(SHARE_CARD_THEMES)) {
    for (const value of Object.values(theme)) assert.match(value, /^(#|rgba)/);
  }
});
