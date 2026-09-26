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
  assert.deepEqual(labels, ['Pick for Me', 'Find something you both want', 'Automatic Plex and Trakt syncing']);
});

test('an unknown reason returns null instead of an empty sheet', () => {
  assert.equal(upgradeSheetContent('nope'), null);
});
