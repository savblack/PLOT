#!/usr/bin/env node
/**
 * Shared footer build step for the static marketing site.
 *
 * Single source of truth: website/_partials/footer.html
 * This injects that markup into each static page between the
 * `<!-- footer:start -->` / `<!-- footer:end -->` markers, committing the
 * result so Vercel keeps serving raw static files (no runtime/deploy change).
 *
 * Usage:
 *   node scripts/build-footer.mjs          # rewrite the footer block in each page
 *   node scripts/build-footer.mjs --check  # verify pages are in sync (CI); exit 1 if not
 *
 * On first run (no markers yet) it replaces the page's existing <footer> element
 * and wraps it in the markers, so it is self-installing.
 *
 * Footer CSS still lives in each page's <style> (the homepage adds extra
 * bottom padding for its ticker); only the markup is shared here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'website');
const PARTIAL = join(WEB, '_partials', 'footer.html');
const PAGES = ['index.html', 'about.html', 'privacy.html', 'terms.html'];

const START = '  <!-- footer:start (generated from _partials/footer.html — edit there, then run `npm run footer`) -->';
const END = '  <!-- footer:end -->';

const MARKER_RE = /[^\S\n]*<!-- footer:start\b[\s\S]*?<!-- footer:end -->/;
const FOOTER_RE = /[^\S\n]*<footer\b[\s\S]*?<\/footer>/;

const check = process.argv.includes('--check');

const footer = readFileSync(PARTIAL, 'utf8').replace(/\s+$/, '');
const block = `${START}\n${footer}\n${END}`;

let drift = [];

for (const page of PAGES) {
  const path = join(WEB, page);
  const src = readFileSync(path, 'utf8');

  const rx = MARKER_RE.test(src) ? MARKER_RE : FOOTER_RE;
  if (!rx.test(src)) {
    console.error(`✗ ${page}: no footer markers or <footer> element found`);
    process.exitCode = 1;
    continue;
  }

  const next = src.replace(rx, block);

  if (next === src) {
    console.log(`✓ ${page}: already in sync`);
    continue;
  }

  if (check) {
    drift.push(page);
    console.error(`✗ ${page}: footer out of sync with _partials/footer.html`);
  } else {
    writeFileSync(path, next);
    console.log(`• ${page}: footer updated`);
  }
}

if (check && drift.length) {
  console.error(`\n${drift.length} page(s) out of sync. Run \`npm run footer\` and commit.`);
  process.exit(1);
}

if (!check) console.log('done');
