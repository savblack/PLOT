import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titlePage } from './title.js';

// Captures the region this proxy asks the Edge Function for. The function reads
// ?r= and defaults to US, so whatever lands here is what the reader sees.
const upstreamRegion = async (href, cf) => {
  const real = globalThis.fetch;
  let asked = null;
  globalThis.fetch = (url) => {
    asked = new URL(url).searchParams.get('r');
    return Promise.resolve(new Response('<!doctype html>', { status: 200 }));
  };
  try {
    await titlePage(Object.assign(new Request(href), { cf }), 'movie', 'carnage-72113');
  } finally {
    globalThis.fetch = real;
  }
  return asked;
};

test('geo decides when the reader asks for nothing', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113', { country: 'AU' }), 'AU');
});

// This is the bug the region control could not be built around: the proxy used
// to compose ?r= from request.cf alone and drop anything the visitor asked for,
// so every link to another region silently returned the same page.
test('a requested region wins over geo', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=GB', { country: 'AU' }), 'GB');
});

test('a requested region is normalised to upper case', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=gb', { country: 'AU' }), 'GB');
});

test('junk in ?r= falls back to geo rather than through to TMDB', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=zzzz', { country: 'AU' }), 'AU');
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=1', { country: 'AU' }), 'AU');
});

test('no region at all is left for the function to default', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113', {}), null);
});

test('a requested region still works when geo is missing', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=NZ', {}), 'NZ');
});
