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
