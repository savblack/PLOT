import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_CLEANUP_STEPS, runAccountCleanup } from '../../supabase/functions/delete-account/cleanup.js';

function createDeleteClient(failingTable = null) {
  const calls = [];

  const client = {
    from(table) {
      return {
        delete() {
          return {
            async eq(column, value) {
              calls.push({ table, method: 'eq', column, value });
              return failingTable === table
                ? { error: { message: `failed:${table}` } }
                : { error: null };
            },
            async or(filter) {
              calls.push({ table, method: 'or', filter });
              return failingTable === table
                ? { error: { message: `failed:${table}` } }
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
