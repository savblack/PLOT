// One-off codemod: replace hardcoded literals with the catalog reference that
// owns them. Companion to scripts/check-hardcoded-copy.mjs, which finds them.
//
// Not wired into CI — it's a migration aid. Kept in the repo because the same
// sweep is worth re-running as more copy moves into the catalog.
//
//   node scripts/adopt-shared-copy.mjs --dry-run
//   node scripts/adopt-shared-copy.mjs
//
// Owner selection matters more than it looks. "Clear search" exists in both
// onboardingFlow and (conceptually) settings, so a naive first-match rewrite
// would have settings.tsx importing ONBOARDING_FLOW — technically identical
// output, semantically wrong, and a trap for whoever rewords the onboarding
// string later. So a literal is only rewritten when its owner is either the
// module matching that file's surface, or common.js. Anything else is reported
// and left alone for a human to place.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();
const CATALOG = 'packages/core/copy';
const MIN_LENGTH = 12;
const DRY = process.argv.includes('--dry-run');

// Which catalog module owns each app file's surface.
const SURFACE = [
  [/apps\/mobile\/app\/\(auth\)\//,            'authPage.js'],
  [/apps\/mobile\/app\/\(app\)\/settings\./,   'settingsView.js'],
  [/apps\/mobile\/app\/\(app\)\/my-lists\./,   'watchlistView.js'],
  [/apps\/mobile\/app\/\(app\)\/search\./,     'media.js'],
  [/apps\/mobile\/app\/\(app\)\/u\//,          'publicProfilePage.js'],
  [/apps\/mobile\/app\/\(app\)\/index\./,      'media.js'],
  [/apps\/mobile\/app\/\(app\)\/calendar\./,   'calendarView.js'],
  [/apps\/mobile\/app\/\(app\)\/guide\./,      'epgView.js'],
  [/apps\/mobile\/components\/MediaPanel\./,   'mediaPanel.js'],
  [/apps\/mobile\/components\/ImportHistory/,  'importView.js'],
  [/apps\/web\/src\/components\/MyListsView/,  'watchlistView.js'],
  [/apps\/web\/src\/components\/DiscoverView/, 'media.js'],
  [/apps\/web\/src\/components\/SettingsView/, 'settingsView.js'],
  [/apps\/web\/src\/components\/WatchingView/, 'watchlistView.js'],
  [/apps\/web\/src\/components\/SearchView/,   'media.js'],
  [/apps\/web\/src\/pages\/ResetPassword/,     'resetPasswordPage.js'],
  [/apps\/web\/src\/pages\/OnboardingFlow/,     'onboardingFlow.js'],
  [/apps\/web\/src\/pages\/AuthPage/,           'authPage.js'],
  [/apps\/mobile\/app\/onboarding\//,           'onboardingFlow.js'],
];

// Dev-only style guide: it quotes copy as example content on purpose.
const EXCLUDE = [/DesignSystemPage/];

const IMPORT_PATH = {
  web: (mod) => `../copy/${mod}`,
  mobileApp2: (mod) => `@plot/core/copy/${mod}`,
};

function walk(dir, out = []) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (!/\.(jsx?|tsx?)$/.test(e) || /\.(test|stories)\.[jt]sx?$/.test(e)) continue;
    out.push(p);
  }
  return out;
}

const owners = new Map();   // literal -> [{ mod, sym, path }]
for (const file of readdirSync(join(ROOT, CATALOG)).filter(f => f.endsWith('.js'))) {
  const mod = await import(join(ROOT, CATALOG, file));
  const rec = (val, sym, path) => {
    if (typeof val === 'string') {
      if (val.length >= MIN_LENGTH && val.includes(' ')) {
        if (!owners.has(val)) owners.set(val, []);
        owners.get(val).push({ mod: file, sym, path });
      }
      return;
    }
    if (val && typeof val === 'object') for (const [k, v] of Object.entries(val)) rec(v, sym, path ? `${path}.${k}` : k);
  };
  for (const [sym, value] of Object.entries(mod)) rec(value, sym, '');
}

const FILES = [
  'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/hooks',
  'apps/web/src/components', 'apps/web/src/pages',
].flatMap(d => walk(join(ROOT, d)));

let rewritten = 0, skipped = [];

for (const file of FILES) {
  const rel = relative(ROOT, file);
  if (EXCLUDE.some(re => re.test(rel))) continue;

  const surface = SURFACE.find(([re]) => re.test(rel))?.[1];
  let src = readFileSync(file, 'utf8');
  const original = src;
  const needed = new Map();  // mod -> sym

  src = src.replace(/(['"])((?:(?!\1)[^\\\n]|\\.){12,300})\1/g, (whole, q, body, offset) => {
    const literal = body.replace(/\\'/g, "'").replace(/\\"/g, '"');
    const cands = owners.get(literal);
    if (!cands) return whole;

    // Prefer the file's own surface module, else common.js. Never anything else.
    // common.js and media.js are the designated cross-surface modules, so they
    // are always acceptable owners regardless of which file we're in.
    const pick = cands.find(c => c.mod === surface)
      || cands.find(c => c.mod === 'common.js')
      || cands.find(c => c.mod === 'media.js');
    if (!pick) { skipped.push({ rel, literal, saw: cands.map(c => c.mod).join(', ') }); return whole; }

    // Inside a comment? Leave it.
    const lineStart = src.lastIndexOf('\n', offset) + 1;
    const line = src.slice(lineStart, offset);
    if (line.includes('//') || line.trimStart().startsWith('*')) return whole;

    needed.set(pick.mod, pick.sym);
    const ref = `${pick.sym}.${pick.path}`;

    // `attr="literal"` in JSX needs braces; a bare literal does not.
    const before = src.slice(Math.max(0, offset - 40), offset);
    rewritten++;
    return /[A-Za-z0-9_]+=$/.test(before) ? `{${ref}}` : ref;
  });

  if (src === original) continue;

  // Add any imports the rewrite now needs.
  for (const [mod, sym] of needed) {
    if (new RegExp(`\\b${sym}\\b[\\s\\S]{0,80}from`).test(original)) continue;
    const spec = rel.startsWith('apps/web/') ? IMPORT_PATH.web(mod) : IMPORT_PATH.mobileApp2(mod);
    const line = `import { ${sym} } from '${spec}';\n`;
    const lastImport = src.lastIndexOf('\nimport ');
    const insertAt = lastImport === -1 ? 0 : src.indexOf('\n', lastImport + 1) + 1;
    src = src.slice(0, insertAt) + line + src.slice(insertAt);
  }

  console.log(`${DRY ? '→' : '✓'} ${rel}`);
  if (!DRY) writeFileSync(file, src);
}

console.log(`\n${DRY ? 'Would rewrite' : 'Rewrote'} ${rewritten} literal(s).`);
if (skipped.length) {
  console.log(`\n${skipped.length} left alone — owner is neither the file's surface module nor common.js:`);
  for (const s of skipped) console.log(`  ${s.rel}\n      ${JSON.stringify(s.literal.slice(0, 64))}  (owned by ${s.saw})`);
}
