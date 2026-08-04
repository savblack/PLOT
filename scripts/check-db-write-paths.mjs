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
// Two checks, both pure introspection. Neither writes anything:
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
import { colKey, resolveConflictTargets, extractTableRefs } from './lib/dbWritePathChecks.mjs';

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

const constraintsByTable = new Map();
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
      console.log(`  ✓ ${t.fn}()  →  ${table} (${key})  matches ${matched}`);
    } else {
      console.log(`  ✗ ${t.fn}()  →  ${table} (${key})  NO MATCHING CONSTRAINT`);
      problems.push({
        kind: '42P10',
        detail: `${t.fn}() inserts into ${table} with on conflict (${key}), but that table has no matching unique/PK constraint.`,
        table: t.tbl,
        available: (constraintsByTable.get(table) || []).map(c => `${c.name} (${c.key})`),
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

// ── Report ──────────────────────────────────────────────────────────────────
console.log('');
if (problems.length === 0) {
  console.log(`✓ write paths healthy — ${triggers.length} trigger(s), ${conflictChecks} on-conflict clause(s) verified`);
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
console.error('supabase/migrations/20260803000000_fix_history_feed_trigger.sql for the last one.');
process.exit(1);
