import test from 'node:test';
import assert from 'node:assert/strict';
import { admit, BLOCK_MS, WINDOW_MS } from '../src/policy.js';

test('five requests are admitted and the sixth starts a ten-minute block', () => {
  let state = null;
  for (let i = 0; i < 5; i++) {
    const result = admit(state, 1000 + i);
    assert.equal(result.allowed, true);
    state = result.state;
  }
  const blocked = admit(state, 1005);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 600);
  assert.equal(blocked.expiresAt, 1005 + BLOCK_MS);
});

test('a denied request does not extend a block and expiry allows recovery', () => {
  const state = { attempts: [], blockedUntil: 601000 };
  assert.equal(admit(state, 600999).retryAfter, 1);
  assert.equal(admit(state, 601000).allowed, true);
  assert.equal(admit(state, 2000).expiresAt, 601000);
});

test('the rolling window drops attempts exactly sixty seconds old', () => {
  const old = { attempts: [1000, 1001, 1002, 1003, 1004], blockedUntil: 0 };
  const result = admit(old, 1000 + WINDOW_MS);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.state.attempts, [1001, 1002, 1003, 1004, 61000]);
});

test('serialized state preserves a block after restart', () => {
  const state = JSON.parse(JSON.stringify({ attempts: [], blockedUntil: 700000 }));
  assert.equal(admit(state, 200000).allowed, false);
});
