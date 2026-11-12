#!/usr/bin/env node
/**
 * Fails the build if the web app's JavaScript grows past its budget.
 *
 * WHY: nothing watched bundle size, so a heavy dependency or an accidental
 * eager import could slow every first load without any check noticing.
 * Budgets are gzip sizes measured from apps/web/dist after `pnpm run build`:
 *
 *   initial  what the browser fetches before the app can start: the entry
 *            script in index.html plus every modulepreload it lists
 *   total    every .js file in dist/assets (lazy routes included)
 *   largest  the single biggest .js file
 *
 * Each budget is about 10% above the size on 2026-11-12. Raising one is a
 * deliberate decision: change the number here in the same PR that needs it,
 * and say why in the PR.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(import.meta.dirname, '..', 'apps', 'web', 'dist');
const KB = 1024;
export const BUDGET = {
  initial: 82 * KB,
  total: 860 * KB,
  largest: 125 * KB,
};

const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;

/** Asset paths the entry HTML loads up front. Exported for tests. */
export function initialAssets(html) {
  const paths = new Set();
  for (const m of html.matchAll(/<(?:script[^>]*\bsrc|link[^>]*rel="modulepreload"[^>]*\bhref)="\/(assets\/[^"]+\.js)"/g)) paths.add(m[1]);
  return [...paths];
}

/** Over-budget lines for a measurement. Exported for tests. */
export function overBudget(sizes, budget = BUDGET) {
  return Object.keys(budget)
    .filter((k) => sizes[k] > budget[k])
    .map((k) => `${k}: ${(sizes[k] / KB).toFixed(1)} KB gz is over the ${(budget[k] / KB).toFixed(0)} KB budget`);
}

function measure() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const assets = join(DIST, 'assets');
  const js = readdirSync(assets).filter((f) => f.endsWith('.js'));
  const size = Object.fromEntries(js.map((f) => [f, gz(join(assets, f))]));
  const initial = initialAssets(html).reduce((n, p) => n + (size[p.slice('assets/'.length)] ?? 0), 0);
  const total = Object.values(size).reduce((a, b) => a + b, 0);
  const [largestName, largest] = Object.entries(size).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return { initial, total, largest, largestName };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('bundle-size: apps/web/dist is missing. Run `pnpm run build` first.');
    process.exit(1);
  }
  const sizes = measure();
  const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
  console.log(`bundle-size: initial ${fmt(sizes.initial)} / ${fmt(BUDGET.initial)}, total ${fmt(sizes.total)} / ${fmt(BUDGET.total)}, largest ${fmt(sizes.largest)} / ${fmt(BUDGET.largest)} (${sizes.largestName}), all gzip`);
  const over = overBudget(sizes);
  if (over.length) {
    console.error(`bundle-size: over budget\n  ${over.join('\n  ')}\nFind what grew (a new dependency or an eager import of a lazy route), or raise the budget in scripts/check-bundle-size.mjs and say why in the PR.`);
    process.exit(1);
  }
}
