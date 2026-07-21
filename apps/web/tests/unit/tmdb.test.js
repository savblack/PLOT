import assert from 'node:assert/strict';
import test from 'node:test';
import { configure } from '../../../../packages/core/config.js';
import { tmdb } from '../../../../packages/core/tmdb.js';

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
    const year = parsed.searchParams.get('primary_release_date.gte').slice(0, 4);
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
    assert.equal(requests[0].get('primary_release_date.gte'), '2006-07-21');
    assert.equal(requests[0].get('primary_release_date.lte'), '2006-07-21');
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
    const isArchiveQuery = parsed.searchParams.get('primary_release_date.gte') === '2016-01-01';
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
    assert.equal(requests[1].get('primary_release_date.gte'), '2016-01-01');
    assert.equal(requests[1].get('primary_release_date.lte'), '2016-12-31');
    assert.equal(requests[1].get('sort_by'), 'popularity.desc');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Date = originalDate;
  }
});
