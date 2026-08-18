import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configure } from '../../config.js';
import { on, off, HISTORY_CHANGED_EVENT } from '../../events.js';
import { logWatchedItem, clearWatchHistory } from '../../userMedia.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

/* "Anything that writes history must signal it" was a convention held in four
 * different callers, and it was broken in three of them: ticking an episode,
 * importing a file, and clearing your whole history all left every mounted
 * useHistory serving rows that no longer matched the database.
 *
 * Two halves to keeping it fixed. The behavioural half: the write itself
 * emits, so a caller cannot forget. The structural half: the last test here
 * fails if a new module starts writing the table directly, because that is the
 * only way this regresses now.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function withHistory(rows = []) {
  const client = createInMemorySupabase({ tables: { history: rows } });
  configure({ supabaseClient: client });
  return client;
}

/** Count HISTORY_CHANGED_EVENT emissions while `fn` runs. */
async function countSignals(fn) {
  let count = 0;
  const stop = on(HISTORY_CHANGED_EVENT, () => { count += 1; });
  try { await fn(); } finally { stop(); off(HISTORY_CHANGED_EVENT, stop); }
  return count;
}

test('logWatchedItem signals the change itself, so no caller has to remember', async () => {
  withHistory([]);

  const signals = await countSignals(() => logWatchedItem({
    userId: 'u1',
    item: { id: 42, media_type: 'movie', title: 'A', genre_ids: [18] },
  }));

  assert.equal(signals, 1);
});

test('logWatchedItem does not signal when the write fails', async () => {
  const client = withHistory([]);
  client.failNext('history', 'upsert', { message: 'constraint blew up' });

  const signals = await countSignals(() => logWatchedItem({
    userId: 'u1',
    item: { id: 42, media_type: 'movie', title: 'A' },
  }));

  assert.equal(signals, 0);
});

test('clearWatchHistory deletes the rows and signals', async () => {
  const client = withHistory([
    { user_id: 'u1', tmdb_id: 1, media_type: 'movie' },
    { user_id: 'u1', tmdb_id: 2, media_type: 'movie' },
  ]);

  const signals = await countSignals(() => clearWatchHistory({ userId: 'u1' }));

  assert.equal(signals, 1);
  assert.equal(client.__db.tables.history.length, 0);
});

test('clearWatchHistory leaves other users alone', async () => {
  const client = withHistory([
    { user_id: 'u1', tmdb_id: 1, media_type: 'movie' },
    { user_id: 'u2', tmdb_id: 1, media_type: 'movie' },
  ]);

  await clearWatchHistory({ userId: 'u1' });

  assert.deepEqual(client.__db.tables.history.map(r => r.user_id), ['u2']);
});

test('clearWatchHistory reports the error and does not signal a change that did not happen', async () => {
  const client = withHistory([{ user_id: 'u1', tmdb_id: 1, media_type: 'movie' }]);
  client.failNext('history', 'delete', { message: 'permission denied' });

  let result;
  const signals = await countSignals(async () => { result = await clearWatchHistory({ userId: 'u1' }); });

  assert.equal(result.error.message, 'permission denied');
  assert.equal(signals, 0);
  assert.equal(client.__db.tables.history.length, 1, 'nothing should have been deleted');
});

/* ── The structural half ── */

/* Modules allowed to write the `history` table directly. Everything else must
   go through them, so the signal cannot be skipped. useHistory earns its place
   by owning the per-row edit and delete for entries it already holds, and it
   emits on both. */
const SANCTIONED = new Set([
  'packages/core/userMedia.js',
  'packages/core/importPipeline.js',
  'packages/core/useHistory.js',
  'packages/core/useFavorites.js', // rollback of a write it just made, by row id
]);

const SCAN_ROOTS = ['apps/web/src', 'apps/mobile', 'packages/core'];
const SOURCE_EXT = /\.(js|jsx|ts|tsx)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'ios', 'android', '.expo', 'tests']);
const WRITE_OP = /\.(insert|upsert|update|delete)\s*\(/;

function sourceFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (SOURCE_EXT.test(entry)) acc.push(full);
  }
  return acc;
}

/** Find `.from('history')` followed by a write op within the next few lines. */
export function findHistoryWrites(source) {
  const lines = source.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (!/\.from\(\s*['"`]history['"`]\s*\)/.test(line)) return;
    // The builder chain may wrap; look ahead a little for the operation.
    const window = lines.slice(i, i + 4).join('\n');
    if (WRITE_OP.test(window)) hits.push(i + 1);
  });
  return hits;
}

test('the write detector recognises a chained write and ignores a read', () => {
  assert.deepEqual(findHistoryWrites("await supabase.from('history').delete().eq('user_id', id);"), [1]);
  assert.deepEqual(findHistoryWrites("supabase\n  .from('history')\n  .upsert(row)"), [2]);
  assert.deepEqual(findHistoryWrites("supabase.from('history').select('*').eq('user_id', id)"), []);
});

test('no module outside the sanctioned writers touches the history table directly', () => {
  const offenders = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(join(REPO_ROOT, root))) {
      const rel = relative(REPO_ROOT, file);
      if (SANCTIONED.has(rel)) continue;
      for (const line of findHistoryWrites(readFileSync(file, 'utf8'))) {
        offenders.push(`${rel}:${line}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'Write history through @plot/core/userMedia.js (logWatchedItem / clearWatchHistory) '
      + 'or importPipeline.js, so the change is always signalled:\n  ' + offenders.join('\n  '),
  );
});
