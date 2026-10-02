import assert from 'node:assert/strict';
import test from 'node:test';

import { configure } from '../../config.js';
import {
  offerUndo, getUndo, dismissUndo, clearUndo, runUndo, createUndoBatch, registerUndo,
  restorableRow, restoreRow, subscribeUndo, UNDO_ACTIONS, _resetUndo,
} from '../../undo.js';
import { UNDO } from '../../copy/undo.js';
import { createdListRevert } from '../../customListCreation.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

function capture() {
  const undone = [];
  const failed = [];
  configure({ onUndo: p => undone.push(p), onActionFailed: p => failed.push(p) });
  return { undone, failed };
}

test.beforeEach(() => _resetUndo());

/* ── The slot ── */

test('a newer offer replaces the older one, and only the live id can act', async () => {
  let reverted = '';
  const first = offerUndo({ action: UNDO_ACTIONS.WATCHLIST_REMOVE, title: 'A', revert: async () => { reverted += 'a'; } });
  const second = offerUndo({ action: UNDO_ACTIONS.FAVOURITE_REMOVE, title: 'B', revert: async () => { reverted += 'b'; } });

  assert.equal(getUndo().id, second);
  assert.equal((await runUndo(first)).ok, false, 'a replaced offer cannot be run');
  dismissUndo(first);
  assert.equal(getUndo().id, second, 'dismissing a stale id leaves the live offer alone');

  assert.equal((await runUndo(second)).ok, true);
  assert.equal(reverted, 'b');
  assert.equal(getUndo(), null);
});

test('runUndo clears the offer before reverting, so a double tap reverts once', async () => {
  let calls = 0;
  const id = offerUndo({ action: UNDO_ACTIONS.HISTORY_REMOVE, revert: async () => { calls += 1; } });
  const [a, b] = await Promise.all([runUndo(id), runUndo(id)]);
  assert.equal(calls, 1);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
});

test('getUndo returns the same object until the offer changes', () => {
  // useSyncExternalStore loops forever on a fresh object per read.
  offerUndo({ action: UNDO_ACTIONS.WATCHING_STOP, revert: async () => {} });
  assert.equal(getUndo(), getUndo());
  assert.equal('revert' in getUndo(), false, 'the revert function is not exposed');
});

test('clearUndo drops whatever is offered and notifies subscribers', () => {
  let notified = 0;
  const off = subscribeUndo(() => { notified += 1; });
  offerUndo({ action: UNDO_ACTIONS.WATCH_PROGRESS, revert: async () => {} });
  clearUndo();
  off();
  assert.equal(getUndo(), null);
  assert.equal(notified, 2);
});

/* ── Opt-in ── */

test('registerUndo does nothing unless the caller asked', () => {
  registerUndo(undefined, { action: UNDO_ACTIONS.WATCHLIST_REMOVE, revert: async () => {} });
  registerUndo(false, { action: UNDO_ACTIONS.WATCHLIST_REMOVE, revert: async () => {} });
  assert.equal(getUndo(), null, 'a removal inside Mark as watched must not offer an undo');
  registerUndo(true, { action: UNDO_ACTIONS.WATCHLIST_REMOVE, title: 'Dune', revert: async () => {} });
  assert.equal(getUndo().title, 'Dune');
});

test('a batch becomes one offer covering every removal, reverted in order', async () => {
  const order = [];
  const batch = createUndoBatch({ action: UNDO_ACTIONS.WATCHLIST_REMOVE });
  for (const t of ['A', 'B', 'C']) registerUndo(batch, { action: batch.action, title: t, revert: async () => { order.push(t); } });
  assert.equal(getUndo(), null, 'nothing is offered until the batch is');

  const id = batch.offer();
  assert.equal(getUndo().count, 3);
  assert.equal(getUndo().title, undefined);
  await runUndo(id);
  assert.deepEqual(order, ['A', 'B', 'C']);
});

test('an empty batch offers nothing, and a batch of one keeps its title', () => {
  assert.equal(createUndoBatch({ action: UNDO_ACTIONS.WATCHLIST_REMOVE }).offer(), null);
  const one = createUndoBatch({ action: UNDO_ACTIONS.LIST_ITEM_REMOVE });
  one.add({ title: 'Alien', revert: async () => {} });
  one.offer({ meta: { listName: 'Sci-fi' } });
  assert.equal(getUndo().title, 'Alien');
  assert.equal(getUndo().meta.listName, 'Sci-fi');
});

/* ── Analytics ── */

test('a successful undo reports action_undone and nothing else', async () => {
  const { undone, failed } = capture();
  const id = offerUndo({ action: UNDO_ACTIONS.FAVOURITE_REMOVE, count: 2, revert: async () => {} });
  await runUndo(id);
  assert.equal(undone.length, 1);
  assert.equal(undone[0].action, 'favourite_remove');
  assert.equal(undone[0].count, 2);
  assert.equal(typeof undone[0].elapsed_ms, 'number');
  assert.deepEqual(failed, []);
});

test('a failed undo reports action_failed with the action it was undoing', async () => {
  const { undone, failed } = capture();
  const id = offerUndo({ action: UNDO_ACTIONS.HISTORY_REMOVE, revert: async () => { throw Object.assign(new Error('rls'), { code: '42501' }); } });
  const result = await runUndo(id);
  assert.equal(result.ok, false);
  assert.deepEqual(undone, []);
  assert.deepEqual(failed, [{ action: 'undo', error_kind: 'permission', error_code: '42501', undone_action: 'history_remove' }]);
});

/* ── Restoring rows ── */

test('restorableRow keeps the table\'s columns and timestamps, drops id and extras', () => {
  const row = restorableRow('list_items', {
    id: 'li1', list_id: 'l1', user_id: 'u1', tmdb_id: 5, media_type: 'movie', title: 'T',
    provider_ids: [8], created_at: '2026-09-01T10:00:00Z', _local: true, genre_ids: [18],
  });
  assert.equal('id' in row, false);
  assert.equal('_local' in row, false);
  assert.deepEqual(row.provider_ids, [8]);
  assert.equal(row.created_at, '2026-09-01T10:00:00Z');
});

test('restoreRow refuses history, which only the sanctioned writers may touch', async () => {
  await assert.rejects(() => restoreRow('history', { user_id: 'u1' }), /not restorable/);
});

test('restoreHistoryEntry brings back the rating, review and date, and signals it', async () => {
  const { restoreHistoryEntry } = await import('../../userMedia.js');
  const { on, HISTORY_CHANGED_EVENT } = await import('../../events.js');
  const client = createInMemorySupabase({ tables: { history: [] } });
  configure({ supabaseClient: client });
  let signalled = 0;
  const off = on(HISTORY_CHANGED_EVENT, () => { signalled += 1; });

  await restoreHistoryEntry({ id: 44, user_id: 'u1', tmdb_id: 9, media_type: 'movie', title: 'M', rating: 7, note: 'Tense.', dnf: false, watched_at: '2026-08-02' });
  off();
  const [row] = client.__db.tables.history;
  assert.equal(row.rating, 7);
  assert.equal(row.note, 'Tense.');
  assert.equal(row.watched_at, '2026-08-02');
  assert.notEqual(row.id, 44, 'the row gets a fresh id');
  assert.equal(signalled, 1);
});

test('restoreRow puts a removed row back, and treats "already back" as success', async () => {
  const client = createInMemorySupabase({ tables: { user_favourites: [] } });
  configure({ supabaseClient: client });
  const removed = { id: 'f1', user_id: 'u1', tmdb_id: 7, media_type: 'movie', title: 'X', poster_path: null, genre_ids: [], created_at: '2026-01-01' };

  await restoreRow('user_favourites', removed);
  assert.equal(client.__db.tables.user_favourites.length, 1);
  assert.equal(client.__db.tables.user_favourites[0].created_at, '2026-01-01');

  client.failNext('user_favourites', 'insert', { code: '23505', message: 'duplicate' });
  await assert.doesNotReject(() => restoreRow('user_favourites', removed));

  client.failNext('user_favourites', 'insert', { code: '42501', message: 'rls' });
  await assert.rejects(() => restoreRow('user_favourites', removed));
});

/* ── Copy ── */

test('the toast message names the title, the list, and spells favourites by region', () => {
  assert.equal(UNDO.message({ action: 'watchlist_remove', count: 1, title: 'Dune' }), 'Removed Dune from Want to Watch.');
  assert.equal(UNDO.message({ action: 'watchlist_remove', count: 4 }), 'Removed 4 titles from Want to Watch.');
  assert.equal(UNDO.message({ action: 'list_item_remove', count: 1, title: 'Alien', meta: { listName: 'Sci-fi' } }), 'Removed Alien from Sci-fi.');
  assert.equal(UNDO.message({ action: 'favourite_remove', count: 1, title: 'Heat' }, 'US'), 'Removed Heat from favorites.');
  assert.equal(UNDO.message({ action: 'favourite_remove', count: 1, title: 'Heat' }, 'GB'), 'Removed Heat from favourites.');
  assert.equal(UNDO.message({ action: 'watch_progress', count: 1, title: 'Severance', meta: { season: 2, episode: 3 } }), 'Severance is now on S2 E3.');
  for (const action of Object.values(UNDO_ACTIONS)) {
    assert.doesNotMatch(UNDO.message({ action, count: 2 }), /—/, 'no em dashes in user-facing copy');
  }
});

/* ── Creating a list ── */

test('creating a list or a smart list has its own undo kind and message', () => {
  assert.equal(UNDO_ACTIONS.LIST_CREATE, 'list_create');
  assert.equal(UNDO_ACTIONS.SMART_LIST_CREATE, 'smart_list_create');
  assert.equal(UNDO.message({ action: UNDO_ACTIONS.SMART_LIST_CREATE, count: 1, title: 'Short thrillers' }), 'Smart list created.');
  assert.equal(UNDO.message({ action: UNDO_ACTIONS.LIST_CREATE, count: 1, title: 'Weekend' }), 'List created.');
});

test('undoing a created list deletes it once, then reports the undo', async () => {
  const { undone } = capture();
  const deletes = [];
  let restored = 0;
  const db = {
    from: (table) => ({
      delete: () => {
        const filters = {};
        const chain = {
          eq(column, value) { filters[column] = value; return chain; },
          then(resolve) { deletes.push({ table, ...filters }); return Promise.resolve({ error: null }).then(resolve); },
        };
        return chain;
      },
    }),
  };
  registerUndo(true, {
    action: UNDO_ACTIONS.SMART_LIST_CREATE,
    title: 'Short thrillers',
    revert: createdListRevert({ client: db, userId: 'owner', listId: 'l1', onReverted: () => { restored += 1; } }),
  });
  const offer = getUndo();
  assert.equal(offer.action, 'smart_list_create');
  assert.equal((await runUndo(offer.id)).ok, true);
  assert.equal((await runUndo(offer.id)).ok, false, 'a second tap does nothing');
  assert.deepEqual(deletes, [{ table: 'user_custom_lists', id: 'l1', user_id: 'owner' }]);
  assert.equal(restored, 1);
  assert.equal(undone[0].action, 'smart_list_create');
});

test('a batch offers a created list only when the caller is done with it', async () => {
  const batch = createUndoBatch({ action: UNDO_ACTIONS.LIST_CREATE });
  registerUndo(batch, { action: UNDO_ACTIONS.LIST_CREATE, title: 'Dune collection', revert: async () => {} });
  assert.equal(getUndo(), null, 'nothing offered while the films are still being added');
  batch.offer({ meta: { listName: 'Dune collection' } });
  assert.equal(getUndo().action, 'list_create');
  assert.equal(getUndo().count, 1);
});
