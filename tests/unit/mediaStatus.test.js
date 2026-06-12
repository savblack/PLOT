import assert from 'node:assert/strict';
import test from 'node:test';
import { markMediaAsWatched, moveSavedShowToWatching } from '../../src/utils/mediaStatus.js';

test('moveSavedShowToWatching rolls back watching progress when saved removal fails', async () => {
  let rolledBack = false;

  const result = await moveSavedShowToWatching({
    startWatching: async () => ({ id: 'watching-row' }),
    removeFromSaved: async () => false,
    rollbackWatching: async () => {
      rolledBack = true;
      return true;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Could not move this show out of Saved. Please try again.');
  assert.equal(rolledBack, true);
});

test('markMediaAsWatched rolls back history when saved removal fails after logging', async () => {
  let rolledBack = false;

  const result = await markMediaAsWatched({
    logWatched: async () => ({ id: 'history-row' }),
    clearWatching: async () => true,
    removeFromSaved: async () => false,
    rollbackHistory: async () => {
      rolledBack = true;
      return true;
    },
    shouldClearWatching: false,
    shouldRemoveFromSaved: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Could not remove this show from Saved. Please try again.');
  assert.equal(rolledBack, true);
});

test('markMediaAsWatched clears active watching state for in-progress shows', async () => {
  let clearedWatching = false;

  const result = await markMediaAsWatched({
    logWatched: async () => ({ id: 'history-row' }),
    clearWatching: async () => {
      clearedWatching = true;
      return true;
    },
    removeFromSaved: async () => true,
    rollbackHistory: async () => true,
    shouldClearWatching: true,
    shouldRemoveFromSaved: false,
  });

  assert.equal(result.ok, true);
  assert.equal(clearedWatching, true);
});
