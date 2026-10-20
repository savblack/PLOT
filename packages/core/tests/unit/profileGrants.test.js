import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Every column a client writes to `profiles` must be in the column-level
 * UPDATE grant.
 *
 * Why: 20261014110000 revoked blanket UPDATE on profiles from signed-in users
 * and replaced it with an explicit column list, so a new column is read-only
 * until a migration lists it. Customize Home added profiles.home_layout without
 * that, and every save failed in production with nothing in lint, types or
 * unit tests to say so (fixed by 20261015140000). The write path is all through
 * updateProfile in packages/core/profile.js, so the keys passed to it are the
 * columns a client writes; this compares them against what the migrations
 * have granted. Service-role writers (edge functions, scripts) are not subject
 * to the grant and are not scanned.
 *
 * To fix a failure: add `grant update (<column>) on public.profiles to
 * authenticated;` in the migration that adds the column. Never grant a column
 * a client must not write (is_premium, is_supporter, last_kofi_tip_at). */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATIONS = join(REPO_ROOT, 'supabase/migrations');
const SCAN_ROOTS = ['apps/web/src', 'apps/mobile', 'packages/core'];
const SOURCE_EXT = /\.(js|jsx|ts|tsx)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'ios', 'android', '.expo', 'tests']);
const SANCTIONED = new Set(['packages/core/profile.js']);

/* ── Granted columns, from the migrations in order ── */

const stripSqlComments = (sql) => sql.replace(/--[^\n]*/g, '');
const columnList = (raw) => raw.split(',').map(c => c.trim().replace(/^"|"$/g, '')).filter(Boolean);

/**
 * The set of profiles columns `authenticated` may UPDATE after applying these
 * migrations in the order given. A table-wide `revoke update` clears the set;
 * `grant update (cols)` and `revoke update (cols)` add and remove.
 * @param {string[]} sqlFiles migration contents, oldest first
 */
export function grantedProfileColumns(sqlFiles) {
  const granted = new Set();
  for (const raw of sqlFiles) {
    const sql = stripSqlComments(raw);
    const statements = [
      ...sql.matchAll(/\b(grant|revoke)\s+update\s*(?:\(([^)]*)\))?\s+on\s+(?:table\s+)?(?:public\.)?profiles\s+(?:to|from)\s+([^;]+);/gi),
    ];
    for (const [, verb, cols, roles] of statements) {
      if (!/\b(authenticated|public)\b/i.test(roles)) continue;
      const adding = verb.toLowerCase() === 'grant';
      if (!cols) { if (!adding) granted.clear(); continue; }
      for (const c of columnList(cols)) { if (adding) granted.add(c); else granted.delete(c); }
    }
  }
  return granted;
}

function migrationSql() {
  return readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    .map(f => readFileSync(join(MIGRATIONS, f), 'utf8'));
}

/* ── Written columns, from the call sites ── */

/** Index of the brace matching the `{` at `open`, skipping strings. -1 if unbalanced. */
function matchingBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

/** The top-level keys of the object literal starting at `open` (shorthand and `key:` forms). */
function objectKeys(src, open) {
  const close = matchingBrace(src, open);
  if (close < 0) return [];
  const body = src.slice(open + 1, close);
  const keys = [];
  let depth = 0;
  let segment = '';
  const flush = () => {
    const m = segment.match(/^\s*(?:\.\.\.\s*)?([A-Za-z_$][\w$]*)\s*(?::|$)/);
    if (m && !segment.trim().startsWith('...')) keys.push(m[1]);
    segment = '';
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const start = i;
      for (i++; i < body.length && body[i] !== ch; i++) if (body[i] === '\\') i++;
      segment += body.slice(start, i + 1);
    } else if ('{[('.includes(ch)) { depth++; segment += ch; }
    else if ('}])'.includes(ch)) { depth--; segment += ch; }
    else if (ch === ',' && depth === 0) flush();
    else segment += ch;
  }
  flush();
  return keys;
}

/** Comments are not code: a doc comment that quotes a call must not count as one. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

/**
 * Columns written by profile writer calls in one source file.
 * Handles an inline `patch: { a, b: 1 }` and a `patch` variable built from an
 * object literal plus later `patch.x = …` assignments.
 * @returns {string[]}
 */
export function profileColumnsWritten(rawSource) {
  const source = stripComments(rawSource);
  const cols = new Set();
  const calls = [...source.matchAll(/\b(?:updateProfile|upsertProfile)\s*\(\s*\{/g)];
  for (const call of calls) {
    const open = call.index + call[0].length - 1;
    const close = matchingBrace(source, open);
    if (close < 0) continue;
    const args = source.slice(open, close + 1);
    const inline = args.match(/\bpatch\s*:\s*\{/);
    if (inline) {
      for (const k of objectKeys(source, open + inline.index + inline[0].length - 1)) cols.add(k);
      continue;
    }
    // `patch` passed by name (shorthand or `patch: patch`): read how it was built.
    for (const decl of source.matchAll(/\b(?:const|let|var)\s+patch\b[^=]*=\s*\{/g)) {
      for (const k of objectKeys(source, decl.index + decl[0].length - 1)) cols.add(k);
    }
    for (const assign of source.matchAll(/\bpatch\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) cols.add(assign[1]);
  }
  return [...cols];
}

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

/* ── Tests ── */

test('grants: a table-wide revoke resets, column grants add, column revokes remove', () => {
  const sql = [
    'grant update on public.profiles to authenticated;',
    'revoke update on public.profiles from anon, authenticated;\n-- grant update (ignored) on public.profiles to authenticated;\ngrant update (bio,\n  region) on public.profiles to authenticated;',
    'grant update (home_layout) on public.profiles to authenticated;\nrevoke update (region) on public.profiles from authenticated;',
    'grant update (other) on public.other_table to authenticated;',
    'grant update (service_only) on public.profiles to service_role;',
  ];
  assert.deepEqual([...grantedProfileColumns(sql)].sort(), ['bio', 'home_layout']);
});

test('writes: inline patch literals, nested values and shorthand', () => {
  const src = `
    await updateProfile({ userId, patch: { region: code } });
    await updateProfile({ userId: user.id, patch: { links: { a: 1, b: [2, 3] }, bio, 'x,y': 1 } });
    await updateProfile({ userId, patch: { home_layout: patch } });
  `;
  assert.deepEqual(profileColumnsWritten(src).sort(), ['bio', 'home_layout', 'links', 'region']);
});

test('writes: a patch variable is read from its literal and later assignments', () => {
  const src = `
    const patch: Record<string, any> = { display_name: name, bio: b };
    if (changed) patch.username = u;
    const { error } = await updateProfile({ userId, patch });
  `;
  assert.deepEqual(profileColumnsWritten(src).sort(), ['bio', 'display_name', 'username']);
});

test('writes: onboarding upsert fields are checked against UPDATE grants', () => {
  const src = `
    const patch = { region, onboarding_complete: true };
    await upsertProfile({ userId, patch });
  `;
  assert.deepEqual(profileColumnsWritten(src).sort(), ['onboarding_complete', 'region']);
});

test('writes: comments that quote a call are ignored, URLs in strings are not mistaken for comments', () => {
  const src = `
    // updateProfile({ userId, patch: { nope: 1 } })
    /* updateProfile({ userId, patch: { alsoNope: 1 } }) */
    const url = 'https://example.com'; await updateProfile({ userId, patch: { region: 'x' } });
  `;
  assert.deepEqual(profileColumnsWritten(src), ['region']);
});

test('writes: files that never call updateProfile contribute nothing', () => {
  assert.deepEqual(profileColumnsWritten("const patch = { nope: 1 }; save(patch);"), []);
});

test('every profiles column a client writes is in the UPDATE grant', () => {
  const granted = grantedProfileColumns(migrationSql());
  assert.ok(granted.size > 10, 'expected the hardening migration to have granted a column list');

  const missing = new Map();
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(join(REPO_ROOT, root))) {
      const rel = relative(REPO_ROOT, file);
      if (SANCTIONED.has(rel)) continue;
      for (const col of profileColumnsWritten(readFileSync(file, 'utf8'))) {
        if (!granted.has(col)) missing.set(col, [...(missing.get(col) ?? []), rel]);
      }
    }
  }
  const report = [...missing].map(([col, files]) => `  ${col}  (written in ${[...new Set(files)].join(', ')})`);
  assert.deepEqual(
    report, [],
    'These profiles columns are written by a client but not granted to `authenticated`, so the write fails in production.\n'
    + 'Add `grant update (<column>) on public.profiles to authenticated;` to the migration that adds the column:\n' + report.join('\n'),
  );
});
