import assert from 'node:assert/strict';
import test from 'node:test';

import { saveListItem, deleteListItem, findHistoryEntry, logWatchedItem, HISTORY_CONFLICT_TARGET } from '../../userMedia.js';

// saveListItem/deleteListItem/findHistoryEntry/logWatchedItem all call the real
// `supabase` singleton from supabase.js on their happy path, and that module
// exports a Proxy with no injection seam (unlike onboarding.js, which takes
// `supabase` as a parameter for exactly this reason) — see the test summary.
// Only the guard clauses that return before touching supabase are testable here.

test('HISTORY_CONFLICT_TARGET matches the history table unique constraint columns', () => {
  assert.equal(HISTORY_CONFLICT_TARGET, 'user_id,tmdb_id,media_type');
});

test('saveListItem short-circuits to a null row without a listId, userId, or resolvable media item', async () => {
  const item = { id: 1, title: 'A' };
  assert.deepEqual(await saveListItem({ listId: null, userId: 'u1', item }), { data: null, error: null, row: null });
  assert.deepEqual(await saveListItem({ listId: 'l1', userId: null, item }), { data: null, error: null, row: null });
  assert.deepEqual(await saveListItem({ listId: 'l1', userId: 'u1', item: {} }), { data: null, error: null, row: null });
  assert.deepEqual(await saveListItem({ listId: 'l1', userId: 'u1', item: null }), { data: null, error: null, row: null });
});

test('deleteListItem short-circuits to a null error without a listId or a truthy tmdbId', async () => {
  assert.deepEqual(await deleteListItem({ listId: null, tmdbId: 5 }), { error: null });
  assert.deepEqual(await deleteListItem({ listId: 'l1', tmdbId: null }), { error: null });
  assert.deepEqual(await deleteListItem({ listId: 'l1', tmdbId: 0 }), { error: null }, 'tmdbId 0 is falsy and treated the same as missing');
});

test('findHistoryEntry returns null without a userId or a truthy tmdbId', async () => {
  assert.equal(await findHistoryEntry({ userId: null, tmdbId: 5, mediaType: 'movie' }), null);
  assert.equal(await findHistoryEntry({ userId: 'u1', tmdbId: null, mediaType: 'movie' }), null);
  assert.equal(await findHistoryEntry({ userId: 'u1', tmdbId: 0, mediaType: 'movie' }), null);
});

test('logWatchedItem short-circuits to a null row without a userId or a resolvable media item', async () => {
  assert.deepEqual(await logWatchedItem({ userId: null, item: { id: 1, title: 'A' } }), { data: null, error: null, row: null });
  assert.deepEqual(await logWatchedItem({ userId: 'u1', item: {} }), { data: null, error: null, row: null });
  assert.deepEqual(await logWatchedItem({ userId: 'u1', item: null }), { data: null, error: null, row: null });
});
