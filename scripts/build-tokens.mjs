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
 * `@tokens:start` / `@tokens:end` markers in apps/web/src/styles/tokens.css,
 * plus the Premium theme family blocks between `@palettes:start` / `@palettes:end`
 * there and the family list + boot-loader colours in apps/web/index.html.
 * Web-only tokens (typography, layout, motion, glass, shadow) are hand-authored
 * OUTSIDE the markers and are never touched here. Edit values in tokens.js, then
 * run --write; --check enforces that nobody hand-patched the generated block.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors, themeFamilies, radii, cssVarName } from '@plot/core/tokens.js';
import { FAMILY_ALIASES, LEGACY_THEMES } from '@plot/core/themes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(__dirname, '..', 'apps', 'web', 'src', 'styles', 'tokens.css');
const HTML_PATH = resolve(__dirname, '..', 'apps', 'web', 'index.html');
const THEME_JS_PATH = resolve(__dirname, '..', 'apps', 'web', 'public', 'boot', 'theme.js');

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

// "#RRGGBB" -> "r,g,b" for the generated rgba() glass values.
function rgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
}

// Premium theme families: one :root[data-palette="<family>"][data-theme="<mode>"]
// block per variant, generated whole (glass included, derived from the
// variant's own ground) between the @palettes markers. The three-part selector
// outranks [data-theme="dark"], so a family wins over its base in any order.
function emitPalettes() {
  return Object.entries(themeFamilies).flatMap(([id, family]) => ['light', 'dark'].map((mode) => {
    const c = family[mode];
    const glass = mode === 'dark'
      ? [`  --glass-bg: rgba(${rgb(c.surface)},0.85);`, `  --glass-border: ${c.border};`]
      : [`  --glass-bg: rgba(${rgb(c.bg)},0.86);`, `  --glass-border: rgba(${rgb(c.textPrimary)},0.06);`];
    return [`:root[data-palette="${id}"][data-theme="${mode}"] {`, emit(c, { withRadii: false }), ...glass, '}'].join('\n');
  })).join('\n');
}

// Replace the text between `start` and `end` marker lines (markers kept).
function replaceBetween(text, start, end, body, file) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`${start} … ${end} markers not found in ${file}`);
  const lineEnd = text.indexOf('\n', a) + 1;
  const indent = text.slice(text.lastIndexOf('\n', b) + 1, b);
  return text.slice(0, lineEnd) + body + '\n' + indent + text.slice(b);
}

const current = readFileSync(CSS_PATH, 'utf8');
let next = current;
next = replaceRegion(next, ':root', emit(colors.light, { withRadii: true }));
next = replaceRegion(next, '[data-theme="dark"]', emit(colors.dark, { withRadii: false }));
next = replaceBetween(next, '/* @palettes:start', '/* @palettes:end */', emitPalettes(), 'tokens.css');

// The pre-paint script (public/boot/theme.js) runs before any module loads, so
// it carries its own copy of the family ids and the retired single-theme ids;
// index.html carries each variant's ground, ink and fill for the boot loader
// (critical CSS).
const htmlCurrent = readFileSync(HTML_PATH, 'utf8');
const themeJsCurrent = readFileSync(THEME_JS_PATH, 'utf8');
const q = (value) => `'${value}'`;
const familyList = Object.keys(themeFamilies).map(id => `${q(id)}: 1`).join(', ');
const legacyList = Object.entries(LEGACY_THEMES).map(([id, p]) => `${q(id)}: [${q(p.family)}, ${q(p.mode)}]`).join(', ');
const themeJsNext = replaceBetween(themeJsCurrent, '// @palettes:start', '// @palettes:end', [
  `    var families = { ${familyList} };`,
  `    var legacy = { ${legacyList} };`,
  `    var familyAliases = { ${Object.entries(FAMILY_ALIASES).map(([from, to]) => `${q(from)}: ${q(to)}`).join(', ')} };`,
].join('\n'), 'boot/theme.js');
const htmlNext = replaceBetween(htmlCurrent, '/* @palettes:start', '/* @palettes:end */', Object.entries(themeFamilies).flatMap(([id, family]) => ['light', 'dark'].map((mode) => {
  const c = family[mode];
  const sel = `[data-palette="${id}"][data-theme="${mode}"]`;
  return [
    `      ${sel} body { background: ${c.bg}; }`,
    `      ${sel} .initial-wordmark { color: ${c.textPrimary}; }`,
    `      ${sel} .initial-wordmark::after { background: ${c.accentFill}; }`,
  ].join('\n');
})).join('\n'), 'index.html');

const mode = process.argv.includes('--write') ? 'write' : 'check';

if (mode === 'write') {
  if (next !== current || htmlNext !== htmlCurrent || themeJsNext !== themeJsCurrent) {
    writeFileSync(CSS_PATH, next);
    writeFileSync(HTML_PATH, htmlNext);
    writeFileSync(THEME_JS_PATH, themeJsNext);
    console.log('✓ tokens.css, index.html and boot/theme.js regenerated from @plot/core/tokens.js');
  } else {
    console.log('✓ tokens.css, index.html and boot/theme.js already up to date');
  }
} else {
  if (next !== current || htmlNext !== htmlCurrent || themeJsNext !== themeJsCurrent) {
    const stale = next !== current ? 'tokens.css' : htmlNext !== htmlCurrent ? 'index.html' : 'boot/theme.js';
    console.error(`✗ ${stale} is out of sync with @plot/core/tokens.js.`);
    console.error('  A generated block was hand-edited or values changed in tokens.js.');
    console.error('  Fix the value in packages/core/tokens.js, then run `npm run tokens:build`.');
    process.exit(1);
  }
  const n = Object.keys(colors.light).length + Object.keys(colors.dark).length + Object.keys(radii).length
    + Object.values(themeFamilies).reduce((sum, f) => sum + Object.keys(f.light).length + Object.keys(f.dark).length, 0);
  console.log(`✓ tokens in sync (${n} generated color + radii declarations, ${Object.keys(themeFamilies).length} Premium families)`);
}
