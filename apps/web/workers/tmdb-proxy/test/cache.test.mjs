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

test('a caller-supplied API key cannot create a cache miss', () => {
  assert.equal(key('?path=genre/movie/list&api_key=one'), key('?path=genre/movie/list&api_key=two'));
  assert.equal(key('?path=genre/movie/list&api_key=one'), key('?path=genre/movie/list'));
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

test('artwork image lists are held as long as the title they belong to', () => {
  assert.equal(ttlFor('movie/550/images'), ttlFor('movie/550'));
  assert.equal(ttlFor('tv/1396/images'), ttlFor('tv/1396'));
  assert.equal(ttlFor('person/287/images'), ttlFor('movie/550'));
  assert.equal(ttlFor('tv/1396/season/0/images'), ttlFor('tv/1396/season/0'));
  assert.notEqual(
    key('?path=movie/550/images&include_image_language=en,null'),
    key('?path=movie/550/images&include_image_language=fr,null'),
  );
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

test('an unknown parameter cannot create a cache miss', () => {
  // Every distinct `&x=<n>` used to be a fresh TMDB call under the same rate
  // budget. Only the parameters the backend forwards may fork the cache.
  assert.equal(key('?path=movie/550&junk=1'), key('?path=movie/550&junk=2'));
  assert.equal(key('?path=movie/550&junk=1'), key('?path=movie/550'));
  assert.equal(key('?path=movie/550&utm_source=x&language=en-US'), key('?path=movie/550&language=en-US'));
});

test('a page beyond what TMDB serves collapses onto the last real page', () => {
  assert.equal(key('?path=trending/all/week&page=9999'), key('?path=trending/all/week&page=500'));
  assert.equal(key('?path=trending/all/week&page=0'), key('?path=trending/all/week'));
  assert.notEqual(key('?path=trending/all/week&page=2'), key('?path=trending/all/week&page=3'));
});
