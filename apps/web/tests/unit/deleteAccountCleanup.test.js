import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_CLEANUP_STEPS, removeAvatarObjects, runAccountCleanup } from '../../../../supabase/functions/delete-account/cleanup.js';

function createDeleteClient(failingTable = null, errorCode = null) {
  const calls = [];

  const client = {
    from(table) {
      return {
        delete() {
          return {
            async eq(column, value) {
              calls.push({ table, method: 'eq', column, value });
              return failingTable === table
                ? { error: { message: `failed:${table}`, code: errorCode } }
                : { error: null };
            },
            async or(filter) {
              calls.push({ table, method: 'or', filter });
              return failingTable === table
                ? { error: { message: `failed:${table}`, code: errorCode } }
                : { error: null };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

test('runAccountCleanup deletes user-owned tables in the expected order', async () => {
  const { client, calls } = createDeleteClient();

  const error = await runAccountCleanup(client, 'user-123');

  assert.equal(error, null);
  assert.deepEqual(
    calls.map((call) => call.table),
    ACCOUNT_CLEANUP_STEPS.map((step) => step.table),
  );
  assert.deepEqual(calls.at(-2), { table: 'follows', method: 'or', filter: 'follower_id.eq.user-123,following_id.eq.user-123' });
  assert.deepEqual(calls.at(-1), { table: 'profiles', method: 'eq', column: 'id', value: 'user-123' });
});

test('runAccountCleanup stops before deleting the auth profile when an earlier table deletion fails', async () => {
  const { client, calls } = createDeleteClient('feedback');

  const error = await runAccountCleanup(client, 'user-123');

  assert.equal(error?.table, 'feedback');
  assert.equal(error?.error?.message, 'failed:feedback');
  assert.equal(calls.some((call) => call.table === 'profiles'), false);
});

test('runAccountCleanup skips a missing legacy history board', async () => {
  const { client, calls } = createDeleteClient('history_board', 'PGRST205');

  assert.equal(await runAccountCleanup(client, 'user-123'), null);
  assert.equal(calls.at(-1)?.table, 'profiles');
});

test('runAccountCleanup reports other legacy history board errors', async () => {
  const { client, calls } = createDeleteClient('history_board', '42501');

  assert.equal((await runAccountCleanup(client, 'user-123'))?.table, 'history_board');
  assert.equal(calls.some((call) => call.table === 'profiles'), false);
});

test('removeAvatarObjects clears the user folder before auth deletion', async () => {
  const removed = [];
  const admin = { storage: { from(bucket) {
    assert.equal(bucket, 'avatars');
    return {
      async list(folder) {
        assert.equal(folder, 'user-123');
        return { data: removed.length ? [] : [{ id: 'object-1', name: 'avatar.jpg' }], error: null };
      },
      async remove(paths) { removed.push(...paths); return { error: null }; },
    };
  } } };

  assert.equal(await removeAvatarObjects(admin, 'user-123'), null);
  assert.deepEqual(removed, ['user-123/avatar.jpg']);
});

test('removeAvatarObjects stops when storage deletion fails', async () => {
  const admin = { storage: { from() {
    return {
      async list() { return { data: [{ id: 'object-1', name: 'avatar.jpg' }], error: null }; },
      async remove() { return { error: { message: 'storage failed' } }; },
    };
  } } };

  assert.equal((await removeAvatarObjects(admin, 'user-123'))?.message, 'storage failed');
});
