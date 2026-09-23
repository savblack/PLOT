import assert from 'node:assert/strict';
import test from 'node:test';

import { CAPTCHA_TOKEN_WAIT_MS, captchaSubmitPlan } from '../../captchaGate.js';

test('captcha is a no-op when no site key is configured', () => {
  assert.equal(captchaSubmitPlan({ siteKey: '', token: null, mode: 'signup' }), 'ready');
  assert.equal(captchaSubmitPlan({ token: null, mode: 'login' }), 'ready');
});

test('a token always takes the normal auth path', () => {
  assert.equal(
    captchaSubmitPlan({ siteKey: 'site', token: 'tok', mode: 'signup', blocked: true }),
    'ready',
  );
  assert.equal(captchaSubmitPlan({ siteKey: 'site', token: 'tok', mode: 'login' }), 'ready');
});

test('signup waits once, then bypasses if the token never arrives', () => {
  assert.equal(captchaSubmitPlan({ siteKey: 'site', token: null, mode: 'signup' }), 'wait');
  assert.equal(
    captchaSubmitPlan({ siteKey: 'site', token: null, mode: 'signup', waited: true }),
    'bypass',
  );
});

test('a widget failure skips the wait and bypasses signup immediately', () => {
  assert.equal(
    captchaSubmitPlan({ siteKey: 'site', token: null, mode: 'signup', blocked: true }),
    'bypass',
  );
});

test('login, reset, and magic link wait, then stop instead of posting an empty token', () => {
  for (const mode of ['login', 'forgot', 'magic']) {
    assert.equal(captchaSubmitPlan({ siteKey: 'site', token: null, mode }), 'wait');
    assert.equal(
      captchaSubmitPlan({ siteKey: 'site', token: null, mode, waited: true }),
      'unavailable',
    );
    assert.equal(
      captchaSubmitPlan({ siteKey: 'site', token: null, mode, blocked: true, waited: true }),
      'unavailable',
    );
  }
});

test('the wait is a few seconds, long enough for a healthy widget to win', () => {
  assert.ok(CAPTCHA_TOKEN_WAIT_MS >= 2000);
  assert.ok(CAPTCHA_TOKEN_WAIT_MS <= 8000);
});
