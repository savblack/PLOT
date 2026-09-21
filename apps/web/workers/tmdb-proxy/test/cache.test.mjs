import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheKey, ttlFor } from '../src/cache.js';

const key = (search, origin) => cacheKey(new URL(`https://proxy.example/${search}`), origin).url;

test('the same question asked two ways is one cache entry', () => {
  assert.equal(
    key('?path=movie/123&language=en-US&region=AU'),
    key('?region=AU&path=movie/123&language=en-US'),
  );
});

test('region and language stay part of the key', () => {
  // Watch providers differ by country. Sharing one entry across regions would
  // tell an Australian where to watch something in the United States.
  assert.notEqual(key('?path=movie/1/watch/providers&region=AU'), key('?path=movie/1/watch/providers&region=US'));
  assert.notEqual(key('?path=movie/1&language=en-US'), key('?path=movie/1&language=fr-FR'));
});

test('callers from different origins do not share an entry', () => {
  // The upstream reflects Origin in Access-Control-Allow-Origin, so a shared
  // entry would hand one site a header naming another and the browser would
  // refuse the response.
  assert.notEqual(key('?path=movie/1', 'https://app.theplot.tv'), key('?path=movie/1', 'https://theplot.tv'));
  // The mobile app sends no Origin at all; that is its own entry, not a crash.
  assert.equal(key('?path=movie/1', null), key('?path=movie/1', undefined));
});

test('what changes rarely is held longer than what changes hourly', () => {
  assert.ok(ttlFor('genre/movie/list') > ttlFor('movie/550'));
  assert.ok(ttlFor('movie/550') > ttlFor('trending/all/week'));
  assert.ok(ttlFor('trending/all/week') > ttlFor('search/multi'));
});

test('an unrecognised path still gets a conservative TTL rather than none', () => {
  assert.ok(ttlFor('something/new') > 0);
});

test('historical discovery windows are cached for a day', () => {
  const historical = new URLSearchParams({
    'release_date.gte': '1996-09-21',
    'release_date.lte': '1996-09-21',
  });
  const current = new URLSearchParams({
    'release_date.gte': '2026-09-01',
    'release_date.lte': new Date().toISOString().slice(0, 10),
  });

  assert.equal(ttlFor('discover/movie', historical), 86400);
  assert.equal(ttlFor('discover/movie', current), 3600);
});
