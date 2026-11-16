import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTraktAuthorizeUrl,
  getAppUrl,
  getAuthCallbackUrl,
  getTraktCallbackUrl,
  redirectToExternal,
  simklErrorReturn,
  traktErrorReturn,
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

test('traktErrorReturn goes back to the page the connect started on', () => {
  assert.deepEqual(traktErrorReturn('/onboarding?import=trakt'), { href: '/onboarding?import=trakt', place: 'setup' });
  assert.deepEqual(traktErrorReturn('/import?source=trakt'), { href: '/import?source=trakt', place: 'import' });
  assert.deepEqual(traktErrorReturn('/settings?section=connections&import=trakt'), { href: '/settings?section=connections&import=trakt', place: 'settings' });
  assert.deepEqual(traktErrorReturn('/settings'), { href: '/settings', place: 'settings' });
});

test('traktErrorReturn falls back to Settings for a missing or unexpected address', () => {
  const settings = { href: '/settings', place: 'settings' };
  assert.deepEqual(traktErrorReturn(null), settings);
  assert.deepEqual(traktErrorReturn(undefined), settings);
  assert.deepEqual(traktErrorReturn('/home'), settings);
  assert.deepEqual(traktErrorReturn('/onboardingx'), settings);
  // A protocol-relative address would leave the site if used as a link.
  assert.deepEqual(traktErrorReturn('//example.invalid/onboarding'), settings);
  assert.deepEqual(traktErrorReturn('https://example.invalid/settings'), settings);
});

test('simklErrorReturn goes back to the page the connect started on', () => {
  assert.deepEqual(simklErrorReturn('/onboarding?import=simkl'), { href: '/onboarding?import=simkl', place: 'setup' });
  assert.deepEqual(simklErrorReturn('/settings?section=connections&import=simkl'), { href: '/settings?section=connections&import=simkl', place: 'settings' });
  assert.deepEqual(simklErrorReturn('/import?source=simkl&from=onboarding'), { href: '/import?source=simkl&from=onboarding', place: 'import' });
});

test('simklErrorReturn falls back to Import for a missing or unexpected address', () => {
  const importPage = { href: '/import?source=simkl', place: 'import' };
  assert.deepEqual(simklErrorReturn(null), importPage);
  assert.deepEqual(simklErrorReturn('/home'), importPage);
  assert.deepEqual(simklErrorReturn('//example.invalid/onboarding'), importPage);
});
