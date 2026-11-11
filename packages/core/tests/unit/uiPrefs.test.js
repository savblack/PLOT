import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arrangeByMyListsOrder, defaultUiPrefs, isDefaultUiPrefs, moveMyListsSection, moveSidebarItem, MY_LISTS_SECTION_IDS, normalizeUiPrefs, nudgeMyListsSection,
  nudgeSidebarItem, orderMyListsSections, orderSidebarItems, resetMyListsOrder, resetSidebar, setCardStyle, setDensity, setMyListsCollapsed, setMyListsCollapsedMany,
} from '../../uiPrefs.js';

const NAV = ['search', 'home', 'calendar', 'my-lists', 'history', 'guide', 'tonight', 'together', 'settings'].map(id => ({ id }));
const ids = (items) => items.map(i => i.id);

test('normalize: garbage and unknown values fall back to the defaults', () => {
  for (const raw of [null, undefined, 'x', 7, [], {}]) assert.deepEqual(normalizeUiPrefs(raw), defaultUiPrefs());
  const p = normalizeUiPrefs({ density: 'huge', cardStyle: 'grid', sidebar: ['guide', 'guide', 7, '', 'home'] });
  assert.equal(p.density, 'comfy');
  assert.equal(p.cardStyle, 'poster');
  assert.deepEqual(p.sidebar, ['guide', 'home']);
});

test('setters: valid values apply, invalid ones are ignored, and the other fields survive', () => {
  let p = setDensity(defaultUiPrefs(), 'compact');
  p = setCardStyle(p, 'list');
  assert.deepEqual(p, { density: 'compact', cardStyle: 'list', sidebar: [], myLists: { order: [], collapsed: [] } });
  assert.deepEqual(setDensity(p, 'nope'), p);
  assert.equal(isDefaultUiPrefs(p), false);
  assert.equal(isDefaultUiPrefs(setCardStyle(setDensity(p, 'comfy'), 'poster')), true);
});

test('sidebar: default order is the nav order, with Search first and Settings last', () => {
  assert.deepEqual(ids(orderSidebarItems(NAV, [])), ids(NAV));
});

test('sidebar: a saved order moves only the middle and never the fixed ends', () => {
  const out = ids(orderSidebarItems(NAV, ['settings', 'guide', 'search', 'home']));
  assert.equal(out[0], 'search');
  assert.equal(out.at(-1), 'settings');
  assert.deepEqual(out.slice(1, 3), ['guide', 'home']);
});

test('sidebar: items missing from the saved order keep their default place at the end; unknown ids are ignored', () => {
  const out = ids(orderSidebarItems(NAV, ['together', 'removed-item', 'guide']));
  assert.deepEqual(out.slice(1, 3), ['together', 'guide']);
  assert.deepEqual(out.slice(3, -1), ['home', 'calendar', 'my-lists', 'history', 'tonight']);
});

test('sidebar: nudging saves the whole order, stops at the edges, and reset clears it', () => {
  const current = ['home', 'calendar', 'my-lists'];
  const p = nudgeSidebarItem(defaultUiPrefs(), current, 'my-lists', -1);
  assert.deepEqual(p.sidebar, ['home', 'my-lists', 'calendar']);
  assert.deepEqual(nudgeSidebarItem(defaultUiPrefs(), current, 'home', -1).sidebar, []);
  assert.deepEqual(resetSidebar(p).sidebar, []);
});

test('sidebar: dragging an item to a place saves the whole order and clamps the target', () => {
  const current = ['home', 'calendar', 'my-lists', 'history'];
  assert.deepEqual(moveSidebarItem(defaultUiPrefs(), current, 'history', 0).sidebar, ['history', 'home', 'calendar', 'my-lists']);
  assert.deepEqual(moveSidebarItem(defaultUiPrefs(), current, 'home', 99).sidebar, ['calendar', 'my-lists', 'history', 'home']);
  assert.deepEqual(moveSidebarItem(defaultUiPrefs(), current, 'nope', 0).sidebar, []);
  assert.deepEqual(moveSidebarItem(defaultUiPrefs(), current, 'home', 0).sidebar, []);
});

test('my lists: unknown and repeated section ids are dropped on read', () => {
  const p = normalizeUiPrefs({ myLists: { order: ['smart', 'nope', 'smart', 'lists'], collapsed: ['top', 7, 'top'] } });
  assert.deepEqual(p.myLists, { order: ['smart', 'lists'], collapsed: ['top'] });
  assert.deepEqual(normalizeUiPrefs({ myLists: 'x' }).myLists, { order: [], collapsed: [] });
});

test('my lists: sections missing from a saved order follow it in their default order', () => {
  assert.deepEqual(orderMyListsSections([]), [...MY_LISTS_SECTION_IDS]);
  assert.deepEqual(orderMyListsSections(['smart', 'lists']), ['smart', 'lists', 'watching', 'top', 'shared']);
});

test('my lists: moving a section among the ones shown keeps a section the viewer cannot see', () => {
  // Shared is off for this viewer, so it is not in what they see.
  const shown = ['watching', 'top', 'lists', 'smart'];
  const moved = nudgeMyListsSection(defaultUiPrefs(), shown, 'lists', -1);
  assert.deepEqual(moved.myLists.order, ['watching', 'lists', 'top', 'smart', 'shared']);
  assert.deepEqual(moveMyListsSection(moved, shown, 'smart', 0).myLists.order, ['smart', 'watching', 'top', 'lists', 'shared']);
  // The ends do not wrap, and an unknown id changes nothing.
  assert.deepEqual(nudgeMyListsSection(defaultUiPrefs(), shown, 'watching', -1), defaultUiPrefs());
  assert.deepEqual(moveMyListsSection(defaultUiPrefs(), shown, 'nope', 0), defaultUiPrefs());
});

test('my lists: folding toggles one section, and resetting the order leaves folds alone', () => {
  let p = setMyListsCollapsed(defaultUiPrefs(), 'smart');
  assert.deepEqual(p.myLists.collapsed, ['smart']);
  assert.equal(isDefaultUiPrefs(p), false);
  p = setMyListsCollapsed(p, 'watching');
  assert.deepEqual(p.myLists.collapsed, ['watching', 'smart']);
  assert.deepEqual(setMyListsCollapsed(p, 'nope'), p);
  p = nudgeMyListsSection(p, [...MY_LISTS_SECTION_IDS], 'top', 1);
  p = resetMyListsOrder(p);
  assert.deepEqual(p.myLists, { order: [], collapsed: ['watching', 'smart'] });
  assert.deepEqual(setMyListsCollapsed(p, 'smart', false).myLists.collapsed, ['watching']);
});

test('my lists: an app that splits a section keeps its own default until an order is saved, then follows it', () => {
  const ids = ['watching', 'want', 'top10', 'favorites', 'lists', 'smart'];
  const sectionOf = (id) => ({ watching: 'watching', top10: 'top', smart: 'smart' }[id] ?? 'lists');
  assert.deepEqual(arrangeByMyListsOrder([], ids, sectionOf), ids);
  assert.deepEqual(arrangeByMyListsOrder(undefined, ids, sectionOf), ids);
  // Smart lists first: the three Lists pieces stay together, in the app's order.
  assert.deepEqual(arrangeByMyListsOrder(['smart', 'lists'], ids, sectionOf), ['smart', 'want', 'favorites', 'lists', 'watching', 'top10']);
  // An id whose section is unknown goes last rather than vanishing.
  assert.deepEqual(arrangeByMyListsOrder(['top'], ['odd', 'top10'], (id) => (id === 'top10' ? 'top' : 'nope')), ['top10', 'odd']);
});

test('my lists: several sections fold or open in one change, ignoring unknown ids', () => {
  const folded = setMyListsCollapsedMany(defaultUiPrefs(), ['smart', 'nope', 'watching'], true);
  assert.deepEqual(folded.myLists.collapsed, ['watching', 'smart']);
  assert.deepEqual(setMyListsCollapsedMany(folded, ['watching', 'top'], false).myLists.collapsed, ['smart']);
  assert.deepEqual(setMyListsCollapsedMany(folded, [], true), folded);
});
