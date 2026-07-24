import assert from 'node:assert/strict';
import test from 'node:test';
import { submitIndexNow } from './indexnow.mjs';

test('submitIndexNow sends unique canonical PLOT URLs', async () => {
  let request;
  const result = await submitIndexNow([
    'https://theplot.tv/whats-on/a',
    'https://theplot.tv/whats-on/a',
    'http://theplot.tv/whats-on/not-secure',
    'https://app.theplot.tv/whats-on/wrong-host',
    'not a url',
  ], {
    fetch: async (url, init) => {
      request = { url, ...init };
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(result, { submitted: 1, responses: [200] });
  assert.equal(request.url, 'https://api.indexnow.org/IndexNow');
  assert.deepEqual(JSON.parse(request.body), {
    host: 'theplot.tv',
    key: '85a3ffbabc347122ac68bcba41e802aeffeb85a6473dceb08c0ea4b419b895fa',
    keyLocation: 'https://theplot.tv/85a3ffbabc347122ac68bcba41e802aeffeb85a6473dceb08c0ea4b419b895fa.txt',
    urlList: ['https://theplot.tv/whats-on/a'],
  });
});

test('submitIndexNow does not request the API when no URLs are valid', async () => {
  const result = await submitIndexNow(['https://example.com/nope'], {
    fetch: async () => { throw new Error('should not be called'); },
  });
  assert.deepEqual(result, { submitted: 0, responses: [] });
});
