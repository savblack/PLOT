import assert from 'node:assert/strict';
import test from 'node:test';

import { captchaFailureCopy } from '../../copy/authPage.js';

test('signup failure copy may say the account can still be created', () => {
  const copy = captchaFailureCopy('signup');
  assert.match(copy.failed, /create your account/i);
  assert.match(copy.blocked, /create your account/i);
  assert.notEqual(copy.failed, copy.blocked);
});

test('login, reset, and magic link are not told they can create an account', () => {
  for (const mode of ['login', 'forgot', 'magic']) {
    const copy = captchaFailureCopy(mode);
    assert.doesNotMatch(copy.failed, /create your account/i, mode);
    assert.doesNotMatch(copy.blocked, /create your account/i, mode);
    assert.match(copy.failed, /try again/i);
    assert.match(copy.blocked, /try again/i);
  }
});

test('failure copy has no em dash', () => {
  for (const mode of ['signup', 'login', 'forgot', 'magic']) {
    const copy = captchaFailureCopy(mode);
    assert.equal(copy.failed.includes('—'), false);
    assert.equal(copy.blocked.includes('—'), false);
  }
});
