import test from 'node:test';
import assert from 'node:assert/strict';
import { oncePerSession } from '../../oncePerSession.js';

test('oncePerSession runs the callback on the first call only', () => {
  let runs = 0;
  const key = `once-${Math.random()}`;
  assert.equal(oncePerSession(key, () => { runs += 1; }), true);
  assert.equal(oncePerSession(key, () => { runs += 1; }), false);
  assert.equal(runs, 1);
});

test('oncePerSession treats a different key as new', () => {
  let runs = 0;
  oncePerSession(`a-${Math.random()}`, () => { runs += 1; });
  oncePerSession(`b-${Math.random()}`, () => { runs += 1; });
  assert.equal(runs, 2);
});
