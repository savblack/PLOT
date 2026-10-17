import assert from 'node:assert/strict';
import test from 'node:test';

import { upgradeSheetContent } from '../../upgradeSheet.js';
import { FREE_CUSTOM_LIST_CAP } from '../../premium.js';

test('the lists sheet names the free cap and fills the meter to it', () => {
  const content = upgradeSheetContent('lists');
  assert.equal(content.context, `You’ve used all ${FREE_CUSTOM_LIST_CAP} free lists`);
  assert.equal(content.meter, FREE_CUSTOM_LIST_CAP);
  assert.ok(content.title.length > 0);
  assert.ok(content.body.includes('unlimited custom lists'));
});

test('the lists sheet reuses the plans page rows, in order', () => {
  const labels = upgradeSheetContent('lists').also.map(row => row.label);
  assert.deepEqual(labels, ['Just Decide', 'Find something you both want']);
});

test('an unknown reason returns null instead of an empty sheet', () => {
  assert.equal(upgradeSheetContent('nope'), null);
});

test('the themes sheet has no meter and names the free themes that stay free', () => {
  const content = upgradeSheetContent('themes');
  assert.equal(content.meter, 0);
  assert.equal(content.context, 'Themes are part of Premium');
  assert.match(content.body, /stays free in light, dark and system/);
  assert.equal(content.also.length, 2);
});

test('the themes sheet previews the Premium family tapped, and only a Premium one', () => {
  assert.deepEqual(upgradeSheetContent('themes', { family: 'sage' }).preview, { family: 'sage', line: 'That’s Sage, in light and dark.' });
  assert.equal(upgradeSheetContent('themes', { family: 'default' }).preview, null);
  assert.equal(upgradeSheetContent('themes', { family: 'ocean' }).preview, null);
  assert.equal(upgradeSheetContent('themes').preview, null);
  assert.equal(upgradeSheetContent('lists', { family: 'sage' }).preview, null);
});

test('the smart lists sheet has no limit meter and sells the rules', () => {
  const content = upgradeSheetContent('smartLists');
  assert.equal(content.meter, 0);
  assert.ok(content.context.length > 0);
  assert.match(content.body, /keeps finding matches/);
  assert.doesNotMatch(`${content.context} ${content.title} ${content.body}`, /—/);
  assert.deepEqual(content.also.map(row => row.label), ['Just Decide', 'Find something you both want']);
});
