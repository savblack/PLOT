#!/usr/bin/env node
/**
 * tokens:marketing — verify the marketing surfaces stay in sync with the
 * canonical brand values in @plot/core/tokens.js (the same source the app CSS
 * is checked against by tokens:check). Read-only.
 *
 *   node scripts/check-marketing-tokens.mjs
 *
 * Covers:
 *   - apps/website/theme.css            → brand accent, accent-dim, success, radii (light)
 *   - marketing/templates/base.css → dark accent + media chips (social cards)
 *
 * Email/newsletter generators (scripts/push-auth-emails.mjs,
 * marketing/newsletter/send-digest.mjs) import the values directly, so they
 * can't drift and aren't checked here.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors, radii } from '@plot/core/tokens.js';

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

// 1. apps/website/theme.css — light brand tokens the marketing site consumes.
{
  const v = vars(rootBlock(read('apps/website/theme.css')));
  eq('apps/website/theme.css --accent', v['--accent'], colors.light.accent);
  eq('apps/website/theme.css --accent-dim', v['--accent-dim'], colors.light.accentDim);
  // The warm system (Sept 2026): ground, card cream, ink and the pink fill are
  // one value across the app and the marketing site.
  eq('apps/website/theme.css --bg', v['--bg'], colors.light.bg);
  eq('apps/website/theme.css --surface', v['--surface'], colors.light.surfaceSunken);
  eq('apps/website/theme.css --text', v['--text'], colors.light.textPrimary);
  eq('apps/website/theme.css --text-secondary', v['--text-secondary'], colors.light.textSecondary);
  eq('apps/website/theme.css --fill', v['--fill'], colors.light.accentFill);
  eq('apps/website/theme.css --fill-hover', v['--fill-hover'], colors.light.accentFillHover);
  eq('apps/website/theme.css --success', v['--success'], colors.light.chipNow);
  eq('apps/website/theme.css --r-badge', v['--r-badge'], `${radii.badge}px`);
  eq('apps/website/theme.css --r-md', v['--r-md'], `${radii.md}px`);
  eq('apps/website/theme.css --r-lg', v['--r-lg'], `${radii.lg}px`);
  eq('apps/website/theme.css --r-pill', v['--r-pill'], `${radii.pill}px`);
}

// 2. marketing/templates/base.css — dark accent + media chips for social cards.
{
  const v = vars(rootBlock(read('marketing/templates/base.css')));
  eq('base.css --bg', v['--bg'], colors.dark.bg);
  eq('base.css --text', v['--text'], colors.dark.textPrimary);
  eq('base.css --accent', v['--accent'], colors.dark.accent);
  eq('base.css --chip-cinema', v['--chip-cinema'], colors.dark.chipCinema);
  eq('base.css --chip-streaming', v['--chip-streaming'], colors.dark.chipStreaming);
  eq('base.css --chip-episode', v['--chip-episode'], colors.dark.chipEpisode);
}

// The remaining static collateral (Instagram marks, wordmark headers) is
// cream/charcoal only and carries no accent, so there is nothing to check there.

if (fails.length) {
  console.error('✗ marketing tokens out of sync with @plot/core/tokens.js:');
  fails.forEach((f) => console.error(`    ${f}`));
  console.error('\nUpdate whichever is wrong so the app and marketing surfaces share one source of truth.');
  process.exit(1);
}
console.log('✓ marketing tokens in sync (theme.css + base.css)');
