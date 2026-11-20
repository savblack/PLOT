import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIST_SELECTION_KINDS,
  addTargets,
  isAllSelected,
  listSelectionKind,
  runBulk,
  selectableIds,
  toggleAllSelection,
  visibleSelection,
} from '../../listSelection.js';

const SMART_RULES = { source: 'discover', mediaType: 'any' };

test('the Watchlist is selectable by its route key', () => {
  assert.equal(listSelectionKind({ key: 'want' }), LIST_SELECTION_KINDS.WATCHLIST);
});

test('a hand-made list of your own is custom; with other people on it, shared', () => {
  assert.equal(listSelectionKind({ list: { role: 'owner', people: [] }, userId: 'me' }), 'custom');
  assert.equal(listSelectionKind({ list: { role: 'owner', people: [{ user_id: 'me' }] }, userId: 'me' }), 'custom');
  assert.equal(listSelectionKind({ list: { role: 'owner', people: [{ user_id: 'me' }, { user_id: 'friend' }] }, userId: 'me' }), 'shared');
  assert.equal(listSelectionKind({ list: { role: 'member' }, userId: 'me' }), 'shared');
});

test('smart lists, missing lists and other keys have no selection', () => {
  assert.equal(listSelectionKind({ list: { rules: SMART_RULES } }), null);
  assert.equal(listSelectionKind({ list: null }), null);
  assert.equal(listSelectionKind({ key: 'favorites' }), null);
  assert.equal(listSelectionKind(), null);
});

test('selectableIds keeps visible titles once each, in order, as numbers', () => {
  const items = [{ tmdb_id: 3 }, { tmdb_id: '7' }, { tmdb_id: 3 }, { tmdb_id: null }, {}, null, { tmdb_id: 'x' }];
  assert.deepEqual(selectableIds(items), [3, 7]);
  assert.deepEqual(selectableIds(null), []);
});

test('visibleSelection drops selected titles a filter has since hidden', () => {
  assert.deepEqual(visibleSelection(new Set([9, 1, 5]), [1, 2, 5]), [1, 5]);
  assert.deepEqual(visibleSelection([], [1, 2]), []);
});

test('Select all selects every visible title, and clears once all are selected', () => {
  const ids = [1, 2, 3];
  assert.equal(isAllSelected(new Set([1, 2]), ids), false);
  assert.deepEqual([...toggleAllSelection(new Set([1]), ids)], [1, 2, 3]);
  assert.equal(isAllSelected(new Set([1, 2, 3, 99]), ids), true);
  assert.equal(toggleAllSelection(new Set(ids), ids).size, 0);
  assert.equal(isAllSelected(new Set(), []), false, 'an empty list is never "all selected"');
});

test('addTargets skips the current list and smart lists, and counts what each is missing', () => {
  const lists = [
    { id: 'here', items: [{ tmdb_id: 1 }] },
    { id: 'a', items: [{ tmdb_id: 1 }] },
    { id: 'b', items: [{ tmdb_id: 1 }, { tmdb_id: 2 }] },
    { id: 'smart', rules: SMART_RULES, items: [] },
    { id: 'c' },
  ];
  const targets = addTargets(lists, [1, 2], 'here');
  assert.deepEqual(targets.map(t => t.list.id), ['a', 'b', 'c']);
  assert.deepEqual(targets.map(t => t.missing), [[2], [], [1, 2]]);
  assert.deepEqual(addTargets(null, [1]), []);
});

test('runBulk runs one write at a time and splits successes from failures', async () => {
  const order = [];
  let running = 0;
  const result = await runBulk([1, 2, 3, 4], async (id) => {
    running += 1;
    assert.equal(running, 1, 'never two writes at once');
    order.push(id);
    await new Promise(r => setTimeout(r, 1));
    running -= 1;
    if (id === 2) return false;
    if (id === 3) throw new Error('network');
    return true;
  });
  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.deepEqual(result, { succeeded: [1, 4], failed: [2, 3] });
});

test('runBulk with nothing selected does nothing', async () => {
  let calls = 0;
  const result = await runBulk([], async () => { calls += 1; return true; });
  assert.equal(calls, 0);
  assert.deepEqual(result, { succeeded: [], failed: [] });
});
