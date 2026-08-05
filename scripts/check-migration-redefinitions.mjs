// Guard against a migration silently reverting an earlier one.
//
// WHY THIS EXISTS
// 20260718120000_feed_post_types.sql widened feed_posts' unique key to include
// source_type and updated feed_post_from_journal()'s ON CONFLICT target to
// match. A week later 20260725000001_preserve_repeat_watches.sql recreated the
// same function to fix an unrelated DELETE bug — from the pre-widening body,
// reverting the conflict target to a constraint that no longer existed. Postgres
// accepts `create or replace function` silently; nothing warned. Every write to
// history then failed with 42P10 for two weeks.
//
// `create or replace function` is a full-body replacement, so recreating a
// function you didn't author means inheriting everything the previous version
// fixed. This checks the one detail that actually broke: whether a later
// definition changes the function's ON CONFLICT target(s).
//
// Redefining a function is normal (get_for_you is on its 4th version) so this
// deliberately does NOT complain about redefinition itself — only about a
// changed upsert key, which is where the silent breakage lives. Acknowledge an
// intentional change with a comment anywhere in the migration:
//
//   -- redefines: feed_post_from_history (conflict target intentionally changed)
//
// Usage:  node scripts/check-migration-redefinitions.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';

// Already applied to production, so the files are not editable in practice —
// adding even a comment risks upsetting Supabase's migration tracking. Both are
// resolved rather than outstanding:
//   20260718120000 — the intentional widening to include source_type.
//   20260725000001 — the accidental revert that caused the outage; fixed
//                    forward by 20260803000001_fix_history_feed_trigger.sql.
// Nothing else should ever be added here: new migrations are editable, so they
// use the `-- redefines:` acknowledgement instead.
const GRANDFATHERED = new Set([
  '20260718120000_feed_post_types.sql::feed_post_from_journal',
  '20260725000001_preserve_repeat_watches.sql::feed_post_from_journal',
]);

/** Function definitions in one migration: name -> array of ON CONFLICT targets. */
function parseDefinitions(sql) {
  const defs = new Map();
  // Split on each function definition; everything up to the next one (or EOF)
  // is that function's text. Good enough for this codebase's plain-SQL style.
  const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  const marks = [...sql.matchAll(re)].map(m => ({ name: m[1].toLowerCase(), start: m.index }));

  for (const [i, mark] of marks.entries()) {
    const end = i + 1 < marks.length ? marks[i + 1].start : sql.length;
    const body = sql.slice(mark.start, end);
    const targets = [...body.matchAll(/on\s+conflict\s*\(([^)]*)\)/gi)]
      .map(m => m[1].split(',').map(c => c.trim().toLowerCase()).filter(Boolean).sort().join(','));
    if (!defs.has(mark.name)) defs.set(mark.name, []);
    defs.get(mark.name).push(...targets);
  }
  return defs;
}

const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

// ── Two migrations must never share a version ───────────────────────────────
// supabase_migrations.schema_migrations has version as its primary key, so the
// second file carrying a version aborts the whole run with
//   23505: duplicate key value violates unique constraint "schema_migrations_pkey"
// and every migration after it silently never applies. That is not theoretical:
// 20260803000000 was used twice, and the drop of profiles.log_rewatches sat
// unapplied behind it while CI stayed green — the merge reports success because
// the failure happens out of band, in the Supabase integration.
const versionOwners = new Map();
for (const file of files) {
  const version = file.split('_')[0];
  if (!versionOwners.has(version)) versionOwners.set(version, []);
  versionOwners.get(version).push(file);
}
const collisions = [...versionOwners.entries()].filter(([, f]) => f.length > 1);
if (collisions.length) {
  console.error('✗ migrations share a version — the pipeline stops here and nothing after applies:\n');
  for (const [version, dupes] of collisions) {
    console.error(`  ${version}`);
    for (const d of dupes) console.error(`    ${d}`);
  }
  console.error('\nRename all but one to the next free timestamp. Renaming is safe when the');
  console.error('migration is idempotent (create or replace, if not exists); check before you do.');
  process.exit(1);
}

// name -> { file, targets } for the most recent definition seen so far
const latest = new Map();
const problems = [];

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  const acknowledged = /--\s*redefines:/i.test(sql);

  for (const [name, targets] of parseDefinitions(sql)) {
    const prev = latest.get(name);

    if (prev && !acknowledged && !GRANDFATHERED.has(`${file}::${name}`)) {
      const before = prev.targets.join(' | ');
      const after = targets.join(' | ');
      if (before !== after) {
        problems.push({
          name, file, prevFile: prev.file, before, after,
          kind: targets.length === 0 ? 'dropped' : prev.targets.length === 0 ? 'added' : 'changed',
        });
      }
    }
    latest.set(name, { file, targets });
  }
}

if (problems.length === 0) {
  console.log(`✓ no migration silently changes a function's ON CONFLICT target (${files.length} migrations scanned)`);
  process.exit(0);
}

console.error(`✗ ${problems.length} migration(s) redefine a function with a different ON CONFLICT target:\n`);
for (const p of problems) {
  console.error(`  ${p.file}`);
  console.error(`    function  ${p.name}()   (previously defined in ${p.prevFile})`);
  console.error(`    conflict target ${p.kind}:`);
  console.error(`      was  ${p.before || '(none)'}`);
  console.error(`      now  ${p.after || '(none)'}`);
  console.error('');
}
console.error('`create or replace function` replaces the whole body, so recreating a function');
console.error('inherits everything the previous version fixed. A changed upsert key is exactly');
console.error('how the two-week history-write outage happened — see');
console.error('supabase/migrations/20260803000001_fix_history_feed_trigger.sql.');
console.error('');
console.error('If the change is deliberate, diff against the previous definition first, then add');
console.error('a line to the migration acknowledging it:');
console.error('');
console.error(`  -- redefines: ${problems[0].name} (conflict target intentionally changed)`);
process.exit(1);
