import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configure } from '../../config.js';
import { updateProfile } from '../../profile.js';
import {
  validateAvatarFile, isDuplicateUsernameError, AVATAR_MAX_MB,
} from '../../profileFields.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

/* Settings and the public profile page both wrote `profiles` directly, to the
 * same columns, with different rules. These pin the two that diverged in ways
 * a user could feel: which files are accepted as an avatar, and how a taken
 * username is recognised. */

const MB = 1024 * 1024;

/* ── Avatar validation ── */

test('validateAvatarFile accepts a normal image', () => {
  assert.deepEqual(validateAvatarFile({ type: 'image/png', size: 2 * MB }), { ok: true });
});

test('validateAvatarFile rejects a file over the cap', () => {
  // The gap that mattered: Settings rejected this, the profile page uploaded it.
  const result = validateAvatarFile({ type: 'image/heic', size: 20 * MB });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-large');
  assert.equal(result.maxMb, AVATAR_MAX_MB);
});

test('validateAvatarFile rejects a non-image', () => {
  const result = validateAvatarFile({ type: 'application/pdf', size: 1024 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-image');
});

test('validateAvatarFile rejects a missing file rather than throwing', () => {
  assert.equal(validateAvatarFile(null).reason, 'missing');
  assert.equal(validateAvatarFile(undefined).reason, 'missing');
});

test('validateAvatarFile treats a file with no type as not an image', () => {
  assert.equal(validateAvatarFile({ size: 10 }).reason, 'not-image');
});

test('validateAvatarFile honours a caller-supplied cap', () => {
  assert.equal(validateAvatarFile({ type: 'image/jpeg', size: 2 * MB }, { maxMb: 1 }).reason, 'too-large');
});

/* ── Duplicate username ── */

test('isDuplicateUsernameError recognises the Postgres unique-violation code', () => {
  assert.equal(isDuplicateUsernameError({ code: '23505', message: 'whatever' }), true);
});

test('isDuplicateUsernameError still recognises the message when no code is given', () => {
  // The profile page only ever saw the message, so both shapes must work.
  assert.equal(isDuplicateUsernameError({ message: 'duplicate key value violates unique constraint' }), true);
});

test('isDuplicateUsernameError does not claim an unrelated failure is a taken username', () => {
  // /duplicate/i alone would have matched nothing here, but a permission error
  // must not be reported to the user as "that username is taken".
  assert.equal(isDuplicateUsernameError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isDuplicateUsernameError(null), false);
  assert.equal(isDuplicateUsernameError({}), false);
});

/* ── The write ── */

function withProfiles(rows = []) {
  const client = createInMemorySupabase({ tables: { profiles: rows } });
  configure({ supabaseClient: client });
  return client;
}

test('updateProfile patches only the given user and returns the updated row', async () => {
  const client = withProfiles([
    { id: 'u1', display_name: 'Old', region: 'AU' },
    { id: 'u2', display_name: 'Other', region: 'US' },
  ]);

  const { data, error } = await updateProfile({ userId: 'u1', patch: { display_name: 'New' } });

  assert.equal(error, null);
  assert.equal(data.display_name, 'New');
  assert.equal(data.region, 'AU', 'unpatched columns are left alone');
  assert.equal(client.__db.tables.profiles.find(r => r.id === 'u2').display_name, 'Other');
});

test('updateProfile surfaces the error instead of reporting success', async () => {
  const client = withProfiles([{ id: 'u1' }]);
  client.failNext('profiles', 'update', { code: '23505', message: 'duplicate key' });

  const { data, error } = await updateProfile({ userId: 'u1', patch: { username: 'taken' } });

  assert.equal(data, null);
  assert.equal(isDuplicateUsernameError(error), true);
});

test('updateProfile does not write when there is nothing to change', async () => {
  const client = withProfiles([{ id: 'u1' }]);
  client.failNext('profiles', 'update', { message: 'should not run' });

  assert.deepEqual(await updateProfile({ userId: 'u1', patch: {} }), { data: null, error: null });
  assert.deepEqual(await updateProfile({ userId: null, patch: { a: 1 } }), { data: null, error: null });
});

/* ── The structural half ──────────────────────────────────────────────────
   Same reasoning as the history-writer guard: concentrating the write only
   helps until the next screen open-codes its own. Thirty call sites drifted
   into two validation regimes precisely because nothing stopped them. */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SANCTIONED = new Set(['packages/core/profile.js']);
const SCAN_ROOTS = ['apps/web/src', 'apps/mobile', 'packages/core'];
const SOURCE_EXT = /\.(js|jsx|ts|tsx)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'ios', 'android', '.expo', 'tests']);

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

/** Find `.from('profiles')` followed by a write op within the next few lines. */
export function findProfileWrites(source) {
  const lines = source.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (!/\.from\(\s*['"`]profiles['"`]\s*\)/.test(line)) return;
    if (/\.(insert|upsert|update|delete)\s*\(/.test(lines.slice(i, i + 4).join('\n'))) hits.push(i + 1);
  });
  return hits;
}

test('the profile-write detector recognises a write and ignores a read', () => {
  assert.deepEqual(findProfileWrites("supabase.from('profiles').update(p).eq('id', id)"), [1]);
  assert.deepEqual(findProfileWrites("supabase\n  .from('profiles')\n  .update(p)"), [2]);
  assert.deepEqual(findProfileWrites("supabase.from('profiles').select('*').eq('id', id)"), []);
});

test('no module outside packages/core/profile.js writes the profiles table directly', () => {
  const offenders = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(join(REPO_ROOT, root))) {
      const rel = relative(REPO_ROOT, file);
      if (SANCTIONED.has(rel)) continue;
      for (const line of findProfileWrites(readFileSync(file, 'utf8'))) offenders.push(`${rel}:${line}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'Write profiles through updateProfile in @plot/core/profile.js:\n  ' + offenders.join('\n  '),
  );
});
