// Health check for the write paths that triggers sit on.
//
// WHY THIS EXISTS
// Between 2026-07-25 and 2026-08-03 every write to `history` failed in
// production and nothing noticed. feed_post_from_history()'s ON CONFLICT target
// named a unique constraint that a previous migration had dropped, so the
// trigger raised 42P10 and — being an AFTER trigger in the same transaction —
// aborted the statement that fired it. Marking a title watched, editing a
// rating and editing a review all failed silently for two weeks. It only
// surfaced because an unrelated backfill happened to touch the table.
//
// Three checks, all pure introspection. None of them writes anything. Each one
// resolves against the live database with this branch's unapplied migrations
// folded in, so the question answered is "will these write paths work once this
// merges" rather than "do they work against a schema this branch has not
// created yet":
//
//   1. ON CONFLICT targets resolve. For every trigger function, every
//      `insert … on conflict (cols)` must match a real unique/primary-key
//      constraint on the target table. This is precisely the 42P10 failure.
//
//   2. Referenced tables exist. The same broken function also still queried
//      public.journal, renamed to public.history in 20260726010000 — the
//      function was renamed, its body was not. That would have broken deletes
//      as soon as the insert path was fixed.
//
//   3. Application ON CONFLICT targets resolve. Check 1 for app code: every
//      `.from('t').upsert(…, { onConflict: … })` must name a real constraint
//      too. Missed the first time round, and it cost the same outage twice —
//      the web import upserted history against the constraint 20260727010000
//      dropped, so from that migration onward it wrote nothing at all and
//      reported success. Only code that is actually deployed fails the build;
//      the mobile app and the hand-deployed edge functions are checked and
//      warned about, since a stale target there blocks a release rather than
//      breaking one. Operator tooling (scripts/, marketing/) is out of scope —
//      no user-facing write goes through it.
//
// DELIBERATELY NOT a write probe. Inserting into a real table inside a
// transaction and rolling back would be a more general check, but `profiles`
// and `feedback` carry http_request triggers, and pg_net-style calls are not
// reliably transactional — a rollback could still fire a real webhook (e.g. the
// signup notification). Introspection covers the failures we've actually had
// without that risk.
//
// Usage (either transport works):
//   node --env-file=.env scripts/check-db-write-paths.mjs     # local, via .env
//   SUPABASE_DB_URL=… node scripts/check-db-write-paths.mjs   # CI, via psql
//
// Locally it uses SUPABASE_ACCESS_TOKEN + VITE_SUPABASE_URL from the root .env.
// In CI it uses SUPABASE_DB_URL, the secret db-backup.yml already relies on, so
// no new secret is needed. Read-only either way.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  colKey, resolveConflictTargets, extractTableRefs,
  extractStringConstants, extractAppConflictTargets,
  projectPendingSchema,
} from './lib/dbWritePathChecks.mjs';

// Two transports so this runs both locally and in CI without a new secret:
//   SUPABASE_ACCESS_TOKEN → Supabase Management API (what the root .env has)
//   SUPABASE_DB_URL       → psql (the secret db-backup.yml already uses)
// Read-only either way.
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DB_URL = process.env.SUPABASE_DB_URL;
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

if (!TOKEN && !DB_URL) {
  console.error('Need SUPABASE_ACCESS_TOKEN (+ SUPABASE_URL) or SUPABASE_DB_URL.');
  process.exit(1);
}
if (TOKEN && !URL_) {
  console.error('SUPABASE_ACCESS_TOKEN is set but SUPABASE_URL / VITE_SUPABASE_URL is not.');
  process.exit(1);
}

const REF = TOKEN ? new URL(URL_).hostname.split('.')[0] : null;
const TARGET = REF ? `project ${REF}` : 'SUPABASE_DB_URL';

async function query(sql) {
  if (TOKEN) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`query failed (${res.status}): ${text}`);
    try { return JSON.parse(text); } catch { throw new Error(`unexpected response: ${text}`); }
  }

  // -X ignores ~/.psqlrc; -tA gives untitled, unaligned output so the single
  // json_agg cell comes back parseable. Empty result → 'null'.
  const wrapped = `select coalesce(json_agg(t), '[]'::json) from (${sql.replace(/;\s*$/, '')}) t`;
  const out = execFileSync('psql', ['-X', '-tAc', wrapped, DB_URL], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  }).trim();
  return JSON.parse(out || '[]');
}

const problems = [];
// Targets that only resolve because of a migration in this branch.
let pendingMatches = 0;

console.log(`▶ checking write paths on ${TARGET}\n`);

// ── Every non-internal trigger, with its function's source ───────────────────
const triggers = await query(`
  select c.relname as tbl, t.tgname as trg, p.proname as fn,
         pg_get_functiondef(p.oid) as def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
  order by c.relname, t.tgname`);

// ── Unique / primary-key constraints, per table ──────────────────────────────
const constraintRows = await query(`
  select c.relname as tbl, con.conname,
         (select string_agg(a.attname, ',' order by a.attname)
            from unnest(con.conkey) k
            join pg_attribute a on a.attrelid = c.oid and a.attnum = k) as cols
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and con.contype in ('u','p')`);

let constraintsByTable = new Map();
for (const r of constraintRows) {
  if (!constraintsByTable.has(r.tbl)) constraintsByTable.set(r.tbl, []);
  constraintsByTable.get(r.tbl).push({ name: r.conname, key: colKey(r.cols || '') });
}

// Unique indexes also satisfy ON CONFLICT, so count those too.
const indexRows = await query(`
  select t.relname as tbl, i.relname as idx,
         (select string_agg(a.attname, ',' order by a.attname)
            from pg_attribute a
            where a.attrelid = t.oid and a.attnum = any(ix.indkey)) as cols
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and ix.indisunique`);
for (const r of indexRows) {
  if (!constraintsByTable.has(r.tbl)) constraintsByTable.set(r.tbl, []);
  constraintsByTable.get(r.tbl).push({ name: r.idx, key: colKey(r.cols || '') });
}

// ── Migrations this database has not run yet ────────────────────────────────
// A PR that adds an upsert and the migration creating its constraint is correct
// but describes a schema that does not exist yet, and checking it against the
// live one alone fails every time. So fold the unapplied migrations in: the
// question this answers is "will these write paths work once this branch is
// merged", which is the question a PR is actually asking.
//
// Only unapplied files are read. Everything already applied is taken from the
// database as before, so no amount of SQL parsing can misdescribe the schema
// that exists — only the schema that is about to.
let pending = [];
let pendingNote = '';
try {
  const applied = new Set(
    (await query('select version from supabase_migrations.schema_migrations')).map(r => String(r.version))
  );
  pending = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => !applied.has(f.split('_')[0]))
    .map(file => ({ file, sql: readFileSync(join('supabase/migrations', file), 'utf8') }));
} catch (e) {
  // Without the migration table there is nothing to fold in, so fall back to
  // checking the live schema alone — the behaviour before this existed. Said
  // out loud, because silently checking less is how a guard rots.
  pendingNote = `could not read supabase_migrations.schema_migrations (${e.message.split('\n')[0]}) — checking the live schema only`;
}

if (pendingNote) {
  console.log(`  ! ${pendingNote}\n`);
} else if (pending.length) {
  console.log(`  ${pending.length} migration(s) not applied yet, folded in: ${pending.map(p => p.file).join(', ')}\n`);
}

const liveConstraintsByTable = constraintsByTable;
constraintsByTable = projectPendingSchema(liveConstraintsByTable, pending);

// Which migration, if any, is the only reason a key resolves. Null when the
// constraint is really there.
const pendingSource = (table, key) =>
  (constraintsByTable.get(table) || []).find(c => c.key === key)?.pending ?? null;

// The reverse: a key that works today and stops working on merge, because an
// unapplied migration drops it and nothing in the branch re-adds it. This is
// the original outage read forwards — 20260727010000 dropped the constraint the
// import still named, and nothing said so until the writes had been failing for
// two weeks. Now the migration that would do it cannot merge quietly.
const droppedByPending = (table, key) => {
  if ((constraintsByTable.get(table) || []).some(c => c.key === key)) return null;
  return (liveConstraintsByTable.get(table) || []).find(c => c.key === key)?.name ?? null;
};

/** Failure wording that says which of the two situations this is. */
const missingDetail = (who, table, key, verb) => {
  const dropped = droppedByPending(table, key);
  return dropped
    ? `${who} ${verb} ${table} with (${key}), which ${dropped} satisfies today — but a migration in this branch drops it and nothing re-creates it.`
    : `${who} ${verb} ${table} with (${key}), but that table has no matching unique/PK constraint.`;
};

// A unique constraint and the index backing it are the same key under the same
// name, so list each only once when reporting what a table actually offers.
// Reports the live schema: what a failing target has to choose from today.
const availableKeys = table =>
  [...new Set((liveConstraintsByTable.get(table) || []).map(c => `${c.name} (${c.key})`))];

// ── Existing tables/views, for the dangling-reference check ──────────────────
const relRows = await query(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','m','p')`);
const existingRels = new Set(relRows.map(r => r.relname));

// ── Check 1: ON CONFLICT targets resolve ────────────────────────────────────
console.log('── ON CONFLICT targets ──');
let conflictChecks = 0;
for (const t of triggers) {
  for (const { table, key, matched } of resolveConflictTargets(t.def, constraintsByTable)) {
    conflictChecks++;
    if (matched) {
      const from = pendingSource(table, key);
      if (from) pendingMatches++;
      console.log(from
        ? `  ⋯ ${t.fn}()  →  ${table} (${key})  matches ${matched}, created by ${from} (not applied yet)`
        : `  ✓ ${t.fn}()  →  ${table} (${key})  matches ${matched}`);
    } else {
      const dropped = droppedByPending(table, key);
      console.log(`  ✗ ${t.fn}()  →  ${table} (${key})  ${dropped ? `DROPPED BY A PENDING MIGRATION (${dropped})` : 'NO MATCHING CONSTRAINT'}`);
      problems.push({
        kind: '42P10',
        detail: missingDetail(`${t.fn}() inserts into`, table, key, ''),
        table: t.tbl,
        available: availableKeys(table),
      });
    }
  }
}
if (conflictChecks === 0) console.log('  (no on-conflict clauses in any trigger function)');

// ── Check 2: referenced tables exist ────────────────────────────────────────
console.log('\n── table references in trigger functions ──');
for (const t of triggers) {
  const missing = extractTableRefs(t.def).filter(r => !existingRels.has(r));
  if (missing.length) {
    console.log(`  ✗ ${t.fn}()  references missing: ${missing.join(', ')}`);
    problems.push({
      kind: 'missing-relation',
      detail: `${t.fn}() references public.${missing.join(', public.')} which does not exist.`,
      table: t.tbl,
    });
  }
}
if (!problems.some(p => p.kind === 'missing-relation')) console.log('  ✓ every referenced table exists');

// ── Check 3: application ON CONFLICT targets resolve ────────────────────────
// Every scanned directory fails the build. This started split, with the mobile
// app and the edge functions only warned about because neither is deployed yet
// and both carried stale targets that would have blocked unrelated work. Those
// are fixed, so the split is gone: a warning nobody has to act on is how the
// Plex/Trakt functions kept a dropped constraint for weeks.
//
// A PR may add an upsert and the migration creating its constraint together;
// that used to fail here until the merge applied it, and the advice was to land
// the constraint first. It no longer is — unapplied migrations are folded into
// the schema this resolves against, and such a target reports as ⋯ pending.
// What still fails is a target no migration in the branch accounts for.
const SCANNED = ['packages/core', 'apps/web/src', 'apps/mobile', 'supabase/functions'];
const SOURCE_EXT = /\.(js|jsx|ts|tsx|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'ios', 'android', '.expo']);

function sourceFiles(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(sourceFiles(path));
    else if (SOURCE_EXT.test(e.name)) out.push(path);
  }
  return out;
}

const scanned = SCANNED
  .flatMap(d => sourceFiles(d))
  .map(file => ({ file, source: readFileSync(file, 'utf8') }));

// Constants resolve across files: the canonical target lives in one module and
// is imported by every write site, which is the point of naming it once.
//
// A file's own definition wins over the shared pool, though, because the same
// name is deliberately defined twice — packages/core/userMedia.js for the app
// and supabase/functions/_shared/historyConflict.ts for Deno, which cannot
// import the workspace. Those two are supposed to fail this check if they ever
// disagree. Folded into one map they could not: whichever file was scanned last
// silently answered for both, so a drift between them resolved to a single
// value and looked consistent no matter what the other one said.
const constants = new Map();
for (const { source } of scanned) {
  for (const [name, value] of extractStringConstants(source)) constants.set(name, value);
}
const scopeFor = source => new Map([...constants, ...extractStringConstants(source)]);

console.log('\n── ON CONFLICT targets in application code ──');
let appChecks = 0;
for (const { file, source } of scanned) {
  for (const { table, key, raw } of extractAppConflictTargets(source, scopeFor(source))) {
    appChecks++;
    if (key === null) {
      console.log(`  ? ${file}  →  ${table} (${raw})  target not statically resolvable, skipped`);
      continue;
    }
    const match = (constraintsByTable.get(table) || []).find(c => c.key === key);
    if (match) {
      if (match.pending) pendingMatches++;
      console.log(match.pending
        ? `  ⋯ ${file}  →  ${table} (${key})  matches ${match.name}, created by ${match.pending} (not applied yet)`
        : `  ✓ ${file}  →  ${table} (${key})  matches ${match.name}`);
      continue;
    }
    const dropped = droppedByPending(table, key);
    console.log(`  ✗ ${file}  →  ${table} (${key})  ${dropped ? `DROPPED BY A PENDING MIGRATION (${dropped})` : 'NO MATCHING CONSTRAINT'}`);
    problems.push({
      kind: '42P10-app',
      detail: missingDetail(file, table, key, 'upserts into'),
      table,
      available: availableKeys(table),
    });
  }
}
if (appChecks === 0) console.log('  (no onConflict clauses in application code)');

// ── Report ──────────────────────────────────────────────────────────────────
console.log('');
if (problems.length === 0) {
  console.log(`✓ write paths healthy — ${triggers.length} trigger(s), ${conflictChecks} trigger and ${appChecks} application on-conflict clause(s) verified`);
  if (pendingMatches) {
    console.log(`  ${pendingMatches} of them resolve only once this branch's migrations apply — green here means green after the merge, not before it.`);
  }
  process.exit(0);
}

console.error(`✗ ${problems.length} problem(s) found. Writes to the affected tables are FAILING.\n`);
for (const p of problems) {
  console.error(`  [${p.kind}] ${p.detail}`);
  console.error(`      affected table: ${p.table} — inserts and updates on it abort`);
  if (p.available?.length) {
    console.error(`      available keys: ${p.available.join('; ') || '(none)'}`);
  }
  console.error('');
}
console.error('An AFTER trigger that raises takes the triggering statement down with it, so');
console.error('this is not cosmetic — the user-facing write fails. See');
console.error('supabase/migrations/20260803000001_fix_history_feed_trigger.sql for the last one.');
process.exit(1);
