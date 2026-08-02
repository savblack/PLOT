import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTraktAuthorizeUrl,
  getAppUrl,
  getAuthCallbackUrl,
  getTraktCallbackUrl,
  redirectToExternal,
} from '../../src/utils/redirects.js';

test('getAppUrl builds paths from an explicit callback base', () => {
  assert.equal(getAppUrl('/auth/callback', 'https://app.example.com/'), 'https://app.example.com/auth/callback');
  assert.equal(getAppUrl('settings', 'plot://auth'), 'plot://auth/settings');
  assert.equal(getAppUrl('https://other.example/path', 'https://app.example.com'), 'https://other.example/path');
});

test('callback helpers use the current browser origin when no env base is configured', () => {
  globalThis.window = { location: { origin: 'https://local.example', hostname: 'local.example' } };
  globalThis.document = {};

  assert.equal(getAuthCallbackUrl(), 'https://local.example/auth/callback');
  assert.equal(getTraktCallbackUrl(), 'https://local.example/auth/trakt');

  delete globalThis.window;
  delete globalThis.document;
});

test('buildTraktAuthorizeUrl includes the configured callback URL', () => {
  globalThis.window = { location: { origin: 'https://local.example', hostname: 'local.example' } };
  globalThis.document = {};

  const url = new URL(buildTraktAuthorizeUrl('client-123'));
  assert.equal(url.origin, 'https://trakt.tv');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'client-123');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://local.example/auth/trakt');

  delete globalThis.window;
  delete globalThis.document;
});

test('redirectToExternal delegates navigation to the browser shell', () => {
  let assignedUrl = null;
  globalThis.window = { location: { assign: url => { assignedUrl = url; } } };
  globalThis.document = {};

  assert.equal(redirectToExternal('https://example.com'), true);
  assert.equal(assignedUrl, 'https://example.com');

  delete globalThis.window;
  delete globalThis.document;
});
