import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALLOWED_PATHS, fromPlotPage, upstreamQuery } from './discover.js';

const ask = (headers) => new Request('https://theplot.tv/api/discover?path=movie/upcoming', { headers });
const query = (search) => upstreamQuery(new URL(`https://theplot.tv/api/discover${search}`));

test('a fetch from a PLOT page is admitted', () => {
  assert.equal(fromPlotPage(ask({ 'Sec-Fetch-Site': 'same-origin' })), true);
});

test('a call from another site is refused however it announces itself', () => {
  assert.equal(fromPlotPage(ask({ 'Sec-Fetch-Site': 'cross-site' })), false);
  assert.equal(fromPlotPage(ask({ 'Sec-Fetch-Site': 'same-site' })), false);
  assert.equal(fromPlotPage(ask({ Origin: 'https://example.com' })), false);
  assert.equal(fromPlotPage(ask({ Referer: 'https://example.com/embed' })), false);
});

test('a caller offering no evidence at all is refused', () => {
  // The curl case, and the one this whole check exists for.
  assert.equal(fromPlotPage(ask({})), false);
  assert.equal(fromPlotPage(ask({ 'Sec-Fetch-Site': 'none' })), false);
  assert.equal(fromPlotPage(ask({ Referer: 'not a url' })), false);
});

test('Safari before 16.4 sends no Sec-Fetch-Site, so a same-origin Referer stands in', () => {
  assert.equal(fromPlotPage(ask({ Referer: 'https://theplot.tv/' })), true);
  assert.equal(fromPlotPage(ask({ Referer: 'https://www.theplot.tv/' })), true);
});

test('preview deployments and local dev are admitted without being named', () => {
  const preview = new Request('https://abc123.plot-site.pages.dev/api/discover?path=movie/upcoming', {
    headers: { Referer: 'https://abc123.plot-site.pages.dev/' },
  });
  assert.equal(fromPlotPage(preview), true);
});

test('only the paths the homepage asks for are forwarded', () => {
  assert.equal(query('?path=movie/upcoming').error, undefined);
  assert.equal(query('?path=/movie/upcoming').search, '?path=movie%2Fupcoming');
  assert.match(query('?path=account/1/favorites').error, /not allowed/);
  assert.match(query('').error, /Missing/);
});

test('the upstream query is reduced to the allowlist and sorted', () => {
  // Same request, three spellings, one cache key.
  const canonical = query('?path=discover/movie&sort_by=popularity.desc&with_genres=27').search;
  assert.equal(query('?with_genres=27&path=discover/movie&sort_by=popularity.desc').search, canonical);
  assert.equal(query('?path=discover/movie&utm_source=x&sort_by=popularity.desc&with_genres=27').search, canonical);
  assert.ok(!canonical.includes('utm_source'));
});

test('a parameter value outside the expected shape is dropped, not forwarded', () => {
  const search = query('?path=discover/movie&with_genres=' + encodeURIComponent('27 OR 1=1')).search;
  assert.ok(!search.includes('with_genres'), search);
});

const homepage = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

test('the allowlist still covers every path the homepage asks for', () => {
  // The guard and the page drift apart silently otherwise: a new strip on the
  // homepage would just render empty, with the reason only in the console.
  const asked = [...homepage.matchAll(/tmdbProxy\('([^']+)'/g)].map((match) => match[1]);
  assert.ok(asked.length > 0, 'found no tmdbProxy calls to check, so this test is not testing anything');
  for (const path of new Set(asked)) {
    assert.ok(ALLOWED_PATHS.has(path), `the homepage asks for ${path}, which _lib/discover.js will refuse`);
  }
});

test('the allowlist still passes every query the homepage sends', () => {
  // Values are enumerated, not pattern-matched, so a retuned category ring
  // (a different genre id, a different vote threshold) silently loses its
  // posters unless this list is updated with it. Fail here instead.
  const queries = [...homepage.matchAll(/q: '([^']+)'/g)].map((match) => match[1]);
  assert.ok(queries.length > 0, 'found no category queries to check, so this test is not testing anything');
  for (const q of queries) {
    const sent = new URLSearchParams(`${q}&include_adult=false`); // as loadLiveCovers calls it
    const { search, error } = query(`?path=discover/movie&${sent}`);
    assert.equal(error, undefined, `the homepage sends ?${q}, which _lib/discover.js refuses`);
    for (const [key, value] of sent) {
      assert.ok(new URLSearchParams(search).getAll(key).includes(value),
        `the homepage sends ${key}=${value}, which _lib/discover.js drops: the ring loses its posters`);
    }
  }
});
