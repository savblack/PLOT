import assert from 'node:assert/strict';
import test from 'node:test';

import { AUTH_REQUEST_TIMEOUT_MS, AUTH_TIMEOUT_MESSAGE, withAuthTimeout } from '../../authTimeout.js';
import { authErrorReason } from '../../authErrors.js';

// A manual clock: the test decides when the timer fires.
function manualTimers() {
  const pending = new Map();
  let next = 1;
  return {
    timers: {
      setTimer: (fn, ms) => { const id = next++; pending.set(id, { fn, ms }); return id; },
      clearTimer: (id) => { pending.delete(id); },
    },
    fire: () => { for (const [id, t] of pending) { pending.delete(id); t.fn(); } },
    pending,
  };
}

test('withAuthTimeout passes through a request that answers in time and clears its timer', async () => {
  const clock = manualTimers();
  const result = await withAuthTimeout(Promise.resolve('ok'), 1000, clock.timers);
  assert.equal(result, 'ok');
  assert.equal(clock.pending.size, 0);
});

test('withAuthTimeout passes through a request that fails in time', async () => {
  const clock = manualTimers();
  await assert.rejects(
    withAuthTimeout(Promise.reject(new Error('Failed to fetch')), 1000, clock.timers),
    { message: 'Failed to fetch' },
  );
  assert.equal(clock.pending.size, 0);
});

test('withAuthTimeout rejects with the timeout sentinel when a request never answers', async () => {
  const clock = manualTimers();
  const hung = new Promise(() => {});
  const raced = withAuthTimeout(hung, 1000, clock.timers);
  assert.equal([...clock.pending.values()][0].ms, 1000);
  clock.fire();
  await assert.rejects(raced, { message: AUTH_TIMEOUT_MESSAGE });
});

test('withAuthTimeout defaults to the shared auth limit', () => {
  const clock = manualTimers();
  withAuthTimeout(new Promise(() => {}), undefined, clock.timers).catch(() => {});
  assert.equal([...clock.pending.values()][0].ms, AUTH_REQUEST_TIMEOUT_MS);
  clock.fire();
});

test('authErrorReason names timeouts and unreachable-network failures', () => {
  assert.equal(authErrorReason(AUTH_TIMEOUT_MESSAGE), 'timeout');
  assert.equal(authErrorReason('Failed to fetch'), 'network');
  assert.equal(authErrorReason('failed to fetch'), 'network');
  assert.equal(authErrorReason('NetworkError when attempting to fetch resource.'), 'network');
  assert.equal(authErrorReason('Load failed'), 'network');
});
