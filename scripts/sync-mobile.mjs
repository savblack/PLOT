#!/usr/bin/env node
/**
 * sync-mobile — the mechanical half of the web→mobile sync (manual / on-demand).
 *
 * Run from the web repo:
 *   node scripts/sync-mobile.mjs --mobile <path-to-plot-mobile> [--since <gitref>] [--mark]
 *
 * What it does:
 *   1. Mirrors src/core → <mobile>/lib/core (byte-for-byte) and reports whether
 *      anything changed — this is the part that propagates with zero human edits.
 *   2. Diffs web src/ changes since the last sync point and CLASSIFIES them:
 *        • core/*            → auto-propagated above (open a plot-mobile PR)
 *        • components/pages/ → UI work-list (a human / Claude drafts the RN screen)
 *        • routing/styles    → UI work-list
 *        • DOM-only / CAPTCHA→ flagged, not portable as-is
 *   3. With --mark, advances the stored sync marker to HEAD.
 *
 * The model-driven step (drafting the React Native equivalent of a changed web
 * component) is intentionally NOT automated here — see docs/sync-mobile.md for
 * the playbook. This script removes the mechanical toil and stops core drift.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const MARKER = resolve(__dirname, 'sync-mobile.state.json');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; };
const mobilePath = opt('--mobile') || process.env.PLOT_MOBILE_PATH;
const mark = args.includes('--mark');

if (!mobilePath) {
  console.error('Usage: node scripts/sync-mobile.mjs --mobile <path> [--since <ref>] [--mark]');
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8' }).trim();
const head = git('rev-parse', 'HEAD');

// Resolve the "since" ref: explicit flag → stored marker → first commit.
let since = opt('--since');
if (!since && existsSync(MARKER)) since = JSON.parse(readFileSync(MARKER, 'utf8')).lastWebSha;
if (!since) since = git('rev-list', '--max-parents=0', 'HEAD').split('\n').pop();

// 1) Mirror core, capturing whether it was already in sync.
let coreInSync = true;
try {
  execFileSync('node', [resolve(__dirname, 'mirror-core.mjs'), mobilePath, '--check'],
    { cwd: repoRoot, stdio: 'pipe' });
} catch { coreInSync = false; }
execFileSync('node', [resolve(__dirname, 'mirror-core.mjs'), mobilePath], { cwd: repoRoot, stdio: 'inherit' });

// 2) Classify web src/ changes since the marker.
const changed = since === head ? [] : git('diff', '--name-only', `${since}..HEAD`, '--', 'src/')
  .split('\n').filter(Boolean);

const DOM_ONLY = ['src/utils/ics.js', 'src/utils/exportData.js', 'src/utils/redirects.js',
  'src/utils/interactive.js', 'src/utils/mediaPanel.js', 'src/pages/AuthPage.jsx'];

const buckets = { core: [], ui: [], flagged: [], other: [] };
for (const f of changed) {
  if (f.startsWith('src/core/')) buckets.core.push(f);
  else if (DOM_ONLY.includes(f)) buckets.flagged.push(f);
  else if (/^src\/(components|pages)\//.test(f) || f === 'src/router.jsx' || f === 'src/App.jsx'
    || f.startsWith('src/styles/')) buckets.ui.push(f);
  else buckets.other.push(f);
}

// 3) Report.
const line = '─'.repeat(60);
console.log(`\n${line}\nsync-mobile  ${since.slice(0, 8)}..${head.slice(0, 8)}\n${line}`);
console.log(`Core: ${coreInSync ? 'was already in sync' : 'was STALE — re-mirrored'}. ` +
  `Open a plot-mobile PR with the lib/core changes if any.`);
const show = (label, files) => {
  console.log(`\n${label} (${files.length})`);
  files.forEach((f) => console.log(`  • ${f}`));
};
if (buckets.core.length) show('CORE changed → propagated automatically', buckets.core);
if (buckets.ui.length) show('UI deltas → draft the RN equivalent (see docs/sync-mobile.md)', buckets.ui);
if (buckets.flagged.length) show('FLAGGED → DOM/web-only, not portable as-is', buckets.flagged);
if (buckets.other.length) show('OTHER changed src/ files → review', buckets.other);
if (!changed.length) console.log('\nNo web src/ changes since the last sync marker.');

if (mark) {
  writeFileSync(MARKER, JSON.stringify({ lastWebSha: head }, null, 2) + '\n');
  console.log(`\n✓ Marker advanced to ${head.slice(0, 8)} (commit scripts/sync-mobile.state.json)`);
} else if (changed.length) {
  console.log(`\nRe-run with --mark once the mobile PR is opened to advance the sync point.`);
}
