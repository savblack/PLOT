import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAPTCHA_INTERACTIVE_WAIT_MS,
  CAPTCHA_NO_FALLBACK_WAIT_MS,
  CAPTCHA_SUBMIT_ATTEMPTS,
  CAPTCHA_TOKEN_WAIT_MS,
  captchaHasFallback,
  captchaRetryAfterWait,
  captchaSubmitPlan,
  captchaWaitOver,
  shouldResetCaptcha,
} from '../../captchaGate.js';

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
  assert.ok(CAPTCHA_TOKEN_WAIT_MS >= 4000);
  assert.ok(CAPTCHA_TOKEN_WAIT_MS <= 10000);
});

test('a submit gets one retry before it gives up on the widget', () => {
  assert.equal(CAPTCHA_SUBMIT_ATTEMPTS, 2);
});

test('a timeout does not reset an interactive challenge; a widget error does', () => {
  assert.equal(shouldResetCaptcha({ attempt: 1, widgetErrored: false }), true);
  assert.equal(shouldResetCaptcha({ attempt: 2, widgetErrored: false }), false);
  assert.equal(shouldResetCaptcha({ attempt: 2, widgetErrored: true }), true);
});

test('signup and magic link stop waiting after CAPTCHA_TOKEN_WAIT_MS, then fall back', () => {
  for (const mode of ['signup', 'magic']) {
    assert.equal(captchaHasFallback(mode), true);
    assert.equal(captchaWaitOver({ token: null, mode, elapsedMs: CAPTCHA_TOKEN_WAIT_MS - 1 }), false);
    assert.equal(captchaWaitOver({ token: null, mode, elapsedMs: CAPTCHA_TOKEN_WAIT_MS }), true);
  }
});

test('a token or a widget error ends the wait at once', () => {
  for (const mode of ['signup', 'login', 'forgot', 'magic']) {
    assert.equal(captchaWaitOver({ token: 'tok', mode, elapsedMs: 0 }), true);
    assert.equal(captchaWaitOver({ token: null, errored: true, mode, elapsedMs: 0 }), true);
    assert.equal(captchaWaitOver({ token: 'tok', interactive: true, mode, elapsedMs: 0 }), true);
  }
});

// 2026-11-07, iPhone 17 Pro simulator, Staging: Cloudflare decided it wanted
// its checkbox 12 seconds after Sign in on one run and 23 seconds on another.
// Sign-in gave up at 16 seconds with "The security check did not finish",
// and sign-in has no fallback, so the person could not get in at all.
test('sign-in and password reset keep waiting while the invisible check runs', () => {
  for (const mode of ['login', 'forgot']) {
    assert.equal(captchaHasFallback(mode), false);
    assert.equal(captchaWaitOver({ token: null, mode, elapsedMs: 23000 }), false);
    assert.equal(captchaWaitOver({ token: null, mode, elapsedMs: CAPTCHA_NO_FALLBACK_WAIT_MS - 1 }), false);
    assert.equal(captchaWaitOver({ token: null, mode, elapsedMs: CAPTCHA_NO_FALLBACK_WAIT_MS }), true);
  }
});

test('the checkbox keeps the wait open long enough for someone to tap it', () => {
  assert.ok(CAPTCHA_INTERACTIVE_WAIT_MS >= 60000);
  for (const mode of ['signup', 'login', 'forgot', 'magic']) {
    assert.equal(captchaWaitOver({ token: null, interactive: true, mode, elapsedMs: 30000 }), false);
    assert.equal(
      captchaWaitOver({ token: null, interactive: true, mode, elapsedMs: CAPTCHA_INTERACTIVE_WAIT_MS }),
      true,
    );
  }
});

test('a second attempt runs after an error, never on an untapped checkbox', () => {
  for (const mode of ['signup', 'login', 'forgot', 'magic']) {
    assert.equal(captchaRetryAfterWait({ mode, errored: true }), true);
    assert.equal(captchaRetryAfterWait({ mode, interactive: true }), false);
  }
  assert.equal(captchaRetryAfterWait({ mode: 'signup' }), true);
  assert.equal(captchaRetryAfterWait({ mode: 'magic' }), true);
  assert.equal(captchaRetryAfterWait({ mode: 'login' }), false);
  assert.equal(captchaRetryAfterWait({ mode: 'forgot' }), false);
});
