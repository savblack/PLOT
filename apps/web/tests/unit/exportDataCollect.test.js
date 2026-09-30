import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPORT_STEPS, runDataExport } from '../../../../supabase/functions/export-user-data/collect.js';

function createExportClient({ rowsByTable = {}, failingTable = null, inRows = {}, missingTables = [] } = {}) {
  const calls = [];
  const inCalls = [];
  const orders = {};

  const client = {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              calls.push({ table, method: 'eq', column, value });
              return this;
            },
            or(filter) {
              calls.push({ table, method: 'or', filter });
              return this;
            },
            order(column) {
              if (table === 'broadcast_preferences') assert.equal(column, 'user_id');
              (orders[table] ??= []).push(column);
              return this;
            },
            async range(from, to) {
              if (missingTables.includes(table)) return { error: { code: 'PGRST205', message: 'missing' } };
              if (failingTable === table) return { error: { message: `failed:${table}` } };
              return { data: (rowsByTable[table] ?? []).slice(from, to + 1), error: null };
            },
            async in(column, values) {
              inCalls.push([table, column, values]);
              return { data: inRows[table] ?? [], error: null };
            },
          };
        },
      };
    },
  };

  return { client, calls, inCalls, orders };
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


test('free export includes every watch event beyond the database row cap', async () => {
  const watches = Array.from({ length: 2401 }, (_, i) => ({ id: String(i), source_key: `event-${i}`, watched_on: null }));
  const { client, calls } = createExportClient({ rowsByTable: { watch_events: watches } });
  const result = await runDataExport(client, 'user-123');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.data.watch_events, watches);
  assert.equal(calls.filter(call => call.table === 'watch_events').length, 3);
  assert.ok(!EXPORT_STEPS.some(step => step.table === 'history_board'), 'removed table must not break the export');
});

test('free export strips legacy nested Plex server credentials and job leases', async () => {
  const { client } = createExportClient({ rowsByTable: {
    media_integrations: [{ id: 'integration', plex_servers: [{ accessToken: 'secret' }], selected_server: { name: 'Server', clientIdentifier: 'server', accountID: '1', profileName: 'Me', accessToken: 'secret', connections: [{ uri: 'https://example.test/?token=secret' }] } }],
    tracking_jobs: [{ id: 'job', lease_token: 'secret', status: 'queued' }],
  } });
  const result = await runDataExport(client,'owner');
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(result.data.media_integrations[0].selected_server.profileName,'Me');
});

test('free export retains imported annotations and their provenance beyond the row cap', async () => {
  const annotations = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), source_key: `annotation-${index}`, annotation_scope: 'show', annotation: { kind: 'rating', rating: 8, ratedAt: null } }));
  const { client, calls } = createExportClient({ rowsByTable: { imported_annotations: annotations } });
  const result = await runDataExport(client, 'owner');
  assert.deepEqual(result.data.imported_annotations, annotations);
  assert.equal(calls.filter(call => call.table === 'imported_annotations').length, 2);
  assert.deepEqual(EXPORT_STEPS.find(step => step.table === 'imported_annotations').match, { type: 'eq', column: 'user_id' });
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

test('runDataExport includes Watch together rows and shared lists the user is a member of', async () => {
  const rowsByTable = {
    user_custom_list_members: [{ list_id: 'list-9', user_id: 'user-123' }],
    watch_together: [{ requester_id: 'user-123', recipient_id: 'u2', status: 'accepted' }],
  };
  const inRows = {
    user_custom_lists: [{ id: 'list-9', user_id: 'owner', name: 'Jess and Sam' }],
    user_custom_list_items: [{ list_id: 'list-9', tmdb_id: 1, user_id: 'owner', added_by: 'user-123' }],
  };
  const { client, calls, inCalls, orders } = createExportClient({ rowsByTable, inRows });

  const result = await runDataExport(client, 'user-123');

  assert.equal(result.error, undefined);
  assert.deepEqual(result.data.watch_together, rowsByTable.watch_together);
  assert.deepEqual(result.data.shared_custom_lists, inRows.user_custom_lists);
  assert.deepEqual(result.data.shared_custom_list_items, inRows.user_custom_list_items);
  assert.deepEqual(inCalls, [['user_custom_lists', 'id', ['list-9']], ['user_custom_list_items', 'list_id', ['list-9']]]);
  assert.deepEqual(calls.find((c) => c.table === 'watch_together_sessions'), { table: 'watch_together_sessions', method: 'or', filter: 'host_id.eq.user-123,guest_id.eq.user-123' });
  // Three of these tables have composite keys and no id column: paging by id
  // would fail the whole export once their migrations are live.
  assert.deepEqual(orders.watch_together, ['requester_id', 'recipient_id']);
  assert.deepEqual(orders.watch_together_votes, ['session_id', 'tmdb_id', 'media_type']);
  assert.deepEqual(orders.user_custom_list_members, ['list_id']);
  assert.deepEqual(orders.watch_together_sessions, ['id']);
  assert.deepEqual(orders.watch_together_links, ['user_id']);
});

test('runDataExport skips Watch together tables that do not exist yet', async () => {
  const missingTables = ['watch_together', 'watch_together_sessions', 'watch_together_votes', 'watch_together_links', 'user_custom_list_members'];
  const { client } = createExportClient({ missingTables });
  const result = await runDataExport(client, 'user-123');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.data.watch_together, []);
  assert.deepEqual(result.data.shared_custom_lists, []);
});

test('a missing table that is not optional still fails the export', async () => {
  const { client } = createExportClient({ missingTables: ['history'] });
  const result = await runDataExport(client, 'user-123');
  assert.equal(result.table, 'history');
});
