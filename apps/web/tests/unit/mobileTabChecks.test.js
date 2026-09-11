import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDiscoverTabIds, extractSetLiteral, extractRenderedTabs, checkMobileTabs,
} from '../../../../scripts/lib/mobileTabChecks.mjs';

// A guard nobody has watched fail is not a guard. #587 left the Upcoming tab
// fully implemented and unreachable on main with tsc, eslint and CI green, so
// the point of this file is to prove the check flags that exact state and
// clears the one that replaced it.

const NAV = `
/* Sub-tabs nested under Home. Web renders these in DiscoverView's toolbar. */
export const DISCOVER_TABS = [
  { id: 'discover', label: 'Discover' },
  { id: 'new',      label: 'New Releases' },
  { id: 'releases', label: 'Upcoming' },
  { id: 'guide',    label: 'Guide' },
];

export const MY_LISTS_TABS = [
  { id: 'all', label: 'All' },
];
`;

// The three shapes `tab === '...'` takes in index.tsx. Only the first is a
// render branch; the guard must not mistake the other two for one.
const SCREEN_JSX = `
      {tab === 'guide' ? (
        <View><GuideView /></View>
      ) : tab === 'releases' ? (
        <ScrollView><UpcomingContent /></ScrollView>
      ) : tab === 'new' ? (
        <ScrollView><NewReleasesContent /></ScrollView>
      ) : (
        <ScrollView><DiscoverContent /></ScrollView>
      )}
      {(tab === 'discover' || tab === 'new' || tab === 'releases') && (
        <TouchableOpacity
          accessibilityLabel={tab === 'releases' ? 'Filter upcoming' : 'Filter discover'}
        />
      )}
`;

test('extractDiscoverTabIds reads the shared nav list in order', () => {
  assert.deepEqual(extractDiscoverTabIds(NAV), ['discover', 'new', 'releases', 'guide']);
});

test('extractDiscoverTabIds throws rather than silently passing on an empty read', () => {
  assert.throws(() => extractDiscoverTabIds('export const OTHER = [];'), /DISCOVER_TABS/);
});

test('extractSetLiteral reads both the populated and the empty-typed form', () => {
  assert.deepEqual(
    extractSetLiteral("const MOBILE_READY = new Set(['discover', 'new']);", 'MOBILE_READY'),
    ['discover', 'new'],
  );
  assert.deepEqual(
    extractSetLiteral('const MOBILE_DEFERRED = new Set<string>([]);', 'MOBILE_DEFERRED'),
    [],
  );
  assert.equal(extractSetLiteral('const OTHER = new Set([]);', 'MOBILE_READY'), null);
});

test('extractRenderedTabs finds render branches and ignores the lookalikes', () => {
  const rendered = extractRenderedTabs(SCREEN_JSX);
  // The ternary chain's branches.
  assert.ok(rendered.has('guide'));
  assert.ok(rendered.has('releases'));
  assert.ok(rendered.has('new'));
  // The chain's final `else` has no test, so the default tab is absent. That
  // is expected: only the deferred-tab rule reads this, and a deferred tab is
  // never the default.
  assert.ok(!rendered.has('discover'));
  assert.equal(rendered.size, 3);
});

test('the state on main today passes', () => {
  const result = checkMobileTabs({
    tabIds:   ['discover', 'new', 'releases', 'guide'],
    ready:    ['discover', 'new', 'releases', 'guide'],
    deferred: [],
    rendered: extractRenderedTabs(SCREEN_JSX),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('#587: a tab whose render branch landed but whose allow-list entry did not', () => {
  // Exactly what was on main for several commits. UpcomingContent, the render
  // branch and the filter wiring were all present; the rebase dropped
  // 'releases' from the allow-list, so the tab was never rendered.
  const result = checkMobileTabs({
    tabIds:   ['discover', 'new', 'releases', 'guide'],
    ready:    ['discover', 'new', 'guide'],
    deferred: [],
    rendered: extractRenderedTabs(SCREEN_JSX),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ code: 'unclassified', ids: ['releases'] }]);
});

test('a deferred tab that has quietly been built is flagged', () => {
  const result = checkMobileTabs({
    tabIds:   ['discover', 'new', 'releases', 'guide'],
    ready:    ['discover', 'new', 'guide'],
    deferred: ['releases'],
    rendered: extractRenderedTabs(SCREEN_JSX),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ code: 'built-but-held', ids: ['releases'] }]);
});

test('a deferred tab that genuinely is not built passes', () => {
  const result = checkMobileTabs({
    tabIds:   ['discover', 'new', 'releases', 'guide', 'lists'],
    ready:    ['discover', 'new', 'releases', 'guide'],
    deferred: ['lists'],
    rendered: extractRenderedTabs(SCREEN_JSX),
  });
  assert.equal(result.ok, true);
});

test('a stale or mistyped classification is flagged', () => {
  const result = checkMobileTabs({
    tabIds:   ['discover', 'new', 'releases', 'guide'],
    ready:    ['discover', 'new', 'releases', 'guide', 'feed'],
    deferred: [],
    rendered: new Set(),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ code: 'unknown', ids: ['feed'] }]);
});

test('a tab claimed by both sets is flagged', () => {
  const result = checkMobileTabs({
    tabIds:   ['discover', 'new', 'releases', 'guide'],
    ready:    ['discover', 'new', 'releases', 'guide'],
    deferred: ['guide'],
    rendered: new Set(),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [{ code: 'overlap', ids: ['guide'] }]);
});
