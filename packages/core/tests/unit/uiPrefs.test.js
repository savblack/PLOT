import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultUiPrefs, isDefaultUiPrefs, moveSidebarItem, normalizeUiPrefs, nudgeSidebarItem, orderSidebarItems, resetSidebar,
  setCardStyle, setDensity,
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
  assert.deepEqual(p, { density: 'compact', cardStyle: 'list', sidebar: [] });
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
