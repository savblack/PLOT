// Pure extraction + rule logic for `npm run mobile:tabs`. The CLI wrapper in
// scripts/check-mobile-tabs.mjs does the file reading and the formatting; the
// decisions live here so apps/web/tests/unit/mobileTabChecks.test.js can prove
// the guard actually flags the state that shipped broken.
//
// See scripts/check-mobile-tabs.mjs for why this check exists.

/** Ids of the shared Discover sub-tabs, in declaration order.
 * @param {string} navSource contents of packages/core/navigation.js
 * @returns {string[]}
 * @throws if the array cannot be found
 */
export function extractDiscoverTabIds(navSource) {
  const block = navSource.match(/export const DISCOVER_TABS\s*=\s*\[([\s\S]*?)\];/);
  if (!block) throw new Error('could not find `export const DISCOVER_TABS = [ ... ];`');
  const ids = [...block[1].matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
  if (ids.length === 0) throw new Error("DISCOVER_TABS parsed as empty (expected `{ id: 'x', ... }` entries)");
  return ids;
}

/** Members of a `const NAME = new Set([...])` literal.
 * Handles the `new Set<string>([])` form mobile needs for the empty case.
 * @returns {string[] | null} null when the declaration is absent
 */
export function extractSetLiteral(source, name) {
  const m = source.match(
    new RegExp(`const\\s+${name}\\s*=\\s*new Set(?:<[^>]*>)?\\(\\s*\\[([^\\]]*)\\]`),
  );
  if (!m) return null;
  return [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2]).filter(Boolean);
}

/** Tab ids with a `tab === 'x' ? (` branch in the JSX ternary chain.
 *
 * Best effort, and deliberately narrow. The `? (` suffix is what separates a
 * render branch from the other two shapes in the same file: the filter-button
 * guard (`(tab === 'discover' || ...) && (`) and inline string ternaries
 * (`tab === 'releases' ? 'Filter upcoming' : ...`). The chain's final `else`
 * has no test at all, so the default tab never appears here — which is fine,
 * because the only rule that reads this is about deferred tabs, and a deferred
 * tab is by definition not the default.
 * @returns {Set<string>}
 */
export function extractRenderedTabs(source) {
  return new Set([...source.matchAll(/tab === '([^']+)'\s*\?\s*\(/g)].map(m => m[1]));
}

/**
 * @typedef {{ code: string, ids: string[] }} TabFailure
 * @param {{ tabIds: string[], ready: string[], deferred: string[], rendered: Set<string> }} input
 * @returns {{ ok: boolean, failures: TabFailure[] }}
 */
export function checkMobileTabs({ tabIds, ready, deferred, rendered }) {
  const readySet    = new Set(ready);
  const deferredSet = new Set(deferred);
  const known       = new Set(tabIds);

  /** @type {TabFailure[]} */
  const failures = [];
  const add = (code, ids) => { if (ids.length) failures.push({ code, ids }); };

  // A tab the shared nav list has and mobile never classifies. This is the
  // #587 shape: it silently does not render, and nothing else can see it.
  add('unclassified', tabIds.filter(id => !readySet.has(id) && !deferredSet.has(id)));

  // A classification for a tab that no longer exists (typo, or the tab was
  // removed from the shared list and this entry is now dead).
  add('unknown', [...new Set([...readySet, ...deferredSet])].filter(id => !known.has(id)));

  // Both sets claim it, so "is this tab shown?" has two answers.
  add('overlap', ready.filter(id => deferredSet.has(id)));

  // Built, but still listed as held back. That is what #587 shipped.
  add('built-but-held', deferred.filter(id => rendered.has(id)));

  return { ok: failures.length === 0, failures };
}
