// Fail the build when an app imports a @plot/core module that does not exist
// in THIS checkout.
//
// WHY THIS EXISTS
// PR #446 deleted packages/core/onboarding.js as unused while
// apps/mobile/app/(app)/index.tsx still imported getOrCreateMyListId from it.
// main shipped unbuildable — Metro could not resolve the module at all — and
// it stayed that way until someone tried to run the app.
//
// CI's `tsc --noEmit` did catch it. What it cannot be trusted to catch is the
// same mistake made from a git worktree, and worktrees are where most of this
// repo's work happens. They live at <repo>/.claude/worktrees/<name>, i.e.
// INSIDE the main checkout, so when TypeScript fails to find a module it walks
// up the ancestor node_modules chain and reaches <repo>/node_modules/@plot/core
// -> <repo>/packages/core — the PARENT checkout's copy, not the one you are
// editing. Two failures follow, and both are silent:
//
//   * a core module you deleted still resolves (the parent still has it)
//   * a core export you just added does not exist (it reads the parent's file)
//
// So the local check passes no matter which mistake you made. tsconfig `paths`
// does not fix this: a paths mapping is a first attempt, and when it misses
// TypeScript falls back to the node_modules walk regardless.
//
// This script does not care where it runs. It resolves every @plot/core
// specifier against packages/core relative to the repo root it is invoked
// from, so a worktree checks its own tree and nothing else.
//
// Usage:
//   node scripts/check-core-imports.mjs           # report + fail
//   node scripts/check-core-imports.mjs --list    # report every hit, exit 0

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const CORE = join(ROOT, 'packages', 'core');
const LIST_ONLY = process.argv.includes('--list');

const SCAN = [
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/contexts',
  'apps/mobile/hooks',
  'apps/mobile/lib',
  'apps/web/src',
  'packages/core',
  'packages/ui',
];

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.expo', 'storybook-static']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

// Matches both `from '@plot/core/x.js'` and `import('@plot/core/x.js')`, plus
// the relative form core modules use on each other ('./x.js') — the same
// deletion breaks those too, and they are just as invisible from a worktree.
const CORE_SPECIFIER = /(?:from|import)\s*\(?\s*['"](@plot\/core\/[^'"]+)['"]/g;
const RELATIVE_IN_CORE = /(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+\.js)['"]/g;

const problems = [];
let checked = 0;

for (const rel of SCAN) {
  const base = join(ROOT, rel);
  if (!existsSync(base)) continue;

  for (const file of walk(base)) {
    const src = readFileSync(file, 'utf8');
    const inCore = file.startsWith(CORE);

    for (const [, spec] of src.matchAll(CORE_SPECIFIER)) {
      checked++;
      const target = join(CORE, spec.slice('@plot/core/'.length));
      if (!existsSync(target)) {
        problems.push({ file, spec, target });
      }
    }

    if (inCore) {
      for (const [, spec] of src.matchAll(RELATIVE_IN_CORE)) {
        checked++;
        const target = resolve(file, '..', spec);
        if (!existsSync(target)) {
          problems.push({ file, spec, target });
        }
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`✓ every @plot/core import resolves in this checkout (${checked} checked)`);
  process.exit(0);
}

console.error(`\n✗ ${problems.length} @plot/core import(s) point at a module that does not exist here:\n`);
for (const { file, spec, target } of problems) {
  console.error(`  ${relative(ROOT, file)}`);
  console.error(`    imports ${spec}`);
  console.error(`    expected ${relative(ROOT, target)}\n`);
}
console.error('Either restore the module, or update the importer. If the module was');
console.error('deliberately removed, this is the importer nobody noticed.\n');
process.exit(LIST_ONLY ? 0 : 1);
