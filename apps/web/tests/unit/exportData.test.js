import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUserDataExport, parseExportError, exportFilename } from '../../src/utils/exportData.js';

function createSupabase({ session = { access_token: 'token-123' } } = {}) {
  return {
    auth: {
      async getSession() {
        return { data: { session } };
      },
    },
  };
}

test('parseExportError prefers JSON payload errors', async () => {
  const error = await parseExportError({
    async json() {
      return { error: 'Export failed upstream.' };
    },
    async text() {
      return 'fallback';
    },
  });

  assert.equal(error, 'Export failed upstream.');
});

test('fetchUserDataExport reports an expired session before calling fetch', async () => {
  const supabase = createSupabase({ session: null });
  let fetchCalls = 0;

  const result = await fetchUserDataExport({
    supabase,
    exportUrl: 'https://example.com/export-user-data',
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('should not run');
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /session has expired/i);
  assert.equal(fetchCalls, 0);
});

test('fetchUserDataExport reports a missing endpoint without calling fetch', async () => {
  const supabase = createSupabase();
  let fetchCalls = 0;

  const result = await fetchUserDataExport({
    supabase,
    exportUrl: null,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('should not run');
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /not configured/i);
  assert.equal(fetchCalls, 0);
});

test('fetchUserDataExport surfaces the error body when the request fails', async () => {
  const supabase = createSupabase();

  const result = await fetchUserDataExport({
    supabase,
    exportUrl: 'https://example.com/export-user-data',
    fetchImpl: async () => ({
      ok: false,
      async json() {
        return { error: 'Export endpoint returned 500.' };
      },
      async text() {
        return '';
      },
    }),
  });

  assert.deepEqual(result, { ok: false, error: 'Export endpoint returned 500.' });
});

test('fetchUserDataExport returns the parsed payload on success', async () => {
  const supabase = createSupabase();
  const payload = { export_version: 1, data: { lists: [] } };

  const result = await fetchUserDataExport({
    supabase,
    exportUrl: 'https://example.com/export-user-data',
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer token-123');
      return {
        ok: true,
        async json() {
          return payload;
        },
      };
    },
  });

  assert.deepEqual(result, { ok: true, payload });
});

test('exportFilename embeds the date stamp', () => {
  const name = exportFilename(new Date('2026-06-18T09:30:00Z'));
  assert.equal(name, 'plot-data-export-2026-06-18.json');
});
