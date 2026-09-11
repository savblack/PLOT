// Fail the build when mobile's Discover sub-tabs drift out of step with the
// shared nav list in @plot/core.
//
// WHY THIS EXISTS
// PR #587 fixed a bug where the Upcoming tab was fully implemented and
// completely unreachable on main for several commits. UpcomingContent, the
// render branch and the type/genre filter wiring had all landed; the only
// thing missing was 'releases' in the MOBILE_READY allow-list, because a
// rebase resolved that one hunk in favour of the other side.
//
// tsc, eslint and CI were all green. They had to be: an allow-list missing an
// entry is a perfectly well-typed allow-list. No static check can tell that a
// Set literal was meant to have a fourth member, mobile has no test runner,
// and the app cannot currently be run on this machine at all (see
// docs/agents/web-mobile-parity.md), so there was no later gate either. The
// feature shipped, and shipped invisible.
//
// The fix is to make "missing" impossible to express. Every id in
// DISCOVER_TABS must appear in exactly one of two sets in index.tsx:
// MOBILE_READY (renders) or MOBILE_DEFERRED (deliberately held back, with a
// reason). Silence is no longer a valid state. Under that rule #587 is a build
// failure by name: 'releases' was in DISCOVER_TABS and in neither set.
//
// Rules:
//   1. unclassified   — a DISCOVER_TABS id in neither set
//   2. unknown        — a set names an id DISCOVER_TABS does not have
//   3. overlap        — an id in both sets
//   4. built-but-held — a deferred id that already has a render branch
//
// Rules 1 to 3 read only array literals, so they are exact. Rule 4 reads the
// JSX and can under-match if the ternary chain is reformatted; it is a bonus
// on top of the three that carry the weight.
//
// This is a static guard, not a substitute for running the app. The real fix
// is structural: one `tab id -> renderer` record, so a tab cannot exist
// without being reachable. That is a refactor of a ~1000-line component in an
// app that has never been executed, which is not a change to make blind.
// Revisit once the simulator blocker in docs/agents/web-mobile-parity.md is
// cleared. Until then, see docs/qa/mobile-device-smoke.md.
//
// Usage:
//   node scripts/check-mobile-tabs.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractDiscoverTabIds, extractSetLiteral, extractRenderedTabs, checkMobileTabs,
} from './lib/mobileTabChecks.mjs';

const ROOT = process.cwd();
const NAV_REL    = 'packages/core/navigation.js';
const SCREEN_REL = 'apps/mobile/app/(app)/index.tsx';

function read(rel) {
  try {
    return readFileSync(join(ROOT, ...rel.split('/')), 'utf8');
  } catch {
    console.error(`\n✗ cannot read ${rel}`);
    console.error('  This check is hard-wired to that path. If the file moved,');
    console.error('  update scripts/check-mobile-tabs.mjs to match.\n');
    process.exit(1);
  }
}

const nav    = read(NAV_REL);
const screen = read(SCREEN_REL);

let tabIds;
try {
  tabIds = extractDiscoverTabIds(nav);
} catch (err) {
  console.error(`\n✗ ${NAV_REL}: ${err.message}\n`);
  process.exit(1);
}

const ready    = extractSetLiteral(screen, 'MOBILE_READY');
const deferred = extractSetLiteral(screen, 'MOBILE_DEFERRED');

for (const [name, value] of [['MOBILE_READY', ready], ['MOBILE_DEFERRED', deferred]]) {
  if (value === null) {
    console.error(`\n✗ could not find ${name} in ${SCREEN_REL}`);
    console.error(`  Expected \`const ${name} = new Set([...])\`.`);
    console.error('  Both sets must exist even when one is empty: an empty');
    console.error('  MOBILE_DEFERRED is what "nothing is held back" looks like,');
    console.error('  and deleting it would restore the silence this check removes.\n');
    process.exit(1);
  }
}

const { ok, failures } = checkMobileTabs({
  tabIds, ready, deferred, rendered: extractRenderedTabs(screen),
});

const EXPLANATIONS = {
  unclassified: [
    `A tab in ${NAV_REL} that mobile never classifies is the #587 shape: it`,
    'silently does not render, and no type or lint check can see it.',
    'Add it to MOBILE_READY if mobile renders it, or to MOBILE_DEFERRED with a reason.',
  ],
  unknown: [
    'Either the id is a typo, or the tab was removed from the shared nav list',
    'and this entry is now dead. A stale entry silently does nothing.',
  ],
  overlap: [
    'The sets must be disjoint, or "is this tab shown?" has two answers.',
  ],
  'built-but-held': [
    'The tab is built but held back, which is exactly what #587 shipped.',
    'If it is ready, move it from MOBILE_DEFERRED to MOBILE_READY. If it is',
    'genuinely not ready, the render branch should not be on main yet.',
  ],
};

const HEADINGS = {
  unclassified:     'appear in neither MOBILE_READY nor MOBILE_DEFERRED',
  unknown:          `are classified in ${SCREEN_REL} but are not in DISCOVER_TABS`,
  overlap:          'are in BOTH MOBILE_READY and MOBILE_DEFERRED',
  'built-but-held': 'are deferred but already have a render branch',
};

if (ok) {
  const held = deferred.length
    ? ` (${deferred.length} deferred: ${deferred.map(i => `'${i}'`).join(', ')})`
    : '';
  console.log(`✓ all ${tabIds.length} Discover tabs are classified for mobile${held}`);
  process.exit(0);
}

console.error(`\n✗ mobile Discover tabs are out of step with ${NAV_REL}:\n`);
for (const { code, ids } of failures) {
  console.error(`  ${ids.length} id(s) ${HEADINGS[code]}:`);
  for (const id of ids) console.error(`      '${id}'`);
  console.error('');
  for (const line of EXPLANATIONS[code]) console.error(`    ${line}`);
  console.error('');
}
console.error(`  Both sets live in ${SCREEN_REL}.\n`);
process.exit(1);
