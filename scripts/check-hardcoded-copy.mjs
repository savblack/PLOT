// Fail the build when an app hardcodes a string the shared copy catalog owns.
//
// WHY THIS EXISTS
// packages/core/copy exists so the web and mobile apps word the same things the
// same way. That only holds if the apps *read* it. A hardcoded literal that
// happens to match today looks fine and silently diverges the first time either
// side is reworded — which is exactly the drift the catalog was built to stop.
// The catalog being shared is necessary but not sufficient; this makes it
// enforced.
//
// What counts as a violation: a string literal in app source that is
// byte-identical to a value in @plot/core/copy, in a file that isn't already
// importing that string from the catalog.
//
// Usage:
//   node scripts/check-hardcoded-copy.mjs           # report + fail
//   node scripts/check-hardcoded-copy.mjs --list    # report every hit, exit 0
//
// Deliberately narrow, to stay useful rather than noisy:
//  - only strings of MIN_LENGTH+ characters containing a space, so single words
//    like "Save" or "List" (which legitimately appear everywhere, and which the
//    catalog can't sensibly own) are ignored
//  - only the app source trees, not tests, stories or the catalog itself
//  - a file already importing the owning module is assumed to be mid-adoption
//    for that module, so its other literals from that module still report

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CATALOG = 'packages/core/copy';
const MIN_LENGTH = 12;
const LIST_ONLY = process.argv.includes('--list');

const SCAN = [
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/hooks',
  'apps/web/src/components',
  'apps/web/src/pages',
];
// DesignSystemPage is a dev-only living style guide: it quotes real copy as
// sample content on purpose, so a literal there is documentation, not drift.
const SKIP_FILE = /\.(test|stories)\.[jt]sx?$|DesignSystemPage\./;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (!/\.(jsx?|tsx?)$/.test(e) || SKIP_FILE.test(e)) continue;
    out.push(p);
  }
  return out;
}

/** Every string value in the catalog → the module + key path that owns it. */
async function loadCatalog() {
  const owners = new Map();
  const walkValues = (val, mod, path) => {
    if (typeof val === 'string') {
      if (val.length >= MIN_LENGTH && val.includes(' ') && !owners.has(val)) {
        owners.set(val, { mod, path });
      }
      return;
    }
    if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) walkValues(v, mod, path ? `${path}.${k}` : k);
    }
  };
  for (const file of readdirSync(join(ROOT, CATALOG)).filter(f => f.endsWith('.js'))) {
    const mod = await import(join(ROOT, CATALOG, file));
    for (const [exportName, value] of Object.entries(mod)) walkValues(value, file, exportName);
  }
  return owners;
}

const owners = await loadCatalog();
const violations = [];

for (const dir of SCAN) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    // Strip comments so a string quoted in an explanatory comment isn't a hit.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    for (const m of code.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){12,300})\1/g)) {
      const literal = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
      const owner = owners.get(literal);
      if (!owner) continue;
      violations.push({ file: rel, literal, ...owner });
    }
  }
}

if (violations.length === 0) {
  console.log(`✓ no app file hardcodes a string owned by ${CATALOG} (${owners.size} shared strings checked)`);
  process.exit(0);
}

const byFile = new Map();
for (const v of violations) {
  if (!byFile.has(v.file)) byFile.set(v.file, []);
  byFile.get(v.file).push(v);
}

const verb = LIST_ONLY ? 'ℹ' : '✗';
console.log(`${verb} ${violations.length} hardcoded string(s) that ${CATALOG} already owns, in ${byFile.size} file(s):\n`);
for (const [file, hits] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${file}  (${hits.length})`);
  for (const h of hits) {
    console.log(`      ${h.mod.replace('.js', '')}.${h.path}`);
    console.log(`        ${JSON.stringify(h.literal.slice(0, 76))}`);
  }
  console.log('');
}

if (LIST_ONLY) process.exit(0);

console.log('Import the string from the catalog instead of retyping it. The catalog only');
console.log('prevents web↔mobile drift if both apps actually read from it — a literal that');
console.log('matches today diverges the first time either side is reworded.');
process.exit(1);
