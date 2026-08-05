// Pure helpers behind scripts/check-db-write-paths.mjs.
//
// Split out so they can be unit-tested against the real broken and fixed
// definitions of feed_post_from_history() — a guard nobody has watched fail is
// not a guard. See apps/web/tests/unit/dbWritePathChecks.test.js.

/** Normalise a column list into a comparable, order-independent key. */
export function colKey(cols) {
  return String(cols || '')
    .split(',')
    .map(c => c.trim().toLowerCase().replace(/"/g, ''))
    .filter(Boolean)
    .sort()
    .join(',');
}

/**
 * Every `insert into <table> … on conflict (<cols>)` in a function definition.
 *
 * @param {string} def Output of pg_get_functiondef().
 * @returns {{ table: string, key: string }[]}
 */
export function extractConflictTargets(def) {
  const re = /insert\s+into\s+(?:public\.)?([a-z0-9_]+)[\s\S]*?on\s+conflict\s*\(([^)]*)\)/gi;
  return [...String(def || '').matchAll(re)].map(m => ({ table: m[1].toLowerCase(), key: colKey(m[2]) }));
}

/**
 * Tables a function definition reads or writes via an explicit public. prefix.
 *
 * Comments are stripped first: the fix migration's own comment names the old
 * public.journal table while explaining the correction, and flagging that would
 * be a false positive.
 *
 * @param {string} def
 * @returns {string[]}
 */
export function extractTableRefs(def) {
  const body = String(def || '').replace(/--[^\n]*/g, '');
  const refs = [...body.matchAll(/\b(?:from|into|update|join)\s+public\.([a-z0-9_]+)/gi)].map(m => m[1].toLowerCase());
  return [...new Set(refs)];
}

/**
 * Does every on-conflict target in `def` resolve against `constraintsByTable`?
 *
 * @param {string} def
 * @param {Map<string, { name: string, key: string }[]>} constraintsByTable
 * @returns {{ table: string, key: string, matched: string | null }[]}
 */
export function resolveConflictTargets(def, constraintsByTable) {
  return extractConflictTargets(def).map(({ table, key }) => {
    const match = (constraintsByTable.get(table) || []).find(c => c.key === key);
    return { table, key, matched: match ? match.name : null };
  });
}

/* ── The same 42P10 failure, one layer up ────────────────────────────────────
 *
 * The checks above cover trigger functions. Application code names constraints
 * too — `.upsert(rows, { onConflict: 'a,b,c' })` — and drifts the same way, for
 * the same reason: PostgREST answers 42P10 and the write simply never lands, so
 * a stale target is invisible until someone reads the table. The web import
 * spent from 20260727010000 (which dropped history's old constraint) onward
 * upserting against a target that no longer existed, writing nothing.
 */

/** `export const NAME = 'value'` / `const NAME = "value"`, for resolving an
 *  onConflict written as a shared constant rather than a literal. */
export function extractStringConstants(source) {
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"\n]*)['"]/g;
  return new Map([...String(source || '').matchAll(re)].map(m => [m[1], m[2]]));
}

/**
 * Every `.from('<table>')… onConflict: <target>` in application source.
 *
 * The gap between the two is bounded and may not cross another `.from(`, so a
 * later unrelated statement cannot be mistaken for this one's target.
 *
 * @param {string} source
 * @param {Map<string, string>} [constants] Names from extractStringConstants.
 * @returns {{ table: string, key: string | null, raw: string }[]}
 *   `key` is null when the target is an identifier this file cannot resolve.
 */
export function extractAppConflictTargets(source, constants = new Map()) {
  const re = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)(?:(?!\.from\()[\s\S]){0,400}?onConflict\s*:\s*(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))/gi;
  return [...String(source || '').matchAll(re)].map(m => {
    const [, table, literal, ident] = m;
    const raw = literal ?? ident;
    const value = literal ?? constants.get(ident);
    return { table: table.toLowerCase(), key: value == null ? null : colKey(value), raw };
  });
}
