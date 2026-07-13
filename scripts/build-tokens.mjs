#!/usr/bin/env node
/**
 * tokens:check — verify the web app's CSS custom properties in
 * src/styles/tokens.css match the canonical values in @plot/core/tokens.js
 * (the cross-platform source of truth, also consumed by plot-mobile).
 *
 *   node scripts/build-tokens.mjs --check
 *
 * Read-only: it does NOT rewrite tokens.css (so there's no styling-regression
 * risk). It only checks the color + radii subset that both platforms share;
 * web-only tokens (shadows, motion, glass, layout, fonts) are ignored.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors, radii, cssVarName } from '@plot/core/tokens.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(__dirname, '..', 'apps', 'web', 'src', 'styles', 'tokens.css'), 'utf8');

// Extract a `selector { ... }` block body.
function block(selector) {
  const re = new RegExp(`${selector.replace(/[[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  return css.match(re)?.[1] ?? '';
}
// Parse `--name: value;` declarations from a block into a map.
function vars(body) {
  const map = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}

const rootVars = vars(block(':root'));
const darkVars = vars(block('[data-theme="dark"]'));

const mismatches = [];
const checkSet = (jsColors, cssVars, label) => {
  for (const [key, expected] of Object.entries(jsColors)) {
    const name = cssVarName(key);
    const actual = cssVars[name];
    if (actual !== expected) mismatches.push(`${label} ${name}: css=${actual ?? '(absent)'} core=${expected}`);
  }
};

checkSet(colors.light, rootVars, 'light');
checkSet(colors.dark, darkVars, 'dark');
for (const [key, px] of Object.entries(radii)) {
  const name = `--radius-${key}`;
  const expected = `${px}px`;
  if (rootVars[name] !== expected) mismatches.push(`radii ${name}: css=${rootVars[name] ?? '(absent)'} core=${expected}`);
}

if (mismatches.length) {
  console.error('✗ tokens.css is out of sync with @plot/core/tokens.js:');
  mismatches.forEach((m) => console.error(`    ${m}`));
  console.error('\nUpdate whichever is wrong so the web app and plot-mobile share one source of truth.');
  process.exit(1);
}
console.log(`✓ tokens in sync (${Object.keys(colors.light).length} light + ${Object.keys(colors.dark).length} dark colors + ${Object.keys(radii).length} radii)`);
