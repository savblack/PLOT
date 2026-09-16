import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPORT_STEPS, runDataExport } from '../../../../supabase/functions/export-user-data/collect.js';

function createExportClient({ rowsByTable = {}, failingTable = null } = {}) {
  const calls = [];

  const client = {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              calls.push({ table, method: 'eq', column, value });
              const result = failingTable === table ? { error: { message: `failed:${table}` } } : { data: rowsByTable[table] ?? [], error: null };
              if (table !== 'private_title_notes') return result;
              return {
                order() { return this; },
                async range(start, end) { return result.error ? result : { data: result.data.slice(start, end + 1) }; },
              };
            },
            async or(filter) {
              calls.push({ table, method: 'or', filter });
              if (failingTable === table) return { error: { message: `failed:${table}` } };
              return { data: rowsByTable[table] ?? [], error: null };
            },
          };
        },
      };
    },
  };

  return { client, calls };
}

test('runDataExport reads every export step in order, scoped to the user', async () => {
  const { client, calls } = createExportClient();

  const result = await runDataExport(client, 'user-123');

  assert.equal(result.error, undefined);
  assert.deepEqual(
    calls.map((call) => call.table),
    EXPORT_STEPS.map((step) => step.table),
  );
  assert.deepEqual(calls.at(0), { table: 'profiles', method: 'eq', column: 'id', value: 'user-123' });
  assert.deepEqual(calls.find((call) => call.table === 'broadcast_preferences'), { table: 'broadcast_preferences', method: 'eq', column: 'user_id', value: 'user-123' });
  assert.deepEqual(calls.at(-1), { table: 'feedback', method: 'eq', column: 'user_id', value: 'user-123' });
  const followsCall = calls.find((call) => call.table === 'follows');
  assert.deepEqual(followsCall, { table: 'follows', method: 'or', filter: 'follower_id.eq.user-123,following_id.eq.user-123' });
});

test('runDataExport strips secret columns from profiles and media_integrations', async () => {
  const { client } = createExportClient({
    rowsByTable: {
      profiles: [{ id: 'user-123', username: 'sav', calendar_token: 'secret-token' }],
      media_integrations: [{
        id: 'int-1',
        provider: 'trakt',
        display_name: 'Trakt',
        device_token_hash: 'hash',
        trakt_token_ciphertext: 'cipher',
        trakt_refresh_ciphertext: 'cipher2',
        plex_token_ciphertext: 'cipher3',
        auth_pin_code: '1234',
      }],
    },
  });

  const result = await runDataExport(client, 'user-123');

  assert.deepEqual(result.data.profiles, [{ id: 'user-123', username: 'sav' }]);
  assert.deepEqual(result.data.media_integrations, [{ id: 'int-1', provider: 'trakt', display_name: 'Trakt' }]);
});

test('runDataExport returns the failing table and stops on the first read error', async () => {
  const { client, calls } = createExportClient({ failingTable: 'history' });

  const result = await runDataExport(client, 'user-123');

  assert.equal(result.table, 'history');
  assert.equal(result.error?.message, 'failed:history');
  assert.equal(calls.some((call) => call.table === 'feedback'), false);
});

test('private notes are included only in the authenticated owner export', async () => {
  const { client, calls } = createExportClient({ rowsByTable: { private_title_notes: [{ user_id: 'owner', note: 'fictional personal note' }] } });
  const result = await runDataExport(client, 'owner');
  assert.equal(result.data.private_title_notes[0].note, 'fictional personal note');
  assert.deepEqual(calls.find(call => call.table === 'private_title_notes'), { table: 'private_title_notes', method: 'eq', column: 'user_id', value: 'owner' });
});


test('private note exports read past the response page limit', async () => {
  const rows = Array.from({ length: 1001 }, (_, revision) => ({ note: `fictional note ${revision}` }));
  const { client } = createExportClient({ rowsByTable: { private_title_notes: rows } });
  const result = await runDataExport(client, 'owner');
  assert.deepEqual(result.data.private_title_notes, rows);
});
