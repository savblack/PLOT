import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_SECTION_IDS, defaultHomeLayout, isDefaultHomeLayout, moveHomeSection,
  normalizeHomeLayout, nudgeHomeSection, dedupeHomeShelves, setHomeSectionVisible, visibleHomeSections,
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
  const moved = moveHomeSection(defaultHomeLayout(), 'anticipated', 0);
  assert.equal(moved.order[0], 'anticipated');
  assert.deepEqual(moved.order.slice(1), HOME_SECTION_IDS.filter(id => id !== 'anticipated'));
  const clamped = moveHomeSection(defaultHomeLayout(), 'picks', 99);
  assert.equal(clamped.order.at(-1), 'picks');
  assert.deepEqual(moveHomeSection(defaultHomeLayout(), 'nope', 0), defaultHomeLayout());
});

test('nudge at the edges is a no-op', () => {
  assert.deepEqual(nudgeHomeSection(defaultHomeLayout(), 'picks', -1), defaultHomeLayout());
  assert.deepEqual(nudgeHomeSection(defaultHomeLayout(), 'anticipated', 1), defaultHomeLayout());
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
  const l = setHomeSectionVisible(moveHomeSection(defaultHomeLayout(), 'anticipated', 0), 'hot', false);
  assert.deepEqual(visibleHomeSections(l, ['hot', 'picks', 'anticipated', 'weekly']), ['anticipated', 'picks', 'weekly']);
});

/* ── Pinned shelves ── */

import {
  MAX_HOME_PINS, addHomePin, canPinMore, nudgeHomePin, removeHomePin, visibleHomePins,
} from '../../homeLayout.js';

test('pins: normalize keeps valid pins in order and drops bad, duplicate and excess ones', () => {
  const raw = {
    pins: [
      { kind: 'person', id: 287 }, { kind: 'person', id: '287' }, { kind: 'nope', id: 'x' },
      { kind: 'list', id: '' }, null, 'x', { kind: 'watchlist', id: 'anything' }, { kind: 'list', id: 'l1' },
      { kind: 'list', id: 'l2' }, { kind: 'list', id: 'l3' }, { kind: 'list', id: 'l4' },
    ],
  };
  const { pins } = normalizeHomeLayout(raw);
  assert.deepEqual(pins.map(p => `${p.kind}:${p.id}`), ['person:287', 'watchlist:watchlist', 'list:l1', 'list:l2', 'list:l3']);
  assert.equal(pins.length, MAX_HOME_PINS);
});

test('pins: add, remove and nudge, and a pin never changes the shelf order', () => {
  let l = addHomePin(defaultHomeLayout(), { kind: 'watchlist' });
  l = addHomePin(l, { kind: 'list', id: 'abc' });
  l = addHomePin(l, { kind: 'list', id: 'abc' }); // duplicate
  l = addHomePin(l, { kind: 'person', id: 287 });
  assert.deepEqual(l.pins.map(p => p.id), ['watchlist', 'abc', '287']);
  assert.deepEqual(l.order, HOME_SECTION_IDS);

  l = nudgeHomePin(l, { kind: 'person', id: 287 }, -1);
  assert.deepEqual(l.pins.map(p => p.id), ['watchlist', '287', 'abc']);
  assert.deepEqual(nudgeHomePin(l, { kind: 'watchlist' }, -1).pins, l.pins); // already first
  l = removeHomePin(l, { kind: 'list', id: 'abc' });
  assert.deepEqual(l.pins.map(p => p.id), ['watchlist', '287']);
});

test('pins: the cap is enforced and canPinMore says so', () => {
  let l = defaultHomeLayout();
  for (let i = 0; i < MAX_HOME_PINS + 2; i++) l = addHomePin(l, { kind: 'list', id: `l${i}` });
  assert.equal(l.pins.length, MAX_HOME_PINS);
  assert.equal(canPinMore(l), false);
  assert.equal(canPinMore(removeHomePin(l, { kind: 'list', id: 'l0' })), true);
});

test('pins: a layout with a pin is not the default, and show/hide/move keep the pins', () => {
  const pinned = addHomePin(defaultHomeLayout(), { kind: 'watchlist' });
  assert.equal(isDefaultHomeLayout(pinned), false);
  assert.equal(setHomeSectionVisible(moveHomeSection(pinned, 'hot', 0), 'weekly', false).pins.length, 1);
});

test('pins: only Premium sees them, and only ones that still resolve', () => {
  let l = addHomePin(defaultHomeLayout(), { kind: 'watchlist' });
  l = addHomePin(l, { kind: 'list', id: 'gone' });
  l = addHomePin(l, { kind: 'person', id: 5 });
  const exists = (p) => p.id !== 'gone';
  assert.deepEqual(visibleHomePins(l, { premium: false, exists }), []);
  assert.deepEqual(visibleHomePins(l, { premium: true, exists }).map(p => p.id), ['watchlist', '5']);
  // A lapsed member keeps their pins stored: nothing was removed.
  assert.equal(l.pins.length, 3);
});

test('normalize: a layout saved with the shelves that moved to New Releases still loads', () => {
  const l = normalizeHomeLayout({ order: ['platforms', 'binged', 'hot', 'releases', 'cinema'], hidden: ['binged', 'weekly'] });
  assert.equal(l.order[0], 'hot');
  assert.deepEqual([...l.order].sort(), [...HOME_SECTION_IDS].sort());
  assert.deepEqual(l.hidden, ['weekly']);
});

test('dedupe: a title shows once, in the first shelf that has it', () => {
  const a = { id: 1, media_type: 'movie' };
  const b = { id: 2, media_type: 'movie' };
  const tvB = { id: 2, media_type: 'tv' };
  const c = { id: 3, media_type: 'tv' };
  const out = dedupeHomeShelves(['picks', 'hot', 'weekly', 'anticipated'], {
    picks: [a],
    hot: [a, b, tvB],
    weekly: [b, c, a],
    anticipated: [c, { id: 4, media_type: 'movie' }],
  }, { whole: ['picks', 'weekly'] });
  assert.deepEqual(out.hot, [b, tvB], 'same id, different type is a different title');
  assert.deepEqual(out.weekly, [b, c, a], 'a ranked chart keeps every row');
  assert.deepEqual(out.anticipated, [{ id: 4, media_type: 'movie' }]);
});

test('dedupe: follows the viewer order and skips shelves with no list', () => {
  const a = { id: 1, media_type: 'movie' };
  const out = dedupeHomeShelves(['anticipated', 'continue', 'hot'], { hot: [a], anticipated: [a] });
  assert.deepEqual(out, { anticipated: [a], hot: [] });
});
