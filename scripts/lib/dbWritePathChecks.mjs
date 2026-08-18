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

/* ── What the schema is about to become ──────────────────────────────────────
 *
 * Both checks above resolve against the live database, which is right — a
 * parsed schema is a guess and the whole point is to catch drift from reality.
 * But it makes a PR that adds an upsert and the migration creating its
 * constraint fail until it merges, because the constraint does not exist yet.
 * Every such PR is red on a check that goes green by itself minutes later,
 * which is how a check stops being read.
 *
 * So: read the live schema, then apply the migrations that have not run yet.
 * Only unapplied files are parsed, so a bad regex cannot rewrite history that
 * already happened, and anything unparsed simply leaves the live schema as-is.
 */

/** Strip `-- line` and block comments. Migrations discuss constraints by name
 *  in their own prose — this file's git history is full of it — and a comment
 *  must not read as DDL. */
function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/**
 * Unique-key changes a migration makes: what it adds, and what it removes.
 *
 * Only UNIQUE and PRIMARY KEY shapes count. A CHECK constraint shares the
 * `add constraint <name>` prefix and satisfies no ON CONFLICT, so matching on
 * the constraint type rather than the keyword is what keeps those out.
 *
 * Dynamic DDL (`execute format('… drop constraint %I', …)`) is not parsed and
 * is not meant to be: `%I` is not an identifier, so it never matches, and the
 * result is the live schema unchanged — the same answer as before this existed.
 *
 * @param {string} sql
 * @returns {{ adds: { table: string, name: string, key: string }[], drops: string[] }}
 */
export function extractMigrationKeyChanges(sql) {
  const body = stripSqlComments(sql);
  const adds = [];

  // `create unique index [concurrently] [if not exists] <name> on <table> (cols)`
  const indexRe = /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)/gi;
  for (const m of body.matchAll(indexRe)) {
    adds.push({ table: m[2].toLowerCase(), name: m[1], key: colKey(m[3]) });
  }

  // `alter table <table> … add constraint <name> unique|primary key (cols)`.
  // The table is the nearest `alter table` to the left: one statement can carry
  // several `add constraint` clauses, and they all belong to that table.
  const alters = [...body.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)/gi)]
    .map(m => ({ index: m.index, table: m[1].toLowerCase() }));
  const constraintRe = /add\s+constraint\s+([a-z0-9_]+)\s+(?:unique|primary\s+key)\s*\(([^)]*)\)/gi;
  for (const m of body.matchAll(constraintRe)) {
    let owner = null;
    for (const a of alters) {
      if (a.index > m.index) break;
      owner = a;
    }
    if (owner) adds.push({ table: owner.table, name: m[1], key: colKey(m[2]) });
  }

  const drops = [
    ...body.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi),
    ...body.matchAll(/drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi),
  ].map(m => m[1]);

  return { adds, drops };
}

/**
 * The live schema with every unapplied migration's key changes folded in.
 *
 * Entries gain `pending`, naming the migration that will create them, so a
 * caller can tell "matches a real constraint" from "matches one that is about
 * to exist" and treat the second as information rather than a failure.
 *
 * @param {Map<string, { name: string, key: string }[]>} live
 * @param {{ file: string, sql: string }[]} pendingMigrations In version order.
 * @returns {Map<string, { name: string, key: string, pending?: string }[]>}
 */
export function projectPendingSchema(live, pendingMigrations) {
  const projected = new Map([...live].map(([table, cols]) => [table, [...cols]]));

  for (const { file, sql } of pendingMigrations) {
    const { adds, drops } = extractMigrationKeyChanges(sql);

    // Drops first, then adds — a migration that swaps a key does both, and the
    // add is the one that must survive.
    for (const name of drops) {
      for (const [table, cols] of projected) {
        const kept = cols.filter(c => c.name !== name);
        if (kept.length !== cols.length) projected.set(table, kept);
      }
    }
    for (const { table, name, key } of adds) {
      if (!projected.has(table)) projected.set(table, []);
      const cols = projected.get(table).filter(c => c.name !== name);
      cols.push({ name, key, pending: file });
      projected.set(table, cols);
    }
  }

  return projected;
}
