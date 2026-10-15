import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_SECTION_IDS, defaultHomeLayout, isDefaultHomeLayout, moveHomeSection,
  normalizeHomeLayout, nudgeHomeSection, setHomeSectionVisible, visibleHomeSections,
} from '../../homeLayout.js';

test('normalize: garbage becomes the default layout', () => {
  for (const raw of [null, undefined, 'x', 7, [], { order: 'nope', hidden: 3 }]) {
    assert.deepEqual(normalizeHomeLayout(raw), defaultHomeLayout());
  }
});

test('normalize: drops unknown and duplicate ids, appends shelves added later', () => {
  const l = normalizeHomeLayout({ order: ['weekly', 'retired', 'picks', 'weekly'], hidden: ['retired', 'hot'] });
  assert.equal(l.order[0], 'weekly');
  assert.equal(l.order[1], 'picks');
  assert.equal(l.order.length, HOME_SECTION_IDS.length);
  assert.deepEqual([...l.order].sort(), [...HOME_SECTION_IDS].sort());
  assert.deepEqual(l.hidden, ['hot']);
});

test('isDefault: order and hidden both matter', () => {
  assert.equal(isDefaultHomeLayout(defaultHomeLayout()), true);
  assert.equal(isDefaultHomeLayout(setHomeSectionVisible(defaultHomeLayout(), 'hot', false)), false);
  assert.equal(isDefaultHomeLayout(nudgeHomeSection(defaultHomeLayout(), 'hot', -1)), false);
});

test('move: clamps and keeps the rest in place', () => {
  const moved = moveHomeSection(defaultHomeLayout(), 'platforms', 0);
  assert.equal(moved.order[0], 'platforms');
  assert.deepEqual(moved.order.slice(1), HOME_SECTION_IDS.filter(id => id !== 'platforms'));
  const clamped = moveHomeSection(defaultHomeLayout(), 'picks', 99);
  assert.equal(clamped.order.at(-1), 'picks');
  assert.deepEqual(moveHomeSection(defaultHomeLayout(), 'nope', 0), defaultHomeLayout());
});

test('nudge at the edges is a no-op', () => {
  assert.deepEqual(nudgeHomeSection(defaultHomeLayout(), 'picks', -1), defaultHomeLayout());
  assert.deepEqual(nudgeHomeSection(defaultHomeLayout(), 'platforms', 1), defaultHomeLayout());
  assert.equal(nudgeHomeSection(defaultHomeLayout(), 'hot', 1).order.indexOf('hot'), 3);
});

test('setVisible toggles when no flag is given and keeps hidden in canonical order', () => {
  let l = setHomeSectionVisible(defaultHomeLayout(), 'weekly');
  l = setHomeSectionVisible(l, 'picks');
  assert.deepEqual(l.hidden, ['picks', 'weekly']);
  l = setHomeSectionVisible(l, 'weekly');
  assert.deepEqual(l.hidden, ['picks']);
  assert.deepEqual(setHomeSectionVisible(l, 'picks', true).hidden, []);
});

test('visibleHomeSections respects order, hidden, and what has content', () => {
  const l = setHomeSectionVisible(moveHomeSection(defaultHomeLayout(), 'platforms', 0), 'hot', false);
  assert.deepEqual(visibleHomeSections(l, ['hot', 'picks', 'platforms', 'weekly']), ['platforms', 'picks', 'weekly']);
});
