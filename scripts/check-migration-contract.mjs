// Expand, then contract: a migration may not remove something the deployed
// code still uses.
//
// WHY THIS EXISTS
// A migration merged to main applies to production at once, through the
// Supabase GitHub integration, with no staging gate. The web app deploys from
// the same merge a minute or so later, and iPhones keep running older builds
// for weeks. So a migration that drops, renames or retypes something the code
// on main still reads breaks Plot for real users the moment it lands, and
// nothing before the merge says so: the migration itself applies cleanly.
//
// The safe order is "expand, then contract":
//   1. add the new thing (column, function, value) and ship code that uses it;
//   2. ship code that stops using the old thing;
//   3. only then, in a later migration, remove the old thing.
//
// WHAT IT CHECKS
// Only migrations that are new or changed on this branch (against main), so the
// 180-odd that already applied are not re-litigated. In each, it looks for:
//   - drop table / view / materialized view / function / procedure / type
//   - alter table … drop column
//   - alter table … alter column … type   (a retype can break readers)
//   - rename of a table, column, view, function or type, or of an enum value
//   - a new `not null` column with no default on a table that already exists,
//     and `alter column … set not null` (old code that inserts without the
//     column starts failing)
// For each removed or renamed name it searches:
//   a) the code on main (apps/, packages/, supabase/functions/), with
//      `git grep -w`, generated DB types and Markdown excluded;
//   b) the latest body of every SQL function, and every cron job command, as
//      of this migration. plpgsql resolves names only when a line runs, so a
//      function that still names a dropped column is accepted silently and
//      fails later in production (20261004100000 did exactly that).
//   c) mobile and shared core code in the last MOBILE_DAYS (90) of history,
//      only when (a) and (b) are clean: installed iPhone builds lag main.
// Any hit fails the check. A not-null column always needs an acknowledgement,
// because "does old code insert into this table without it" is not greppable.
// Hits for a column list lines in files that read its table by name first.
//
// It also fails the reverse: a function or cron job defined in this migration
// that names something an earlier migration removed (findDeadReferences).
// Acknowledge a same-named but different thing with
//   -- dead-name-ok: <name> (a jsonb key, not the dropped column)
//
// ACKNOWLEDGING
// When you have done the expand step and are sure, say so in the migration:
//
//   -- contracts: marketing_linear_mirror_lease (the code that used it was removed in #NNNN)
//
// One line per name; the reason in parentheses is required. A qualified name
// (`table.column`) also works. iPhone builds lag main: if the name was used by
// mobile, the reason should say why old builds no longer matter.
//
// Usage:
//   node scripts/check-migration-contract.mjs            new/changed vs main
//   node scripts/check-migration-contract.mjs --base <rev> [--files a.sql b.sql]
//   node scripts/check-migration-contract.mjs --report   print, never fail

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MIGRATIONS_DIR = 'supabase/migrations';
export const CODE_PATHS = ['apps', 'packages', 'supabase/functions'];
// Lists every column of every table, so it would match every name. It is
// regenerated from production after the migration lands anyway.
export const CODE_EXCLUDES = [
  ':(exclude)supabase/functions/_shared/database.types.ts',
  ':(exclude)*.md',
];

// ── SQL text handling ────────────────────────────────────────────────────────

/**
 * Split SQL into statements, dropping comments. Single-quoted strings,
 * double-quoted identifiers and dollar-quoted bodies are kept intact (a `;` or
 * `--` inside them is not a boundary).
 * Each statement has `text` (comment-free) and `bodies` (dollar-quoted parts).
 */
export function splitStatements(sql) {
  const out = [];
  let cur = '';
  let bodies = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      cur += ' ';
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === c && sql[j + 1] === c) { j += 2; continue; }
        if (sql[j] === c) break;
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        const body = sql.slice(i + tag.length, end === -1 ? n : end);
        bodies.push(body);
        cur += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ';') {
      if (cur.trim()) out.push({ text: cur.trim(), bodies });
      cur = '';
      bodies = [];
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push({ text: cur.trim(), bodies });
  return out;
}

/** Remove `--` comments from a function body (outside single quotes). */
export function stripLineComments(text) {
  return text.split('\n').map(line => {
    let inQuote = false;
    for (let k = 0; k < line.length; k++) {
      if (line[k] === "'") inQuote = !inQuote;
      else if (!inQuote && line[k] === '-' && line[k + 1] === '-') return line.slice(0, k);
    }
    return line;
  }).join('\n');
}

/** Blank out dollar-quoted text so DDL inside a function body is not read as the migration's own DDL. */
function blankDollarBodies(text) {
  return text.replace(/(\$[a-zA-Z_]*\$)[\s\S]*?\1/g, '$$$$');
}

/** `begin alter table …` / `if … then drop …` inside a do block -> the statement itself. */
function stripControlFlow(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/^(?:declare\b.*?\bbegin|begin|else|loop|end if|end loop|(?:if|elsif)\b.*?\bthen)\s+/, '');
  } while (s !== prev);
  return s;
}

/** Split a comma list at paren depth 0, ignoring commas inside quotes. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let quote = null;
  for (const ch of text) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const ID = String.raw`(?:"?[a-z_][a-z0-9_]*"?\s*\.\s*)?"?([a-z_][a-z0-9_$]*)"?`;
const unq = s => s.replace(/"/g, '').toLowerCase();

/** Names after `drop <kind> [if exists]`, e.g. `drop function a(int), b()`. */
function dropTargets(rest) {
  return splitTopLevel(rest.replace(/\b(cascade|restrict)\s*$/i, ''))
    .map(p => new RegExp(`^${ID}`, 'i').exec(p.trim()))
    .filter(Boolean)
    .map(m => unq(m[1]));
}

// ── Finding destructive changes in one migration ────────────────────────────

/**
 * @typedef {{ kind: string, name: string, table?: string, detail: string,
 *   alwaysAck?: boolean }} Change
 */

/**
 * Destructive changes in one migration's SQL.
 * Things created in the same migration (a drop-and-recreate, a temp table) are
 * not removals and are skipped.
 * @param {string} sql
 * @returns {Change[]}
 */
export function findChanges(sql) {
  const statements = splitStatements(sql);
  const created = { table: new Set(), function: new Set(), view: new Set(), type: new Set() };
  for (const { text } of statements) {
    const t = text.toLowerCase();
    let m;
    if ((m = new RegExp(`^create\\s+(?:(?:global|local)\\s+)?(?:temp(?:orary)?\\s+|unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${ID}`, 'i').exec(t))) created.table.add(unq(m[1]));
    if ((m = new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:function|procedure)\\s+${ID}`, 'i').exec(t))) created.function.add(unq(m[1]));
    if ((m = new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?${ID}`, 'i').exec(t))) created.view.add(unq(m[1]));
    if ((m = new RegExp(`^create\\s+type\\s+${ID}`, 'i').exec(t))) created.type.add(unq(m[1]));
  }

  /** @type {Change[]} */
  const changes = [];
  const add = c => changes.push(c);

  for (const stmt of statements) {
    // DDL in a `do` block runs as the migration's own; DDL in a function body
    // runs later, on whatever the function is given, so it is not this
    // migration removing anything.
    const isDo = /^do\b/i.test(stmt.text);
    const flat = (isDo ? stmt.text : blankDollarBodies(stmt.text)).toLowerCase().replace(/\s+/g, ' ');
    // A do block can hold several statements.
    const pieces = isDo
      ? splitStatements(stmt.bodies.join(';\n')).map(s => stripControlFlow(s.text.toLowerCase().replace(/\s+/g, ' ')))
      : [flat];

    for (const s of pieces) {
      let m;
      if ((m = /^drop (table|view|materialized view|function|procedure|type|domain) (?:if exists )?(.+)$/.exec(s))) {
        const kind = m[1].replace('materialized view', 'view').replace('procedure', 'function').replace('domain', 'type');
        for (const name of dropTargets(m[2])) {
          // Recreated in the same migration (a view replaced by a table of the
          // same name counts): readers keep working.
          const recreated = kind === 'table' || kind === 'view'
            ? created.table.has(name) || created.view.has(name)
            : created[kind].has(name);
          if (recreated) continue;
          add({ kind: `drop ${kind}`, name, detail: s.slice(0, 120) });
        }
        continue;
      }
      if ((m = new RegExp(`^alter table (?:if exists )?(?:only )?${ID} (.+)$`).exec(s))) {
        const table = unq(m[1]);
        const isNewTable = created.table.has(table);
        const rest = m[2];
        let r;
        if ((r = new RegExp(`^rename to ${ID}`).exec(rest))) {
          if (!isNewTable) add({ kind: 'rename table', name: table, detail: s.slice(0, 120) });
          continue;
        }
        if ((r = new RegExp(`^rename (?:column )?${ID} to `).exec(rest))) {
          if (!isNewTable) add({ kind: 'rename column', name: unq(r[1]), table, detail: s.slice(0, 120) });
          continue;
        }
        for (const clause of splitTopLevel(rest)) {
          if (isNewTable) break;
          let c;
          if ((c = new RegExp(`^drop (?:column )?(?:if exists )?${ID}`).exec(clause)) && !/^drop (constraint|default|not null|identity|expression)\b/.test(clause)) {
            add({ kind: 'drop column', name: unq(c[1]), table, detail: clause.slice(0, 120) });
          } else if ((c = new RegExp(`^alter (?:column )?${ID} (?:set data )?type `).exec(clause))) {
            add({ kind: 'retype column', name: unq(c[1]), table, detail: clause.slice(0, 120) });
          } else if ((c = new RegExp(`^alter (?:column )?${ID} set not null`).exec(clause))) {
            add({ kind: 'set not null', name: unq(c[1]), table, alwaysAck: true, detail: clause.slice(0, 120) });
          } else if ((c = new RegExp(`^add (?:column )?(?:if not exists )?${ID} `).exec(clause))
            && !/^add (constraint|primary|unique|foreign|check|exclude)\b/.test(clause)
            && /\bnot null\b/.test(clause) && !/\bdefault\b/.test(clause) && !/\bgenerated\b/.test(clause)) {
            add({ kind: 'not null without default', name: unq(c[1]), table, alwaysAck: true, detail: clause.slice(0, 120) });
          }
        }
        continue;
      }
      if ((m = new RegExp(`^alter (function|procedure) ${ID}\\s*(?:\\([^)]*\\))? rename to `).exec(s))) {
        add({ kind: 'rename function', name: unq(m[2]), detail: s.slice(0, 120) });
        continue;
      }
      if ((m = new RegExp(`^alter (?:materialized )?view (?:if exists )?${ID} rename to `).exec(s))) {
        add({ kind: 'rename view', name: unq(m[1]), detail: s.slice(0, 120) });
        continue;
      }
      if ((m = new RegExp(`^alter type ${ID} rename value '([^']+)' to `).exec(s))) {
        add({ kind: 'rename enum value', name: m[2], table: unq(m[1]), detail: s.slice(0, 120) });
        continue;
      }
      if ((m = new RegExp(`^alter type ${ID} rename to `).exec(s))) {
        add({ kind: 'rename type', name: unq(m[1]), detail: s.slice(0, 120) });
        continue;
      }
    }
  }
  return changes;
}

/**
 * `-- contracts: <name> (reason)` lines (or another keyword). Returns
 * name -> reason, and the names given without a reason.
 */
export function parseAcknowledgements(sql, keyword = 'contracts') {
  const acks = new Map();
  const missingReason = [];
  const re = new RegExp(`--\\s*${keyword}:\\s*([a-z0-9_."]+)\\s*(\\(([^)]*)\\))?`, 'gi');
  for (const m of sql.matchAll(re)) {
    const name = unq(m[1]);
    const reason = (m[3] || '').trim();
    if (!reason) { missingReason.push(name); continue; }
    acks.set(name, reason);
  }
  return { acks, missingReason };
}

function isAcknowledged(change, acks) {
  if (acks.has(change.name)) return true;
  if (change.table && acks.has(`${change.table}.${change.name}`)) return true;
  return false;
}

// ── Where a name is still used ──────────────────────────────────────────────

/**
 * Latest SQL function bodies and cron commands after applying `files` in order.
 * @param {{ file: string, sql: string }[]} migrations sorted oldest first
 * @returns {Map<string, { source: string, text: string }>} key -> where it lives
 */
export function buildSqlUsers(migrations) {
  const users = new Map();
  for (const { file, sql } of migrations) {
    for (const stmt of splitStatements(sql)) {
      const lower = stmt.text.toLowerCase();
      let m;
      if ((m = new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:function|procedure)\\s+${ID}`, 'i').exec(lower))) {
        const body = stripLineComments(stmt.bodies.join('\n')).toLowerCase();
        users.set(`function ${unq(m[1])}`, { source: file, text: body });
      }
      const dropFn = /^drop\s+(?:function|procedure)\s+(?:if\s+exists\s+)?(.+)$/is.exec(lower);
      if (dropFn) for (const name of dropTargets(dropFn[1].replace(/\s+/g, ' '))) users.delete(`function ${name}`);
      // cron jobs: schedule replaces the job of the same name, unschedule removes it.
      for (const c of lower.matchAll(/cron\.(un)?schedule\s*\(\s*'([^']+)'/g)) {
        const key = `cron job ${c[2]}`;
        if (c[1]) users.delete(key);
        else users.set(key, { source: file, text: stripLineComments(lower.slice(c.index)) });
      }
    }
  }
  return users;
}

/** SQL users (function bodies, cron commands) that mention `name` as a word. */
export function sqlReferences(name, users, { except } = {}) {
  const re = new RegExp(`(^|[^a-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9_$])`);
  const hits = [];
  for (const [key, { source, text }] of users) {
    if (except && key === except) continue;
    if (re.test(text)) hits.push(`${key}  (defined in ${source})`);
  }
  return hits;
}

/** Code on `rev` that mentions `name` as a whole word. */
export function codeReferences(name, rev) {
  try {
    const out = execFileSync('git', ['grep', '-n', '-w', '-I', '-F', '-e', name, rev, '--', ...CODE_PATHS, ...CODE_EXCLUDES], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\n').filter(Boolean).map(l => l.replace(`${rev}:`, ''));
  } catch (e) {
    if (e.status === 1) return []; // git grep: no match
    throw e;
  }
}

// ── Names an earlier migration already removed ──────────────────────────────

/**
 * Track which tables, columns, views, functions and types exist after each
 * migration, and which names were removed along the way. Only what the
 * migrations themselves create and drop is known; that is enough, because a
 * name only becomes "dead" by being dropped here.
 * @param {{ file: string, sql: string }[]} migrations sorted oldest first
 */
export function buildSchemaState(migrations) {
  /** @type {Map<string, Set<string>>} */
  const columns = new Map();
  const objects = new Set(); // tables, views, functions, types
  /** @type {Map<string, string>} name -> "drop column history.x in 2026….sql" */
  const dropped = new Map();
  const drop = (name, what, file) => dropped.set(name, `${what} in ${file}`);

  for (const { file, sql } of migrations) {
    for (const stmt of splitStatements(sql)) {
      const isDo = /^do\b/i.test(stmt.text);
      const pieces = isDo
        ? splitStatements(stmt.bodies.join(';\n')).map(p => stripControlFlow(p.text.toLowerCase().replace(/\s+/g, ' ')))
        : [stmt.text.toLowerCase().replace(/\s+/g, ' ')];
      for (const s of pieces) {
        let m;
        if ((m = new RegExp(`^create (?:(?:global|local) )?(?:temp(?:orary)? |unlogged )?table (?:if not exists )?${ID} ?\\((.*)\\)`).exec(s))) {
          const table = unq(m[1]);
          objects.add(table);
          const cols = columns.get(table) ?? new Set();
          for (const part of splitTopLevel(m[2])) {
            const c = new RegExp(`^${ID}`).exec(part);
            if (c && !/^(constraint|primary|unique|foreign|check|exclude|like)\b/.test(part)) cols.add(unq(c[1]));
          }
          columns.set(table, cols);
          continue;
        }
        if ((m = new RegExp(`^create (?:or replace )?(?:materialized )?(?:view|function|procedure|type|domain) (?:if not exists )?${ID}`).exec(s))) {
          objects.add(unq(m[1]));
          continue;
        }
        if ((m = /^drop (table|view|materialized view|function|procedure|type|domain) (?:if exists )?(.+)$/.exec(s))) {
          for (const name of dropTargets(m[2])) {
            objects.delete(name);
            if (m[1] === 'table') columns.delete(name);
            drop(name, `drop ${m[1]} ${name}`, file);
          }
          continue;
        }
        if ((m = new RegExp(`^alter table (?:if exists )?(?:only )?${ID} (.+)$`).exec(s))) {
          const table = unq(m[1]);
          const cols = columns.get(table) ?? new Set();
          columns.set(table, cols);
          let r;
          if ((r = new RegExp(`^rename to ${ID}`).exec(m[2]))) {
            objects.delete(table); objects.add(unq(r[1]));
            columns.set(unq(r[1]), cols); columns.delete(table);
            drop(table, `rename table ${table}`, file);
            continue;
          }
          if ((r = new RegExp(`^rename (?:column )?${ID} to ${ID}`).exec(m[2]))) {
            cols.delete(unq(r[1])); cols.add(unq(r[2]));
            drop(unq(r[1]), `rename column ${table}.${unq(r[1])}`, file);
            continue;
          }
          for (const clause of splitTopLevel(m[2])) {
            let c;
            if ((c = new RegExp(`^drop (?:column )?(?:if exists )?${ID}`).exec(clause)) && !/^drop (constraint|default|not null|identity|expression)\b/.test(clause)) {
              cols.delete(unq(c[1]));
              drop(unq(c[1]), `drop column ${table}.${unq(c[1])}`, file);
            } else if ((c = new RegExp(`^add (?:column )?(?:if not exists )?${ID}`).exec(clause)) && !/^add (constraint|primary|unique|foreign|check|exclude)\b/.test(clause)) {
              cols.add(unq(c[1]));
            }
          }
          continue;
        }
        if ((m = new RegExp(`^alter (?:function|procedure|(?:materialized )?view|type) ${ID}\\s*(?:\\([^)]*\\))? rename to ${ID}`).exec(s))) {
          objects.delete(unq(m[1])); objects.add(unq(m[2]));
          drop(unq(m[1]), `rename ${unq(m[1])}`, file);
        }
      }
    }
  }

  const live = new Set(objects);
  for (const cols of columns.values()) for (const c of cols) live.add(c);
  return { live, dropped };
}

/**
 * SQL that this migration defines (function bodies, cron commands) naming
 * something an earlier migration removed and nothing has brought back.
 * plpgsql accepts this when the function is created and fails when the line
 * runs: 20261004100000 set watch_together.requester_shares_full, which
 * 20260927160000 had dropped, and every mutual-follow acceptance then failed.
 */
export function findDeadReferences({ file, sql, priorAndSelf }) {
  const before = buildSchemaState(priorAndSelf.filter(m => m.file < file));
  const after = buildSchemaState(priorAndSelf);
  const own = buildSqlUsers([{ file, sql }]);
  const hits = [];
  for (const [name, where] of before.dropped) {
    if (after.live.has(name)) continue;
    for (const ref of sqlReferences(name, own)) hits.push({ name, where, ref });
  }
  return hits;
}

// ── Checking ────────────────────────────────────────────────────────────────

/**
 * Check one migration.
 * @param {{ file: string, sql: string, priorAndSelf: { file: string, sql: string }[],
 *   codeSearch: (name: string) => string[],
 *   filesNaming?: (name: string) => Set<string>,
 *   mobileHistory?: (name: string) => string | null }} input
 *   filesNaming: code files that mention a name (used to put the hits for a
 *     column in files that also name its table first).
 *   mobileHistory: the last recent commit that changed a line naming `name`
 *     in mobile or shared core code, or null.
 */
export function checkMigration({ file, sql, priorAndSelf, codeSearch, filesNaming, mobileHistory }) {
  const { acks, missingReason } = parseAcknowledgements(sql);
  const users = buildSqlUsers(priorAndSelf);
  const problems = [];
  const acknowledged = [];
  for (const change of findChanges(sql)) {
    if (isAcknowledged(change, acks)) { acknowledged.push(change); continue; }
    if (change.alwaysAck) {
      problems.push({ ...change, file, why: 'old code that inserts rows without this column starts failing; grep cannot prove it does not', refs: [] });
      continue;
    }
    // A dropped function's own (now removed) body is not a user of itself.
    const except = change.kind === 'drop function' || change.kind === 'rename function' ? `function ${change.name}` : undefined;
    const code = rankByTable(codeSearch(change.name), change.table && filesNaming ? filesNaming(change.table) : null);
    const sqlRefs = sqlReferences(change.name, users, { except });
    const refs = [...code.lines, ...sqlRefs.map(r => `sql   ${r}`)];
    if (refs.length) {
      const files = new Set(code.lines.map(l => l.replace(/^code\*? +/, '').split(':')[0]));
      const summary = code.lines.length
        ? `${code.lines.length} code line(s) in ${files.size} file(s)` +
          (change.table && filesNaming ? `, ${code.likely} in files that read ${change.table} by name (marked *, read these first)` : '')
        : '';
      problems.push({ ...change, file, why: 'still referenced', summary, refs });
      continue;
    }
    const recent = mobileHistory?.(change.name);
    if (recent) {
      problems.push({ ...change, file, why: `no code on main names it, but mobile or shared core code did recently (${recent}); iPhones keep running older builds`, refs: [] });
    }
  }

  const { acks: deadAcks, missingReason: deadMissing } = parseAcknowledgements(sql, 'dead-name-ok');
  for (const hit of findDeadReferences({ file, sql, priorAndSelf })) {
    if (deadAcks.has(hit.name)) continue;
    problems.push({
      kind: 'names a removed object', name: hit.name, file,
      why: `removed earlier (${hit.where}); plpgsql only fails when the line runs`,
      refs: [`sql   ${hit.ref}`], detail: '',
    });
  }

  for (const name of missingReason) {
    problems.push({ kind: 'acknowledgement', name, file, why: '`-- contracts:` needs a reason in parentheses', refs: [], detail: '' });
  }
  for (const name of deadMissing) {
    problems.push({ kind: 'acknowledgement', name, file, why: '`-- dead-name-ok:` needs a reason in parentheses', refs: [], detail: '' });
  }
  return { problems, acknowledged };
}

/**
 * Order code hits so lines in files that also name the table come first,
 * marked `code*`. A column called `note` matches every `styles.note`; the
 * files that mention `history` too are the ones worth reading first.
 */
export function rankByTable(lines, tableFiles) {
  if (!tableFiles) return { lines: lines.map(l => `code  ${l}`), likely: 0 };
  const inTable = [];
  const rest = [];
  for (const l of lines) (tableFiles.has(l.split(':')[0]) ? inTable : rest).push(l);
  return { lines: [...inTable.map(l => `code* ${l}`), ...rest.map(l => `code  ${l}`)], likely: inTable.length };
}

/**
 * Files under the code paths on `rev` that name a table the way code reads
 * it: quoted, as in `.from('history')` or a REST path `/rest/v1/history`.
 */
export function filesNamingOnRev(name, rev) {
  const pattern = `(['"\`]|/rest/v1/)${name}(['"\`?]|$)`;
  try {
    const out = execFileSync('git', ['grep', '-l', '-I', '-E', '-e', pattern, rev, '--', ...CODE_PATHS, ...CODE_EXCLUDES], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return new Set(out.split('\n').filter(Boolean).map(l => l.replace(`${rev}:`, '')));
  } catch (e) {
    if (e.status === 1) return new Set();
    throw e;
  }
}

// iPhones run the build they installed, not main. How far back a removal from
// mobile code still counts. Plot has no minimum-supported-version gate yet; if
// one is added, this should become "older than the oldest allowed build".
export const MOBILE_PATHS = ['apps/mobile', 'packages/core'];
export const MOBILE_DAYS = Number(process.env.MIGRATION_CONTRACT_MOBILE_DAYS || 90);

/** The newest commit in the last MOBILE_DAYS on `rev` that added or removed a line naming `name` in mobile code. */
export function mobileHistoryOnRev(name, rev) {
  const pattern = `(^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`;
  try {
    const out = execFileSync('git', ['log', '-1', `--since=${MOBILE_DAYS}.days`, '--format=%h %cs %s', '-G', pattern, rev, '--', ...MOBILE_PATHS], { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function resolveBase(explicit) {
  if (explicit) return explicit;
  if (process.env.MIGRATION_CONTRACT_BASE) return process.env.MIGRATION_CONTRACT_BASE;
  for (const ref of ['origin/main', 'main']) {
    try { git(['rev-parse', '--verify', '--quiet', ref]); return git(['merge-base', ref, 'HEAD']); } catch { /* try next */ }
  }
  return null;
}

/** Migration files new or changed since `base`, including uncommitted ones. */
function changedMigrations(base) {
  const committed = git(['diff', '--name-only', '--diff-filter=AMR', `${base}`, '--', `${MIGRATIONS_DIR}/*.sql`]).split('\n');
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', `${MIGRATIONS_DIR}/*.sql`]).split('\n');
  return [...new Set([...committed, ...untracked].filter(Boolean).map(f => basename(f)))].sort();
}

function main(argv) {
  const opts = { files: null, base: null, report: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') opts.base = argv[++i];
    else if (argv[i] === '--report') opts.report = true;
    else if (argv[i] === '--files') { opts.files = []; while (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.files.push(basename(argv[++i])); }
  }

  const base = resolveBase(opts.base);
  if (!base) {
    console.log('… no main branch to compare with; skipping the expand-then-contract check');
    return 0;
  }
  const targets = opts.files ?? changedMigrations(base);
  if (targets.length === 0) {
    console.log('✓ no new or changed migrations, nothing to check for expand-then-contract');
    return 0;
  }

  const all = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    .map(f => ({ file: f, sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf8') }));
  const cache = new Map();
  const memo = fn => name => {
    const key = `${fn.name}:${name}`;
    if (!cache.has(key)) cache.set(key, fn(name, base));
    return cache.get(key);
  };
  const codeSearch = memo(codeReferences);
  const filesNaming = memo(filesNamingOnRev);
  const mobileHistory = memo(mobileHistoryOnRev);

  let failed = 0;
  for (const file of targets) {
    if (!existsSync(join(MIGRATIONS_DIR, file))) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const priorAndSelf = all.filter(m => m.file <= file);
    const { problems, acknowledged } = checkMigration({ file, sql, priorAndSelf, codeSearch, filesNaming, mobileHistory });
    for (const a of acknowledged) console.log(`  ${file}: ${a.kind} ${a.table ? `${a.table}.` : ''}${a.name} acknowledged`);
    if (!problems.length) continue;
    failed += problems.length;
    console.error(`\n✗ ${file}`);
    for (const p of problems) {
      console.error(`  ${p.kind}  ${p.table ? `${p.table}.` : ''}${p.name}: ${p.why}`);
      if (p.detail) console.error(`    ${p.detail}`);
      if (p.summary) console.error(`    ${p.summary}`);
      for (const r of p.refs.slice(0, 8)) console.error(`      ${r}`);
      if (p.refs.length > 8) console.error(`      … and ${p.refs.length - 8} more`);
    }
  }

  if (!failed) {
    console.log(`✓ expand then contract: ${targets.length} new or changed migration(s) remove nothing still in use`);
    return 0;
  }
  console.error(`
A migration merged to main applies to production immediately, and iPhones run
older builds for weeks. Remove a name only after the code that uses it is gone:
ship the code change first, then drop it in a later migration.

If you have done that and are sure, acknowledge it in the migration, one line
per name, with the reason:

  -- contracts: <name> (why nothing deployed still uses it)

A function that names something an earlier migration removed should stop
naming it. If the match is a different thing with the same name (a jsonb key,
a local variable), say so:

  -- dead-name-ok: <name> (what it is instead)

See docs/ops/migration-contract.md.`);
  return opts.report ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
