import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceAuthEpoch, authAttemptIsCurrent } from '../../src/utils/authAttempt.js';

test('a mode switch during the captcha wait invalidates the attempt already in flight', () => {
  let epoch = 0;
  const signup = (epoch = advanceAuthEpoch(epoch));
  assert.equal(authAttemptIsCurrent(signup, epoch), true);
  epoch = advanceAuthEpoch(epoch);
  assert.equal(authAttemptIsCurrent(signup, epoch), false);
});

test('a second submit replaces the first', () => {
  let epoch = 0;
  const first = (epoch = advanceAuthEpoch(epoch));
  const second = (epoch = advanceAuthEpoch(epoch));
  assert.equal(authAttemptIsCurrent(first, epoch), false);
  assert.equal(authAttemptIsCurrent(second, epoch), true);
});
