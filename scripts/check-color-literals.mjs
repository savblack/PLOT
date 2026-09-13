#!/usr/bin/env node
/**
 * colors:check — stop new raw colour literals appearing in app code.
 *
 *   node scripts/check-color-literals.mjs           # verify (CI)
 *   node scripts/check-color-literals.mjs --write   # re-record the baseline
 *
 * WHY: tokens:check only proves apps/web/src/styles/tokens.css matches
 * @plot/core/tokens.js. Nothing looked *inside* components, so hardcoded values
 * accumulated there unseen — and because they were picked against the dark
 * panel, several were unreadable in light mode. The media panel alone reached
 * thirteen before anyone measured it; the save toast's tick sat at 1.66:1 and
 * the error banner at 1.05:1, which is an error message you cannot read.
 *
 * RATCHET, not a wall. There are a few hundred of these across 30-odd files and
 * many are legitimate. Failing the build on all of them would mean either a
 * huge unrelated change or an ignored red X. So this records a per-file count
 * and fails only when a file grows or a new one appears, the same way mobile's
 * lint backlog is handled. Counts that DROP are reported as a nudge to
 * re-record, so the baseline only ever tightens.
 *
 * Neutrals are not counted: pure black and white at any alpha are how scrims,
 * shadows and image overlays are written, and no token would improve them.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts/color-literal-baseline.json');

const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]+[^)]*\)/g;
const NEUTRAL = /^(#(?:fff(?:fff)?|000(?:000)?)|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*[^)]*\)|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[^)]*\))$/i;

// Surfaces whose job is to show colour, or which are not product UI.
const SKIP = [
  /styles\/tokens\.css$/,          // generated from @plot/core/tokens.js
  /pages\/DesignSystemPage\./,     // the swatch showcase itself
  /\/stories\//,                   // Storybook fixtures
  /\.storybook\//,
];

const scan = (dir, exts, out) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.wrangler') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { scan(full, exts, out); continue; }
    if (!exts.some(x => entry.endsWith(x))) continue;
    const rel = relative(ROOT, full);
    if (SKIP.some(rx => rx.test(rel))) continue;
    const found = (readFileSync(full, 'utf8').match(LITERAL) || []).filter(m => !NEUTRAL.test(m));
    if (found.length) out[rel] = found.length;
  }
  return out;
};

const counts = {};
scan(join(ROOT, 'apps/web/src'), ['.js', '.jsx', '.css'], counts);
scan(join(ROOT, 'apps/mobile'), ['.ts', '.tsx'], counts);
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
  const total = Object.values(sorted).reduce((n, v) => n + v, 0);
  console.log(`✓ recorded ${total} colour literals across ${Object.keys(sorted).length} files`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const grown = [];
const shrunk = [];
for (const [file, n] of Object.entries(sorted)) {
  const was = baseline[file];
  if (was === undefined) grown.push(`${file}: ${n} new (this file had none)`);
  else if (n > was) grown.push(`${file}: ${was} → ${n}`);
  else if (n < was) shrunk.push(`${file}: ${was} → ${n}`);
}
for (const file of Object.keys(baseline)) {
  if (sorted[file] === undefined) shrunk.push(`${file}: ${baseline[file]} → 0`);
}

if (grown.length) {
  console.error('✗ new raw colour literals in app code:');
  for (const line of grown) console.error(`    ${line}`);
  console.error('\n  Use a token from @plot/core/tokens.js instead. If the value genuinely');
  console.error('  belongs to no token, add one there and run `npm run tokens:build`.');
  console.error('  Deliberate exception? Re-record with `node scripts/check-color-literals.mjs --write`');
  console.error('  and say why in the commit message.');
  process.exit(1);
}

if (shrunk.length) {
  console.log('✓ no new colour literals. Some files improved, so the baseline can tighten:');
  for (const line of shrunk) console.log(`    ${line}`);
  console.log('  Re-record with: node scripts/check-color-literals.mjs --write');
} else {
  const total = Object.values(sorted).reduce((n, v) => n + v, 0);
  console.log(`✓ no new colour literals (${total} known, ${Object.keys(sorted).length} files)`);
}
