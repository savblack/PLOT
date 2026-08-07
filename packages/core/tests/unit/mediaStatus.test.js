import assert from 'node:assert/strict';
import test from 'node:test';

import { moveSavedShowToWatching, markMediaAsWatched } from '../../mediaStatus.js';

test('moveSavedShowToWatching succeeds when both steps succeed', async () => {
  const calls = [];
  const result = await moveSavedShowToWatching({
    startWatching: async () => { calls.push('start'); return true; },
    removeFromSaved: async () => { calls.push('remove'); return true; },
    rollbackWatching: async () => { calls.push('rollback'); },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ['start', 'remove']);
});

test('moveSavedShowToWatching stops and reports an error when startWatching fails', async () => {
  const calls = [];
  const result = await moveSavedShowToWatching({
    startWatching: async () => { calls.push('start'); return false; },
    removeFromSaved: async () => { calls.push('remove'); return true; },
    rollbackWatching: async () => { calls.push('rollback'); },
  });

  assert.deepEqual(result, { ok: false, error: 'Could not start watching. Please try again.' });
  assert.deepEqual(calls, ['start']);
});

test('moveSavedShowToWatching rolls back and reports an error when removeFromSaved fails', async () => {
  const calls = [];
  const result = await moveSavedShowToWatching({
    startWatching: async () => { calls.push('start'); return true; },
    removeFromSaved: async () => { calls.push('remove'); return false; },
    rollbackWatching: async () => { calls.push('rollback'); },
  });

  assert.deepEqual(result, { ok: false, error: 'Could not move this show out of Saved. Please try again.' });
  assert.deepEqual(calls, ['start', 'remove', 'rollback']);
});

test('moveSavedShowToWatching tolerates a missing rollbackWatching callback', async () => {
  const result = await moveSavedShowToWatching({
    startWatching: async () => true,
    removeFromSaved: async () => false,
  });

  assert.deepEqual(result, { ok: false, error: 'Could not move this show out of Saved. Please try again.' });
});

test('markMediaAsWatched succeeds and skips optional steps when neither flag is set', async () => {
  const calls = [];
  const result = await markMediaAsWatched({
    logWatched: async () => { calls.push('log'); return true; },
    clearWatching: async () => { calls.push('clear'); return true; },
    removeFromSaved: async () => { calls.push('remove'); return true; },
    shouldClearWatching: false,
    shouldRemoveFromSaved: false,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ['log']);
});

test('markMediaAsWatched stops immediately when logWatched fails', async () => {
  const calls = [];
  const result = await markMediaAsWatched({
    logWatched: async () => { calls.push('log'); return false; },
    clearWatching: async () => { calls.push('clear'); return true; },
    shouldClearWatching: true,
  });

  assert.deepEqual(result, { ok: false, error: 'Could not update watch status. Please try again.' });
  assert.deepEqual(calls, ['log']);
});

test('markMediaAsWatched runs clearWatching then removeFromSaved when both flags are set', async () => {
  const calls = [];
  const result = await markMediaAsWatched({
    logWatched: async () => { calls.push('log'); return true; },
    clearWatching: async () => { calls.push('clear'); return true; },
    removeFromSaved: async () => { calls.push('remove'); return true; },
    shouldClearWatching: true,
    shouldRemoveFromSaved: true,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ['log', 'clear', 'remove']);
});

test('markMediaAsWatched rolls back and stops when clearWatching fails, without attempting removeFromSaved', async () => {
  const calls = [];
  const result = await markMediaAsWatched({
    logWatched: async () => true,
    clearWatching: async () => { calls.push('clear'); return false; },
    removeFromSaved: async () => { calls.push('remove'); return true; },
    rollbackHistory: async () => { calls.push('rollback'); },
    shouldClearWatching: true,
    shouldRemoveFromSaved: true,
  });

  assert.deepEqual(result, { ok: false, error: 'Could not clear the active watching state. Please try again.' });
  assert.deepEqual(calls, ['clear', 'rollback']);
});

test('markMediaAsWatched rolls back when removeFromSaved fails', async () => {
  const calls = [];
  const result = await markMediaAsWatched({
    logWatched: async () => true,
    removeFromSaved: async () => { calls.push('remove'); return false; },
    rollbackHistory: async () => { calls.push('rollback'); },
    shouldClearWatching: false,
    shouldRemoveFromSaved: true,
  });

  assert.deepEqual(result, { ok: false, error: 'Could not remove this show from Saved. Please try again.' });
  assert.deepEqual(calls, ['remove', 'rollback']);
});

test('markMediaAsWatched tolerates a missing rollbackHistory callback', async () => {
  const result = await markMediaAsWatched({
    logWatched: async () => true,
    clearWatching: async () => false,
    shouldClearWatching: true,
  });

  assert.deepEqual(result, { ok: false, error: 'Could not clear the active watching state. Please try again.' });
});
