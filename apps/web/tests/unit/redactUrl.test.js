import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSensitiveUrl } from '../../src/utils/redactUrl.js';

test('redacts implicit-flow tokens in the URL fragment, keeps benign params', () => {
  const url = 'https://app.theplot.tv/auth/callback#access_token=abc123&refresh_token=def456&expires_in=3600&token_type=bearer';
  const out = redactSensitiveUrl(url);
  assert.equal(
    out,
    'https://app.theplot.tv/auth/callback#access_token=redacted&refresh_token=redacted&expires_in=3600&token_type=bearer',
  );
  assert.ok(!out.includes('abc123'));
  assert.ok(!out.includes('def456'));
});

test('redacts PKCE code and OTP token_hash in the query string', () => {
  assert.equal(
    redactSensitiveUrl('https://app.theplot.tv/auth/callback?code=super-secret&type=recovery'),
    'https://app.theplot.tv/auth/callback?code=redacted&type=recovery',
  );
  assert.equal(
    redactSensitiveUrl('https://app.theplot.tv/auth/callback?token_hash=h123&type=signup'),
    'https://app.theplot.tv/auth/callback?token_hash=redacted&type=signup',
  );
});

test('redacts provider tokens too', () => {
  const out = redactSensitiveUrl('https://x/y#provider_token=p1&provider_refresh_token=p2&id_token=p3');
  assert.equal(out, 'https://x/y#provider_token=redacted&provider_refresh_token=redacted&id_token=redacted');
});

test('leaves URLs without credential params untouched', () => {
  const url = 'https://app.theplot.tv/discover?tab=movies&utm_source=newsletter';
  assert.equal(redactSensitiveUrl(url), url);
});

test('does not clip a longer param that merely ends in a sensitive name', () => {
  // `my_token` / `csrf_token` must survive — only the exact param is redacted.
  assert.equal(
    redactSensitiveUrl('https://x/y?my_token=keep&csrf_token=keep2'),
    'https://x/y?my_token=keep&csrf_token=keep2',
  );
});

test('is a safe no-op on non-string / empty input', () => {
  assert.equal(redactSensitiveUrl(''), '');
  assert.equal(redactSensitiveUrl(null), null);
  assert.equal(redactSensitiveUrl(undefined), undefined);
});
