import assert from 'node:assert/strict';
import test from 'node:test';
import { configure } from '../../../../packages/core/config.js';
import { tmdb, setTmdbRegion, prioritiseEnglishSpeakingTitles } from '../../../../packages/core/tmdb.js';

test('English-speaking titles are favoured without excluding other titles', () => {
  const results = prioritiseEnglishSpeakingTitles([
    { id: 1, original_language: 'ko' },
    { id: 2, original_language: 'en' },
    { id: 3, original_language: 'ja' },
    { id: 4, origin_country: ['AU'] },
    { id: 5, original_language: 'en' },
    { id: 6, original_language: 'es' },
  ]);

  assert.deepEqual(results.map(item => item.id), [2, 4, 1, 5, 3, 6]);
});

test('talent helpers use TMDB person endpoints and title details request credits', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  configure({ tmdbProxyUrl: 'https://proxy.test', supabaseAnonKey: 'anon' });
  globalThis.fetch = async (url) => {
    requests.push(new URL(url));
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  };

  try {
    await Promise.all([
      tmdb.searchPeople('Greta'),
      tmdb.getPersonDetails(123),
      tmdb.getPersonCredits(123),
      tmdb.getMovieDetails(456),
      tmdb.getTVDetails(789),
    ]);
    assert.deepEqual(requests.map(request => request.searchParams.get('path')), [
      'search/person', 'person/123', 'person/123/combined_credits', 'movie/456', 'tv/789',
    ]);
    assert.match(requests[3].searchParams.get('append_to_response'), /credits/);
    assert.match(requests[3].searchParams.get('append_to_response'), /release_dates/);
    assert.match(requests[4].searchParams.get('append_to_response'), /aggregate_credits/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('movie details use the selected region release date instead of the primary date', async () => {
  const originalFetch = globalThis.fetch;
  configure({ tmdbProxyUrl: 'https://proxy.test', supabaseAnonKey: 'anon' });
  setTmdbRegion('AU');
  globalThis.fetch = async (url) => {
    const request = new URL(url);
    assert.equal(request.searchParams.get('region'), 'AU');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 123,
        release_date: '2026-01-09',
        release_dates: {
          results: [{
            iso_3166_1: 'AU',
            release_dates: [
              { type: 4, release_date: '2026-05-01T00:00:00.000Z' },
              { type: 3, release_date: '2026-04-16T00:00:00.000Z' },
            ],
          }],
        },
      }),
    };
  };

  try {
    const movie = await tmdb.getMovieDetails(123);
    assert.equal(movie.release_date, '2026-04-16');
  } finally {
    globalThis.fetch = originalFetch;
    setTmdbRegion('US');
  }
});

test('digital release dates do not fall back to the United States', async () => {
  const originalFetch = globalThis.fetch;
  configure({ tmdbProxyUrl: 'https://proxy.test', supabaseAnonKey: 'anon' });
  setTmdbRegion('AU');
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{
        iso_3166_1: 'US',
        release_dates: [{ type: 4, release_date: '2026-04-10T00:00:00.000Z' }],
      }],
    }),
  });

  try {
    assert.equal(await tmdb.getDigitalReleaseDate(123), null);
  } finally {
    globalThis.fetch = originalFetch;
    setTmdbRegion('US');
  }
});

test('getOnThisDay returns the highest-voted anniversary title', async () => {
  const originalFetch = globalThis.fetch;
  const originalDate = globalThis.Date;
  const requests = [];

  class FixedDate extends originalDate {
    constructor(...args) {
      return args.length ? new originalDate(...args) : new originalDate('2026-07-21T12:00:00');
    }
    static now() { return new originalDate('2026-07-21T12:00:00').valueOf(); }
  }

  globalThis.Date = FixedDate;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed.searchParams);
    const year = parsed.searchParams.get('release_date.gte').slice(0, 4);
    const results = year === '2006'
      ? [{ id: 7, title: 'Most watched', vote_count: 9000 }]
      : [{ id: 8, title: 'Less watched', vote_count: 3000 }];
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  configure({ tmdbProxyUrl: 'https://proxy.test', supabaseAnonKey: 'anon' });

  try {
    const result = await tmdb.getOnThisDay({ years: [20, 10], minVotes: 500 });
    assert.equal(result.id, 7);
    assert.equal(result.media_type, 'movie');
    assert.equal(result.anniversary_years, 20);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].get('release_date.gte'), '2006-07-21');
    assert.equal(requests[0].get('release_date.lte'), '2006-07-21');
    assert.equal(requests[0].get('with_release_type'), '3|2');
    assert.equal(requests[0].get('vote_count.gte'), '500');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Date = originalDate;
  }
});

test('getOnThisDay falls back to a random archival title when no anniversary title qualifies', async () => {
  const originalFetch = globalThis.fetch;
  const originalDate = globalThis.Date;
  const requests = [];

  class FixedDate extends originalDate {
    constructor(...args) {
      return args.length ? new originalDate(...args) : new originalDate('2026-07-21T12:00:00');
    }
  }

  globalThis.Date = FixedDate;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed.searchParams);
    const isArchiveQuery = parsed.searchParams.get('release_date.gte') === '2016-01-01';
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: isArchiveQuery ? [{ id: 9, title: 'Archive pick', vote_count: 6000 }] : [] }),
    };
  };
  configure({ tmdbProxyUrl: 'https://proxy.test', supabaseAnonKey: 'anon' });

  try {
    const result = await tmdb.getOnThisDay({ years: [20], archiveYears: [10], minVotes: 500, random: () => 0 });
    assert.equal(result.id, 9);
    assert.equal(result.archive_year, 2016);
    assert.equal(result.media_type, 'movie');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].get('release_date.gte'), '2016-01-01');
    assert.equal(requests[1].get('release_date.lte'), '2016-12-31');
    assert.equal(requests[1].get('sort_by'), 'popularity.desc');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Date = originalDate;
  }
});
