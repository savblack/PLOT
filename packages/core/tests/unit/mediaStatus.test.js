import assert from 'node:assert/strict';
import test from 'node:test';

import { moveSavedShowToWatching, markMediaAsWatched, resolveWatchedTransition } from '../../mediaStatus.js';

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
    mediaType: 'movie', isWatching: false, inList: false,
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ['log']);
});

test('markMediaAsWatched stops immediately when logWatched fails', async () => {
  const calls = [];
  const result = await markMediaAsWatched({
    logWatched: async () => { calls.push('log'); return false; },
    clearWatching: async () => { calls.push('clear'); return true; },
    mediaType: 'tv', isWatching: true,
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
    mediaType: 'tv', isWatching: true, inList: true,
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
    mediaType: 'tv', isWatching: true, inList: true,
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
    mediaType: 'movie', isWatching: false, inList: true,
  });

  assert.deepEqual(result, { ok: false, error: 'Could not remove this show from Saved. Please try again.' });
  assert.deepEqual(calls, ['remove', 'rollback']);
});

test('markMediaAsWatched tolerates a missing rollbackHistory callback', async () => {
  const result = await markMediaAsWatched({
    logWatched: async () => true,
    clearWatching: async () => false,
    mediaType: 'tv', isWatching: true,
  });

  assert.deepEqual(result, { ok: false, error: 'Could not clear the active watching state. Please try again.' });
});

/* ── resolveWatchedTransition ─────────────────────────────────────────────
   The rule callers used to each re-derive. Web guarded removal with
   `&& !isWatching` and core's favourites path didn't guard it at all, so the
   same action produced different results depending on where you did it.
   Decided rule: finishing something takes it off every other list. */

test('resolveWatchedTransition clears watching and removes from saved for a TV show in both states', () => {
  assert.deepEqual(
    resolveWatchedTransition({ mediaType: 'tv', isWatching: true, inList: true }),
    { shouldClearWatching: true, shouldRemoveFromSaved: true },
  );
});

test('resolveWatchedTransition never treats a movie as currently watching', () => {
  // Movie and TV tmdb ids can collide (see userMedia.js), so an isWatching
  // hit on a movie id is meaningless.
  assert.deepEqual(
    resolveWatchedTransition({ mediaType: 'movie', isWatching: true, inList: true }),
    { shouldClearWatching: false, shouldRemoveFromSaved: true },
  );
});

test('resolveWatchedTransition leaves saved alone when the title was never saved', () => {
  assert.deepEqual(
    resolveWatchedTransition({ mediaType: 'tv', isWatching: true, inList: false }),
    { shouldClearWatching: true, shouldRemoveFromSaved: false },
  );
});

test('resolveWatchedTransition coerces missing state to false rather than throwing', () => {
  assert.deepEqual(
    resolveWatchedTransition({ mediaType: 'movie' }),
    { shouldClearWatching: false, shouldRemoveFromSaved: false },
  );
});
