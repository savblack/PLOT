#!/usr/bin/env node
/**
 * Changelog build step for the marketing site.
 *
 * Single source of truth: apps/website/data/changelog.json
 *
 * Two consumers are kept in sync from it:
 *   1. apps/website/changelog.html — entry markup between changelog markers
 *   2. apps/website/copy/changelog.js — Storybook Content catalog
 *
 * Usage:
 *   node scripts/build-changelog.mjs          # rewrite generated consumers
 *   node scripts/build-changelog.mjs --check  # verify sync (CI); exit 1 if not
 *   node scripts/build-changelog.mjs --add [--version V] [--date YYYY-MM-DD]
 *     Prepend a scaffold entry to the JSON (empty New/Improved/Fixed), then
 *     regenerate. Fill in the bullets before you ship.
 *
 * The page chrome (nav, styles, footer) stays hand-edited. Only the <main>
 * body between the markers is generated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps', 'website');
const DATA = join(WEB, 'data', 'changelog.json');
const HTML = join(WEB, 'changelog.html');
const COPY = join(WEB, 'copy', 'changelog.js');

const START = '  <!-- changelog:start (generated from data/changelog.json — edit there, then run `pnpm run changelog`) -->';
const END = '  <!-- changelog:end -->';
const MARKER_RE = /[^\S\n]*<!-- changelog:start\b[\s\S]*?<!-- changelog:end -->/;

const check = process.argv.includes('--check');
const add = process.argv.includes('--add');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsString(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function jsStringArray(items) {
  if (!items.length) return '[]';
  return `[\n${items.map((item) => `        '${escapeJsString(item)}'`).join(',\n')},\n      ]`;
}

/** @param {string} iso `YYYY-MM-DD` */
function dateLabelFromIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid date ${iso}; expected YYYY-MM-DD`);
  const day = Number(m[3]);
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) throw new Error(`Invalid month in ${iso}`);
  return `${day} ${month} ${m[1]}`;
}

/** Calendar version from a Date: `YYYY.M.D` (no zero-pad on M/D). */
function calendarVersion(d) {
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) {
    console.error(`✗ ${flag} needs a value`);
    process.exit(1);
  }
  return v;
}

function loadData() {
  return JSON.parse(readFileSync(DATA, 'utf8'));
}

function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('changelog.json must be an object');
  if (!Array.isArray(data.entries)) throw new Error('changelog.json.entries must be an array');
  const seen = new Set();
  let prevDate = null;
  for (const entry of data.entries) {
    if (!entry.version) throw new Error('each entry needs a version');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '')) {
      throw new Error(`entry ${entry.version}: date must be YYYY-MM-DD`);
    }
    if (seen.has(entry.version)) throw new Error(`duplicate version ${entry.version}`);
    seen.add(entry.version);
    if (prevDate !== null && entry.date > prevDate) {
      throw new Error(`entries must be newest-first; ${entry.version} (${entry.date}) is newer than the previous row`);
    }
    prevDate = entry.date;
    for (const key of ['new', 'improved', 'fixed']) {
      if (entry[key] != null && !Array.isArray(entry[key])) {
        throw new Error(`entry ${entry.version}: ${key} must be an array`);
      }
    }
  }
}

function renderBucket(label, items) {
  if (!items?.length) return '';
  const lis = items.map((item) => `        <li>${escapeHtml(item)}</li>`).join('\n');
  return `
      <h3>${escapeHtml(label)}</h3>
      <ul>
${lis}
      </ul>`;
}

function renderIntro(intro) {
  const escaped = escapeHtml(intro).replace(/\b(New|Improved|Fixed)\b/g, '<strong>$1</strong>');
  return `    <p class="page-intro">${escaped}</p>`;
}

function renderEntry(entry, buckets) {
  const newItems = entry.new || [];
  const improved = entry.improved || [];
  const fixed = entry.fixed || [];
  return `    <article class="changelog-entry" id="${escapeHtml(entry.version)}">
      <header class="changelog-entry-header">
        <h2>${escapeHtml(entry.version)}</h2>
        <time datetime="${escapeHtml(entry.date)}">${escapeHtml(entry.dateLabel)}</time>
      </header>
${renderBucket(buckets.new, newItems)}${renderBucket(buckets.improved, improved)}${renderBucket(buckets.fixed, fixed)}
    </article>`;
}

function renderMainInner(data) {
  const buckets = data.buckets || { new: 'New', improved: 'Improved', fixed: 'Fixed' };
  const entries = data.entries.map((e) => renderEntry(e, buckets)).join('\n\n');
  return `    <p class="page-label">${escapeHtml(data.pageLabel)}</p>
    <h1>${escapeHtml(data.h1)}</h1>
    <p class="page-meta">${escapeHtml(data.pageMeta)}</p>

${renderIntro(data.intro)}

${entries}`;
}

function renderHtmlBlock(data) {
  return `${START}\n${renderMainInner(data)}\n${END}`;
}

function renderCopyModule(data) {
  const buckets = data.buckets || { new: 'New', improved: 'Improved', fixed: 'Fixed' };
  const entriesJs = data.entries.map((entry) => {
    return `    {
      version: '${escapeJsString(entry.version)}',
      date: '${escapeJsString(entry.date)}',
      dateLabel: '${escapeJsString(entry.dateLabel)}',
      new: ${jsStringArray(entry.new || [])},
      improved: ${jsStringArray(entry.improved || [])},
      fixed: ${jsStringArray(entry.fixed || [])},
    }`;
  }).join(',\n');

  return `// @generated by scripts/build-changelog.mjs from apps/website/data/changelog.json
// Do not edit by hand — edit the JSON, then run \`pnpm run changelog\`.
// Reference-only copy catalog for apps/website/changelog.html. Not imported by
// the HTML — see copy/common.js for how this catalog is used.

export const CHANGELOG_PAGE = {
  meta: {
    title: '${escapeJsString(data.meta.title)}',
    description: '${escapeJsString(data.meta.description)}',
  },
  pageLabel: '${escapeJsString(data.pageLabel)}',
  h1: '${escapeJsString(data.h1)}',
  pageMeta: '${escapeJsString(data.pageMeta)}',
  intro:
    '${escapeJsString(data.intro)}',
  buckets: {
    new: '${escapeJsString(buckets.new)}',
    improved: '${escapeJsString(buckets.improved)}',
    fixed: '${escapeJsString(buckets.fixed)}',
  },
  // Keep newest-first. Source of truth is data/changelog.json.
  entries: [
${entriesJs},
  ],
};
`;
}

function sync(absPath, next) {
  const rel = relative(ROOT, absPath);
  let src;
  try {
    src = readFileSync(absPath, 'utf8');
  } catch {
    src = null;
  }
  if (src === next) {
    console.log(`✓ ${rel}: already in sync`);
    return;
  }
  if (check) {
    console.error(`✗ ${rel}: out of sync with data/changelog.json`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(absPath, next);
  console.log(`• ${rel}: updated`);
}

function injectHtml(data) {
  const block = renderHtmlBlock(data);
  const src = readFileSync(HTML, 'utf8');
  if (MARKER_RE.test(src)) {
    return src.replace(MARKER_RE, block);
  }
  // First install: wrap the existing <main>…</main> inner content.
  const mainRe = /(<main class="page-wrap">\n)([\s\S]*?)(\n  <\/main>)/;
  if (!mainRe.test(src)) {
    console.error('✗ apps/website/changelog.html: could not find <main class="page-wrap">');
    process.exit(1);
  }
  return src.replace(mainRe, `$1${block}$3`);
}

function doAdd() {
  const data = loadData();
  validate(data);

  const today = new Date();
  const date = argValue('--date') || isoDate(today);
  const version = argValue('--version') || calendarVersion(
    (() => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (!m) {
        console.error(`✗ --date must be YYYY-MM-DD (got ${date})`);
        process.exit(1);
      }
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    })(),
  );

  if (data.entries.some((e) => e.version === version)) {
    console.error(`✗ version ${version} already exists in changelog.json`);
    process.exit(1);
  }

  const entry = {
    version,
    date,
    dateLabel: dateLabelFromIso(date),
    new: [],
    improved: [],
    fixed: [],
  };
  data.entries.unshift(entry);
  writeFileSync(DATA, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`• apps/website/data/changelog.json: prepended ${version} (${entry.dateLabel})`);
  console.log('  Fill new / improved / fixed, then commit. Empty buckets are omitted on the page.');
}

if (add) {
  if (check) {
    console.error('✗ --add and --check cannot be combined');
    process.exit(1);
  }
  doAdd();
}

const data = loadData();
try {
  validate(data);
} catch (err) {
  console.error(`✗ data/changelog.json: ${err.message}`);
  process.exit(1);
}

sync(HTML, injectHtml(data));
sync(COPY, renderCopyModule(data));

if (check && process.exitCode) {
  console.error('\nRun `pnpm run changelog` and commit.');
  process.exit(1);
}

if (!check && !process.exitCode) console.log('done');
