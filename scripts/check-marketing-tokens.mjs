#!/usr/bin/env node
/**
 * tokens:marketing — verify the marketing surfaces stay in sync with the
 * canonical brand values in src/core/tokens.js (the same source the app CSS
 * is checked against by tokens:check). Read-only.
 *
 *   node scripts/check-marketing-tokens.mjs
 *
 * Covers:
 *   - website/theme.css            → brand accent, accent-dim, success, radii (light)
 *   - marketing/templates/base.css → dark accent + media chips (social cards)
 *   - marketing/assets/x-*         → static collateral carries the canonical accent
 *
 * Email/newsletter generators (scripts/push-auth-emails.mjs,
 * marketing/newsletter/send-digest.mjs) import the values directly, so they
 * can't drift and aren't checked here.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors, radii } from '../src/core/tokens.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const rootBlock = (css) => css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
const vars = (body) => {
  const map = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
};

const fails = [];
const eq = (label, actual, expected) => {
  if ((actual ?? '').toLowerCase() !== expected.toLowerCase()) {
    fails.push(`${label}: found ${actual ?? '(absent)'} — expected ${expected}`);
  }
};

// 1. website/theme.css — light brand tokens the marketing site consumes.
{
  const v = vars(rootBlock(read('website/theme.css')));
  eq('website/theme.css --accent', v['--accent'], colors.light.accent);
  eq('website/theme.css --accent-dim', v['--accent-dim'], colors.light.accentDim);
  eq('website/theme.css --success', v['--success'], colors.light.chipNow);
  eq('website/theme.css --r-badge', v['--r-badge'], `${radii.badge}px`);
  eq('website/theme.css --r-md', v['--r-md'], `${radii.md}px`);
  eq('website/theme.css --r-lg', v['--r-lg'], `${radii.lg}px`);
  eq('website/theme.css --r-pill', v['--r-pill'], `${radii.pill}px`);
}

// 2. marketing/templates/base.css — dark accent + media chips for social cards.
{
  const v = vars(rootBlock(read('marketing/templates/base.css')));
  eq('base.css --accent', v['--accent'], colors.dark.accent);
  eq('base.css --chip-cinema', v['--chip-cinema'], colors.dark.chipCinema);
  eq('base.css --chip-streaming', v['--chip-streaming'], colors.dark.chipStreaming);
  eq('base.css --chip-episode', v['--chip-episode'], colors.dark.chipEpisode);
}

// 3. Static social collateral must carry the canonical accent for its mode.
{
  const light = colors.light.accent.toLowerCase();
  const dark = colors.dark.accent.toLowerCase();
  const collateral = [
    ['marketing/assets/x-header-a.html', dark],
    ['marketing/assets/x-header-b.html', dark],
    ['marketing/assets/x-header-light-a.html', light],
    ['marketing/assets/x-header-light-b.html', light],
    ['marketing/assets/x-cover-wordmark-coral.svg', light],
  ];
  for (const [file, expected] of collateral) {
    if (!read(file).toLowerCase().includes(expected)) {
      fails.push(`${file}: missing canonical accent ${expected}`);
    }
  }
}

if (fails.length) {
  console.error('✗ marketing tokens out of sync with src/core/tokens.js:');
  fails.forEach((f) => console.error(`    ${f}`));
  console.error('\nUpdate whichever is wrong so the app and marketing surfaces share one source of truth.');
  process.exit(1);
}
console.log('✓ marketing tokens in sync (theme.css + base.css + collateral)');
