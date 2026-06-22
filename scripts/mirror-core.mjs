#!/usr/bin/env node
/**
 * mirror-core — copy the shared platform-agnostic core from the web repo
 * (source of truth) into the mobile repo, byte-identically.
 *
 *   node scripts/mirror-core.mjs <mobile-repo-path>          # write/update lib/core
 *   node scripts/mirror-core.mjs <mobile-repo-path> --check  # CI drift-guard: exit 1 if out of sync
 *
 * The mobile path can also come from $PLOT_MOBILE_PATH. Files are copied
 * verbatim (no generated headers) so `--check` can do an exact diff — that is
 * what turns "the two silently drifted again" into a red build.
 *
 * core/ is JS + JSDoc: the web consumes it natively, and mobile (Expo tsconfig
 * has allowJs) imports it with JSDoc-derived types.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'src', 'core');
const DEST_REL = join('lib', 'core');

const args = process.argv.slice(2);
const check = args.includes('--check');
const mobilePath = args.find(a => !a.startsWith('--')) || process.env.PLOT_MOBILE_PATH;

if (!mobilePath) {
  console.error('Usage: node scripts/mirror-core.mjs <mobile-repo-path> [--check]');
  console.error('   or: PLOT_MOBILE_PATH=… node scripts/mirror-core.mjs [--check]');
  process.exit(2);
}

const destDir = resolve(mobilePath, DEST_REL);

// Recursively gather files under SRC (flat today, but future-proofed).
function walk(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = join(base, entry.name);
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

const files = walk(SRC);
const drifted = [];
let written = 0;

for (const rel of files) {
  const srcContent = readFileSync(join(SRC, rel), 'utf8');
  const destFile = join(destDir, rel);

  if (check) {
    const destContent = existsSync(destFile) ? readFileSync(destFile, 'utf8') : null;
    if (destContent !== srcContent) drifted.push(rel);
    continue;
  }

  mkdirSync(dirname(destFile), { recursive: true });
  writeFileSync(destFile, srcContent);
  written++;
}

if (check) {
  if (drifted.length) {
    console.error(`✗ core out of sync (${drifted.length} file(s)): run \`npm run mirror:core\``);
    drifted.forEach(f => console.error(`    ${f}`));
    process.exit(1);
  }
  console.log(`✓ core in sync (${files.length} files)`);
} else {
  console.log(`Mirrored ${written} core file(s) → ${destDir}`);
}
