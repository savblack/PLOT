import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWatchLink } from '../../watchLinks.js';

test('buildWatchLink prefers a valid providerUrl and reports kind provider', () => {
  assert.deepEqual(
    buildWatchLink({ providerUrl: 'https://example.com/watch/123' }),
    { url: 'https://example.com/watch/123', kind: 'provider' },
  );
});

test('buildWatchLink normalizes a bare-domain URL the way the URL constructor does', () => {
  assert.deepEqual(buildWatchLink({ providerUrl: 'https://example.com' }), { url: 'https://example.com/', kind: 'provider' });
});

test('buildWatchLink accepts http as well as https', () => {
  assert.deepEqual(buildWatchLink({ providerUrl: 'http://insecure.com/x' }), { url: 'http://insecure.com/x', kind: 'provider' });
});

test('buildWatchLink falls back to justwatchLink when providerUrl is missing or invalid', () => {
  assert.deepEqual(
    buildWatchLink({ providerUrl: 'not a url', justwatchLink: 'https://justwatch.com/title/x' }),
    { url: 'https://justwatch.com/title/x', kind: 'justwatch' },
  );
  assert.deepEqual(
    buildWatchLink({ justwatchLink: 'https://justwatch.com/x' }),
    { url: 'https://justwatch.com/x', kind: 'justwatch' },
  );
});

test('buildWatchLink rejects whitespace-only and non-string URLs', () => {
  assert.deepEqual(
    buildWatchLink({ providerUrl: '   ', justwatchLink: 'https://justwatch.com/x' }),
    { url: 'https://justwatch.com/x', kind: 'justwatch' },
  );
  assert.deepEqual(
    buildWatchLink({ providerUrl: 42, justwatchLink: 'https://justwatch.com/x' }),
    { url: 'https://justwatch.com/x', kind: 'justwatch' },
  );
});

test('buildWatchLink rejects non-http(s) protocols such as javascript: and mailto:', () => {
  assert.equal(buildWatchLink({ providerUrl: 'javascript:alert(1)' }), null);
  assert.equal(buildWatchLink({ providerUrl: 'mailto:test@example.com' }), null);
});

test('buildWatchLink returns null when neither URL is usable', () => {
  assert.equal(buildWatchLink({ providerUrl: null, justwatchLink: null }), null);
  assert.equal(buildWatchLink({}), null);
});
