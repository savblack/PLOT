import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { requestAdmissionError } from '../src/index.js';

const request = (headers = {}) => new Request('https://proxy.example/?path=genre/movie/list', { headers });

test('allows Plot web origins and the Pages preview origin', () => {
  assert.equal(requestAdmissionError(request({
    Origin: 'https://app.theplot.tv',
    'User-Agent': 'Mozilla/5.0',
  })), null);
  assert.equal(requestAdmissionError(request({
    Origin: 'https://preview.plot-5wr.pages.dev',
    'User-Agent': 'Mozilla/5.0',
  })), null);
});

test('rejects a browser origin outside Plot', () => {
  assert.equal(requestAdmissionError(request({
    Origin: 'https://example.invalid',
    'User-Agent': 'Mozilla/5.0',
  })), 'Origin not allowed');
});

test('rejects an originless browser before it can reach Supabase', () => {
  assert.equal(requestAdmissionError(request({
    'Sec-Fetch-Mode': 'cors',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
  })), 'Browser requests require an approved Origin');
});

test('blocked browser requests do not call the Supabase upstream', async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return new Response('{}');
  };

  try {
    const response = await handler.fetch(request({
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
    }), {}, { waitUntil() {} });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Browser requests require an approved Origin' });
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('allows originless native clients', () => {
  assert.equal(requestAdmissionError(request({
    'User-Agent': 'okhttp/4.12.0',
  })), null);
});
