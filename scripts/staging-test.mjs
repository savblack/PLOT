#!/usr/bin/env node
// Run the Staging SQL tests: `pnpm run staging:test -- <name ...|all>`.
//
// Each scripts/staging-<name>-test.sql executes RLS policies, RPCs and
// triggers under a real auth.uid() on the PLOT Staging project, which no static
// check can do. They used to be 24 separate package.json scripts that ran only
// when somebody remembered, and by November 2026 two thirds of them no longer
// ran at all. This runner, and the nightly workflow that calls it
// (.github/workflows/staging-tests.yml), exist so that cannot happen quietly.
//
// WHAT A RUN TESTS
// Staging as this checkout would leave it. Each test runs in one psql session
// that does, in order:
//
//   begin
//   apply every supabase/migrations file Staging has not recorded in
//     supabase_migrations.schema_migrations (none on a clean main; on a branch,
//     that branch's new migrations)
//   scripts/staging-test-fixtures.sql (the shared A/B/C accounts, created if
//     Staging has lost them)
//   the test file
//   rollback
//
// So a pull request's migration is exercised by every test, not only the one
// its author thought to write, and nothing persists on Staging either way.
// A test therefore must NOT `\i` a migration itself: re-running a shipped
// migration puts an older function body or policy back inside the
// transaction, and the test then passes against code that is no longer live.
//
// Staging only. Connection details live in scripts/staging-sql.sh, which has a
// fixed project ref and no way to point at production; this file never opens a
// connection of its own.
//
// Usage:
//   pnpm run staging:test -- all
//   pnpm run staging:test -- block premium-flag
//   pnpm run staging:test -- --list
// Needs PLOT_STAGING_DB_PASSWORD (the main checkout's .env; worktrees symlink
// it) and psql 17 (`brew install postgresql@17`).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'scripts');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const FIXTURES = join(SCRIPTS, 'staging-test-fixtures.sql');
const TEST_RE = /^staging-(.+)-test\.sql$/;

function allTests() {
  return readdirSync(SCRIPTS)
    .map((f) => f.match(TEST_RE)?.[1])
    .filter(Boolean)
    .sort();
}

function resolveName(arg) {
  const name = basename(arg)
    .replace(/\.sql$/, '')
    .replace(/^staging[:-]/, '')
    .replace(/-test$/, '');
  return existsSync(join(SCRIPTS, `staging-${name}-test.sql`)) ? name : null;
}

// Every test runs inside the wrapper's transaction. A COMMIT in a test would
// make its fixtures, and any pending migration, permanent on Staging.
function unsafeReason(sql) {
  const code = sql.replace(/--[^\n]*/g, '');
  // Not a bare `end;`: that closes every plpgsql block.
  if (/^\s*(commit|end\s+(work|transaction))\b/im.test(code)) return 'it contains COMMIT';
  if (/^\s*\\ir?\s+\S*supabase\/migrations\//im.test(code)) {
    return 'it runs a migration itself (the runner applies pending ones; see the header of scripts/staging-test.mjs)';
  }
  return null;
}

function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();
}

// One round trip for the whole ledger: a boolean psql variable per migration,
// true when Staging has already recorded it.
function wrapperFor(testFile) {
  const files = migrationFiles();
  const lines = ['\\set ON_ERROR_STOP on', 'begin;'];
  const cols = files.map((f, i) => `'${f.slice(0, 14)}' = any(v) as plot_m${i}`);
  lines.push(
    `select ${cols.join(', ')}`,
    'from (select coalesce(array_agg(version), array[]::text[]) v from supabase_migrations.schema_migrations) l \\gset',
  );
  files.forEach((f, i) => {
    lines.push(
      `\\if :plot_m${i}`,
      '\\else',
      `\\echo 'pending migration applied in this transaction: ${f}'`,
      `\\i ${join(MIGRATIONS, f)}`,
      '\\endif',
    );
  });
  // The test's own `begin` only warns inside this transaction, and its
  // `rollback` ends it. The trailing rollback covers a test that forgot one.
  lines.push(`\\i ${FIXTURES}`, `\\i ${testFile}`, 'rollback;', '');
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const tests = allTests();

  if (args.includes('--list')) {
    console.log(tests.join('\n'));
    return 0;
  }
  if (args.length === 0) {
    console.error('usage: pnpm run staging:test -- <name ...|all>   (--list shows the names)');
    return 2;
  }

  let names;
  if (args.includes('all')) {
    names = tests;
  } else {
    names = [];
    for (const arg of args) {
      const name = resolveName(arg);
      if (!name) {
        console.error(`No Staging test called "${arg}". Known: ${tests.join(', ')}`);
        return 2;
      }
      names.push(name);
    }
  }

  const work = mkdtempSync(join(tmpdir(), 'plot-staging-test-'));
  const failed = [];
  try {
    for (const name of names) {
      const file = join(SCRIPTS, `staging-${name}-test.sql`);
      console.log(`\n━━ ${name} ━━`);
      const reason = unsafeReason(readFileSync(file, 'utf8'));
      if (reason) {
        console.log(`✗ not run: ${reason}`);
        failed.push(name);
        continue;
      }
      const wrapper = join(work, `${name}.sql`);
      writeFileSync(wrapper, wrapperFor(file));
      const res = spawnSync('bash', [join(SCRIPTS, 'staging-sql.sh'), wrapper], {
        cwd: ROOT,
        stdio: 'inherit',
      });
      if (res.status !== 0) failed.push(name);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  console.log('');
  if (failed.length) {
    console.log(`✗ ${failed.length} of ${names.length} Staging tests failed: ${failed.join(', ')}`);
    return 1;
  }
  console.log(`✓ all ${names.length} Staging tests passed`);
  return 0;
}

process.exit(main());
