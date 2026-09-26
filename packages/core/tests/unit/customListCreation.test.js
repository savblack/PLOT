import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomListRecord, customListCreationError, CUSTOM_LIST_LIMIT_CODE } from '../../customListCreation.js';
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
