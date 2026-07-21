#!/usr/bin/env node
/**
 * tokens:build / tokens:check — keep the web app's canonical CSS custom
 * properties in sync with @plot/core/tokens.js (the cross-platform source of
 * truth, also consumed by plot-mobile).
 *
 *   node scripts/build-tokens.mjs --write   # regenerate the managed block in tokens.css
 *   node scripts/build-tokens.mjs --check   # CI: fail if the managed block is stale
 *
 * Only the COLOR + RADII subset is generated — it lives between the
 * `@tokens:start` / `@tokens:end` markers in apps/web/src/styles/tokens.css.
 * Web-only tokens (typography, layout, motion, glass, shadow) are hand-authored
 * OUTSIDE the markers and are never touched here. Edit values in tokens.js, then
 * run --write; --check enforces that nobody hand-patched the generated block.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors, radii, cssVarName } from '@plot/core/tokens.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(__dirname, '..', 'apps', 'web', 'src', 'styles', 'tokens.css');

// Render the generated declarations for one theme block.
function emit(colorSet, { withRadii }) {
  const lines = Object.entries(colorSet).map(([key, value]) => `  ${cssVarName(key)}: ${value};`);
  if (withRadii) {
    for (const [key, px] of Object.entries(radii)) lines.push(`  --radius-${key}: ${px}px;`);
  }
  return lines.join('\n');
}

// Replace the @tokens:start…@tokens:end region inside a given selector block.
function replaceRegion(css, selector, body) {
  const open = new RegExp(`${selector.replace(/[[\]]/g, '\\$&')}\\s*\\{`).exec(css);
  if (!open) throw new Error(`selector not found: ${selector}`);
  const blockStart = open.index + open[0].length;
  const blockEnd = css.indexOf('}', blockStart);
  const block = css.slice(blockStart, blockEnd);
  const region = /(\/\*\s*@tokens:start[\s\S]*?\*\/)([\s\S]*?)(\n[ \t]*\/\*\s*@tokens:end\s*\*\/)/;
  if (!region.test(block)) throw new Error(`@tokens markers not found in ${selector}`);
  const nextBlock = block.replace(region, `$1\n${body}$3`);
  return css.slice(0, blockStart) + nextBlock + css.slice(blockEnd);
}

const current = readFileSync(CSS_PATH, 'utf8');
let next = current;
next = replaceRegion(next, ':root', emit(colors.light, { withRadii: true }));
next = replaceRegion(next, '[data-theme="dark"]', emit(colors.dark, { withRadii: false }));

const mode = process.argv.includes('--write') ? 'write' : 'check';

if (mode === 'write') {
  if (next !== current) {
    writeFileSync(CSS_PATH, next);
    console.log('✓ tokens.css regenerated from @plot/core/tokens.js');
  } else {
    console.log('✓ tokens.css already up to date');
  }
} else {
  if (next !== current) {
    console.error('✗ tokens.css is out of sync with @plot/core/tokens.js.');
    console.error('  The generated color/radii block was hand-edited or values changed in tokens.js.');
    console.error('  Fix the value in packages/core/tokens.js, then run `npm run tokens:build`.');
    process.exit(1);
  }
  const n = Object.keys(colors.light).length + Object.keys(colors.dark).length + Object.keys(radii).length;
  console.log(`✓ tokens in sync (${n} generated color + radii declarations)`);
}
