import assert from 'node:assert/strict';
import test from 'node:test';
import { loadNewThisWeek, pickNewThisWeek, NEW_THIS_WEEK_COUNT } from '../../newThisWeek.js';

// Ids here are stand-ins that only flow through the picker; nothing sends them
// to TMDB, so they are not meant to name real titles.
const movie = (id, extra = {}) => ({ id, media_type: 'movie', title: `Movie ${id}`, poster_path: `/m${id}.jpg`, original_language: 'en', ...extra });
const show = (id, extra = {}) => ({ id, media_type: 'tv', name: `Show ${id}`, poster_path: `/t${id}.jpg`, original_language: 'en', ...extra });

test('keeps movies and series with posters, in TMDB order, mapped to the shelf shape', () => {
  const picked = pickNewThisWeek([movie(1), show(2), { id: 3, media_type: 'person', name: 'Someone', profile_path: '/p.jpg' }]);
  assert.deepEqual(picked, [
    { id: 1, mediaType: 'movie', title: 'Movie 1', posterPath: '/m1.jpg' },
    { id: 2, mediaType: 'tv', title: 'Show 2', posterPath: '/t2.jpg' },
  ]);
});

test('drops titles without a usable poster, adult and kids titles, and duplicates', () => {
  const picked = pickNewThisWeek([
    movie(1, { poster_path: null }),
    movie(2, { poster_path: 'https://evil.example/x.jpg' }),
    movie(3, { adult: true }),
    show(4, { genre_ids: [10762] }),
    movie(5),
    movie(5),
    show(5),
  ]);
  assert.deepEqual(picked.map(t => `${t.mediaType}:${t.id}`), ['movie:5', 'tv:5']);
});

test('caps the shelf and leans toward English-language titles', () => {
  const results = [
    movie(1, { original_language: 'ko' }),
    movie(2, { original_language: 'ja' }),
    ...Array.from({ length: 8 }, (_, i) => movie(10 + i)),
  ];
  const picked = pickNewThisWeek(results);
  assert.equal(picked.length, NEW_THIS_WEEK_COUNT);
  assert.deepEqual(picked.slice(0, 3).map(t => t.id), [10, 11, 1]);
});

test('bad input gives an empty shelf rather than throwing', () => {
  assert.deepEqual(pickNewThisWeek(undefined), []);
  assert.deepEqual(pickNewThisWeek([null, {}]), []);
});

test('loadNewThisWeek asks for the weekly list once, without retries', async () => {
  const calls = [];
  const picked = await loadNewThisWeek({
    fetchTrending: async (...args) => { calls.push(args); return { ok: true, data: { results: [movie(1)] } }; },
  });
  assert.deepEqual(calls, [['/trending/all/week', {}, { retryDelays: [] }]]);
  assert.equal(picked.length, 1);
});

test('loadNewThisWeek returns an empty shelf when the read fails or throws', async () => {
  assert.deepEqual(await loadNewThisWeek({ fetchTrending: async () => ({ ok: false, data: null }) }), []);
  assert.deepEqual(await loadNewThisWeek({ fetchTrending: async () => { throw new Error('offline'); } }), []);
});

test('loadNewThisWeek keeps more titles when a caller asks for them', async () => {
  const results = Array.from({ length: 20 }, (_, i) => movie(100 + i));
  const fetchTrending = async () => ({ ok: true, data: { results } });
  assert.equal((await loadNewThisWeek({ fetchTrending })).length, NEW_THIS_WEEK_COUNT);
  assert.equal((await loadNewThisWeek({ count: 18, fetchTrending })).length, 18);
});
