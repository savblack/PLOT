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

// ── Check 2: an app redefining something @plot/core already exports ──────
//
// Hoisting to core achieves nothing until a consumer actually switches, and
// nothing was checking that they did. Four Phase 1 hoists sat unused for weeks
// while the apps kept their own copies — two of them byte-identical. The ones
// that were NOT identical are the reason this check exists: web's
// usePublicProfile had grown a `.limit(2000)` on an unbounded query and three
// extra profile sections that core's copy never got, while core's useFollows
// had analytics seams web's copy never got. Each platform was silently missing
// the other's fixes.
//
// Deliberately narrow: it only fires when an app file defines a name core
// exports AND does not import that name from core. Same-named locals that do
// import the real thing (destructuring, shadowed params) are not flagged.

const CORE_DIR = join(ROOT, 'packages', 'core');
const coreExports = new Map(); // name -> file

for (const file of walk(CORE_DIR)) {
  const src = readFileSync(file, 'utf8');
  for (const [, name] of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) coreExports.set(name, file);
  for (const [, name] of src.matchAll(/^export\s+const\s+(\w+)/gm)) coreExports.set(name, file);
}

// Names an app may legitimately redefine, with the reason. Keep this short —
// each entry is a known divergence someone has to own.
const SHADOW_ALLOWLIST = new Map([
  // Web has TWO contradictory username rules: SettingsView allows hyphens and
  // rejects underscores, PublicProfilePage (which core took) does the reverse.
  // Existing handles were created under Settings' rule, so collapsing them is a
  // product decision about which wins, not a mechanical de-duplication.
  ['USERNAME_RE', 'apps/web/src/components/SettingsView.jsx'],
]);

const shadows = [];
for (const rel of SCAN) {
  const base = join(ROOT, rel);
  if (!existsSync(base)) continue;
  for (const file of walk(base)) {
    if (file.startsWith(CORE_DIR)) continue;
    const relFile = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    for (const [name, coreFile] of coreExports) {
      if (SHADOW_ALLOWLIST.get(name) === relFile) continue;
      const defines = new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|const)\\s+${name}\\b`, 'm').test(src);
      if (!defines) continue;
      const importsIt = new RegExp(`import[^;]*\\b${name}\\b[^;]*@plot/core`, 's').test(src);
      if (!importsIt) shadows.push({ file: relFile, name, core: relative(ROOT, coreFile) });
    }
  }
}

if (problems.length === 0 && shadows.length === 0) {
  console.log(`✓ every @plot/core import resolves in this checkout (${checked} checked)`);
  console.log(`✓ no app redefines one of core's ${coreExports.size} exports`);
  process.exit(0);
}

if (shadows.length) {
  console.error(`\n✗ ${shadows.length} app definition(s) shadow a @plot/core export:\n`);
  for (const { file, name, core } of shadows) {
    console.error(`  ${file}`);
    console.error(`    defines ${name}, which ${core} already exports\n`);
  }
  console.error('Import it from core instead. If the two genuinely have to differ,');
  console.error('add it to SHADOW_ALLOWLIST in this file with the reason.\n');
}

if (problems.length === 0) process.exit(shadows.length ? 1 : 0);

console.error(`\n✗ ${problems.length} @plot/core import(s) point at a module that does not exist here:\n`);
for (const { file, spec, target } of problems) {
  console.error(`  ${relative(ROOT, file)}`);
  console.error(`    imports ${spec}`);
  console.error(`    expected ${relative(ROOT, target)}\n`);
}
console.error('Either restore the module, or update the importer. If the module was');
console.error('deliberately removed, this is the importer nobody noticed.\n');
process.exit(LIST_ONLY ? 0 : 1);
