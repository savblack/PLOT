import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gotrueMailOrCaptchaFailed,
  loginNeedsConfirmation,
  shouldMagicLinkViaBypass,
  shouldResendViaBypass,
} from '../../src/utils/authBypass.js';

test('resend uses signup-bypass when Turnstile never returned a token', () => {
  assert.equal(shouldResendViaBypass({ captchaRequired: true, captchaToken: null }), true);
  assert.equal(shouldResendViaBypass({ captchaRequired: false, captchaToken: null }), false);
});

test('resend falls back when GoTrue rejects the captcha or its SMTP login fails', () => {
  assert.equal(shouldResendViaBypass({
    captchaRequired: true,
    captchaToken: 'tok',
    error: { message: 'captcha verification process failed', status: 400 },
  }), true);
  assert.equal(shouldResendViaBypass({
    captchaRequired: true,
    captchaToken: 'tok',
    error: { message: '535 Authentication credentials invalid', status: 500 },
  }), true);
  assert.equal(shouldResendViaBypass({
    captchaRequired: true,
    captchaToken: 'tok',
    error: { message: 'Email rate limit exceeded', status: 429 },
  }), false);
});

test('magic link uses signup-bypass on timeout, captcha failure, and SMTP 500', () => {
  assert.equal(shouldMagicLinkViaBypass({
    captchaRequired: true,
    captchaToken: null,
    plan: 'unavailable',
  }), true);
  assert.equal(shouldMagicLinkViaBypass({
    captchaRequired: true,
    captchaToken: 'tok',
    plan: 'ready',
    error: { message: 'Error sending magic link: 535 Authentication credentials invalid', status: 500 },
  }), true);
  assert.equal(shouldMagicLinkViaBypass({
    captchaRequired: false,
    captchaToken: null,
    plan: 'ready',
  }), false);
});

test('a captcha or SMTP failure is recognised from the message or the status', () => {
  assert.equal(gotrueMailOrCaptchaFailed({ message: 'Captcha token missing' }), true);
  assert.equal(gotrueMailOrCaptchaFailed({ message: 'upstream blew up', status: 500 }), true);
  assert.equal(gotrueMailOrCaptchaFailed({ message: 'Invalid login credentials', status: 400 }), false);
  assert.equal(gotrueMailOrCaptchaFailed(null), false);
});

test('an unconfirmed password sign-in offers the confirmation screen', () => {
  assert.equal(loginNeedsConfirmation('Email not confirmed'), true);
  assert.equal(loginNeedsConfirmation('Invalid login credentials'), false);
});
