import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDiscoverData, currentCinemaMovies, trendingCinemaHero, anticipatedMoviesFrom, nowOnStreamingFrom } from '../../useDiscover.js';

const item = (id, extra = {}) => ({ id, original_language: 'en', poster_path: `/${id}.jpg`, ...extra });

test('discovery exposes primary rails before release rails finish', async () => {
  let releaseSecondary;
  const secondaryGate = new Promise(resolve => { releaseSecondary = resolve; });
  const primarySnapshots = [];
  const client = {
    async getTrending(type, time) {
      if (type === 'tv') return { results: [item(3, { name: 'TV' })] };
      if (type === 'movie') return { results: [item(4, { title: 'Movie' })] };
      return { results: [item(time === 'week' ? 2 : 1, { title: time })] };
    },
    async getOnThisDay() { await secondaryGate; return item(5, { title: 'Anniversary' }); },
    async getUpcoming() { await secondaryGate; return { results: [] }; },
    async getNowPlaying() { await secondaryGate; return { results: [] }; },
  };

  const pending = loadDiscoverData({ client, onPrimary: data => primarySnapshots.push(data) });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(primarySnapshots.length, 1);
  assert.equal(primarySnapshots[0].hero.id, 1);
  releaseSecondary();
  const complete = await pending;
  assert.equal(complete.onThisDay.id, 5);
});

test('in cinemas: today and earlier only, English origin, flagged, no repeats', () => {
  const movie = (id, extra = {}) => item(id, { release_date: '2026-10-01', ...extra });
  const result = currentCinemaMovies([
    movie(1), movie(1), movie(2, { release_date: '2026-10-09' }), movie(3, { original_language: 'ja' }), movie(4, { release_date: '2026-10-05' }),
  ], { today: '2026-10-05' });
  assert.deepEqual(result.map(m => m.id), [1, 4]);
  assert.ok(result.every(m => m._cinema === true && m.media_type === 'movie'));
});

test('the In cinemas card is the most trending movie in cinemas, else the first in cinemas', () => {
  const inCinemas = [{ id: 7, _cinema: true }, { id: 9, _cinema: true }];
  assert.equal(trendingCinemaHero([{ id: 1 }, { id: 9 }, { id: 7 }], inCinemas).id, 9);
  assert.equal(trendingCinemaHero([{ id: 1 }], inCinemas).id, 7);
  assert.equal(trendingCinemaHero([{ id: 1 }], []), null);
});

test('Most Anticipated keeps only English-origin movies opening after today, at most ten', () => {
  const upcoming = [
    item(1, { release_date: '2026-11-15' }),
    item(2, { release_date: '2026-11-20' }),
    item(3, { release_date: '2026-12-01', original_language: 'ko', origin_country: ['KR'] }),
    item(2, { release_date: '2026-11-20' }),
    ...Array.from({ length: 12 }, (_, i) => item(10 + i, { release_date: '2026-12-10' })),
  ];
  const result = anticipatedMoviesFrom(upcoming, { today: '2026-11-15' });
  assert.equal(result.length, 10);
  assert.equal(result[0].id, 2);
  assert.ok(result.every(movie => movie.media_type === 'movie'));
  assert.ok(!result.some(movie => movie.id === 1 || movie.id === 3));
  assert.deepEqual(anticipatedMoviesFrom(null, { today: '2026-11-15' }), []);
});

test('Now on Streaming keeps digital releases that also had a cinema release', () => {
  const releases = {
    digital: [
      item(1, { release_date: '2026-11-10' }),
      item(2, { release_date: '2026-11-03' }), // straight to streaming: no cinema release
      item(3, { release_date: '2026-10-20', original_language: 'ko', origin_country: ['KR'] }),
      item(1, { release_date: '2026-11-10' }),
      item(4, { release_date: '2026-10-06', poster_path: null }),
      item(5, { release_date: '2026-10-06' }),
    ],
    theatrical: [item(1), item(3), item(4), item(5), item(9)],
  };
  const result = nowOnStreamingFrom(releases);
  assert.deepEqual(result.map(movie => movie.id), [1, 5]);
  assert.ok(result.every(movie => movie.media_type === 'movie'));
  // The digital date is the one kept, not the cinema date.
  assert.equal(result[0].release_date, '2026-11-10');
  assert.deepEqual(nowOnStreamingFrom(null), []);
  assert.deepEqual(nowOnStreamingFrom({ digital: [item(1)] }), []);
});
