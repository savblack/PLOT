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
              return this;
            },
            or(filter) {
              calls.push({ table, method: 'or', filter });
              return this;
            },
            order() { return this; },
            async range(from, to) {
              if (failingTable === table) return { error: { message: `failed:${table}` } };
              return { data: (rowsByTable[table] ?? []).slice(from, to + 1), error: null };
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
