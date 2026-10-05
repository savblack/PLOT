import test from 'node:test';
import assert from 'node:assert/strict';
import { CURATED_LISTS, curatedListById, curatedListRows, featuredCuratedList } from '@plot/core/curatedLists.js';

test('every curated list is resolved, ranked and free of duplicates', () => {
  for (const list of CURATED_LISTS) {
    assert.ok(list.entries.length > 0, list.id);
    list.entries.forEach((entry, i) => {
      assert.equal(entry.rank, i + 1, `${list.id} rank ${i + 1}`);
      assert.ok(Number.isInteger(entry.tmdb_id) && entry.tmdb_id > 0, `${list.id} ${entry.title}`);
      assert.ok(['movie', 'tv'].includes(entry.media_type));
      assert.ok(entry.title);
    });
    const keys = list.entries.map(e => `${e.media_type}-${e.tmdb_id}`);
    assert.equal(new Set(keys).size, keys.length, `${list.id} has a repeated title`);
  }
});

test('the NYT list has its 100 shows and credits the source', () => {
  const nyt = curatedListById('nyt-best-tv-21st-century');
  assert.equal(nyt.entries.length, 100);
  assert.equal(nyt.source.name, 'The New York Times');
  assert.match(nyt.source.url, /^https:\/\/www\.nytimes\.com\//);
});

test('rows stamp rank 1 newest so it lists first', () => {
  const list = { entries: [
    { rank: 1, tmdb_id: 10, media_type: 'tv', title: 'A', poster_path: null, genre_ids: [1] },
    { rank: 2, tmdb_id: 20, media_type: 'tv', title: 'B', poster_path: '/b.jpg', genre_ids: [] },
  ] };
  const rows = curatedListRows(list, 'list-1', 'user-1', Date.UTC(2026, 9, 4));
  assert.deepEqual(rows.map(r => r.tmdb_id), [10, 20]);
  assert.ok(rows[0].added_at > rows[1].added_at);
  assert.ok(rows.every(r => r.list_id === 'list-1' && r.user_id === 'user-1'));
});

test('the featured list is stable within a day and always one of the curated lists', () => {
  const morning = featuredCuratedList(new Date(2026, 9, 5, 8));
  const evening = featuredCuratedList(new Date(2026, 9, 5, 22));
  assert.equal(morning, evening);
  assert.ok(CURATED_LISTS.includes(morning));
});
