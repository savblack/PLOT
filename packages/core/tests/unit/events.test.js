import assert from 'node:assert/strict';
import test from 'node:test';

import { on, off, emit } from '../../events.js';

test('emit on an event with no listeners does not throw', () => {
  assert.doesNotThrow(() => emit('no-such-event-1', { x: 1 }));
});

test('on subscribes a listener that receives the emitted payload', () => {
  const received = [];
  on('event-basic', (payload) => received.push(payload));
  emit('event-basic', { hello: 'world' });
  assert.deepEqual(received, [{ hello: 'world' }]);
});

test('multiple listeners on the same event all run', () => {
  const calls = [];
  on('event-multi', () => calls.push('a'));
  on('event-multi', () => calls.push('b'));
  emit('event-multi', null);
  assert.deepEqual(calls, ['a', 'b']);
});

test('the unsubscribe function returned by on() removes only that listener', () => {
  const calls = [];
  const unsubscribe = on('event-unsub', () => calls.push('first'));
  on('event-unsub', () => calls.push('second'));

  unsubscribe();
  emit('event-unsub', null);

  assert.deepEqual(calls, ['second']);
});

test('off removes a listener registered with on', () => {
  const calls = [];
  const fn = () => calls.push('called');
  on('event-off', fn);
  off('event-off', fn);
  emit('event-off', null);
  assert.deepEqual(calls, []);
});

test('off on an event with no listeners does not throw', () => {
  assert.doesNotThrow(() => off('no-such-event-2', () => {}));
});

test('registering the same function twice for one event only stores it once', () => {
  const calls = [];
  const fn = () => calls.push('called');
  on('event-dedup', fn);
  on('event-dedup', fn);
  emit('event-dedup', null);
  assert.deepEqual(calls, ['called']);
});

test('emit isolates listener errors: a throwing listener does not stop the rest and does not propagate', () => {
  const originalConsoleError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    const calls = [];
    on('event-throws', () => { calls.push('before'); throw new Error('boom'); });
    on('event-throws', () => calls.push('after'));

    assert.doesNotThrow(() => emit('event-throws', null));
    assert.deepEqual(calls, ['before', 'after']);
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
