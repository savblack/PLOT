import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomListRecord, createdListRevert, deleteCustomListRecord, customListCreationError, isCustomListLimitError, isSmartListPremiumError, CUSTOM_LIST_LIMIT_CODE, SMART_LIST_PREMIUM_CODE } from '../../customListCreation.js';
import { CUSTOM_LISTS } from '../../copy/customLists.js';

function client(result, permission = { data: false, error: null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      return { insert(row) {
        calls.push(row);
        return { select: () => ({ single: async () => result }) };
      } };
    },
    async rpc(name) { calls.push(name); return permission; },
  };
}

test('successful creation trims the name and preserves the owner', async () => {
  const db = client({ data: { id: 'new-list' }, error: null });
  assert.deepEqual(await createCustomListRecord(db, 'owner', '  Weekend  '), { id: 'new-list' });
  assert.deepEqual(db.calls, ['user_custom_lists', { user_id: 'owner', name: 'Weekend' }]);
});

test('a concurrent insert rejected by the cap produces the shared coming-soon message', async () => {
  const db = client({ error: { code: 'P0001', message: CUSTOM_LIST_LIMIT_CODE } });
  await assert.rejects(createCustomListRecord(db, 'owner', 'Sixth'), error => {
    assert.equal(error.code, CUSTOM_LIST_LIMIT_CODE);
    assert.equal(customListCreationError(error, 'fallback'), CUSTOM_LISTS.limitMessage);
    assert.equal(isCustomListLimitError(error), true);
    assert.match(error.message, /5 custom lists.*planned for plot Premium/);
    return true;
  });
  assert.equal(db.calls.length, 2);
});

test('older RLS cap rejection checks the current server allowance', async () => {
  const db = client({ error: { code: '42501' } });
  await assert.rejects(createCustomListRecord(db, 'owner', 'Sixth'), { code: CUSTOM_LIST_LIMIT_CODE });
  assert.equal(db.calls.at(-1), 'can_create_custom_list');
});

test('unrelated permission failures and failed entitlement checks are not called a cap', async () => {
  for (const permission of [{ data: true }, { data: false, error: { message: 'offline' } }]) {
    const failure = { code: '42501', message: 'access denied' };
    await assert.rejects(createCustomListRecord(client({ error: failure }, permission), 'owner', 'List'), error => error === failure);
    assert.equal(customListCreationError(failure, 'Could not create'), 'Could not create');
  }
});

test('network/database failures are preserved', async () => {
  const failure = { code: 'NETWORK_ERROR', message: 'offline' };
  const db = client({ error: failure });
  await assert.rejects(createCustomListRecord(db, 'owner', 'List'), error => error === failure);
  assert.equal(db.calls.length, 2);
});

test('only the cap code counts as a list-limit error', () => {
  assert.equal(isCustomListLimitError({ code: CUSTOM_LIST_LIMIT_CODE }), true);
  assert.equal(isCustomListLimitError({ code: '42501' }), false);
  assert.equal(isCustomListLimitError(new Error('network')), false);
  assert.equal(isCustomListLimitError(null), false);
});

test('a smart list sends its rules with the insert', async () => {
  const db = client({ data: { id: 'smart' }, error: null });
  const rules = { v: 1, source: 'discover', mediaType: 'movie', genreIds: [] };
  await createCustomListRecord(db, 'owner', ' Friday ', { rules });
  assert.deepEqual(db.calls, ['user_custom_lists', { user_id: 'owner', name: 'Friday', rules }]);
});

test('the database refusing smart list rules becomes the Premium gate', async () => {
  const db = client({ error: { code: 'P0001', message: SMART_LIST_PREMIUM_CODE } });
  await assert.rejects(createCustomListRecord(db, 'owner', 'Smart', { rules: { v: 1 } }), error => {
    assert.equal(isSmartListPremiumError(error), true);
    assert.equal(isCustomListLimitError(error), false);
    return true;
  });
});

/* ── Deleting, for Delete list and for undoing a create ── */

function deleteClient(error = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        delete() {
          const filters = [];
          const chain = {
            eq(column, value) { filters.push([column, value]); return chain; },
            then(resolve, reject) { calls.push({ table, filters }); return Promise.resolve({ error }).then(resolve, reject); },
          };
          return chain;
        },
      };
    },
  };
}

test('deleteCustomListRecord deletes only the owner\'s list, by id', async () => {
  const db = deleteClient();
  await deleteCustomListRecord(db, 'owner', 'list-1');
  assert.deepEqual(db.calls, [{ table: 'user_custom_lists', filters: [['id', 'list-1'], ['user_id', 'owner']] }]);
});

test('deleteCustomListRecord surfaces a refused delete', async () => {
  const db = deleteClient({ code: '42501', message: 'rls' });
  await assert.rejects(deleteCustomListRecord(db, 'owner', 'list-1'), error => error.code === '42501');
});

test('createdListRevert deletes first, then puts the screen back; a failed delete leaves it', async () => {
  const order = [];
  const ok = deleteClient();
  await createdListRevert({ client: ok, userId: 'owner', listId: 'l1', onReverted: () => order.push('reverted') })();
  assert.equal(ok.calls.length, 1);
  assert.deepEqual(order, ['reverted']);

  const refused = deleteClient({ code: '42501', message: 'rls' });
  await assert.rejects(createdListRevert({ client: refused, userId: 'owner', listId: 'l1', onReverted: () => order.push('again') })());
  assert.deepEqual(order, ['reverted'], 'the list is still there, so the screen keeps it');
});
