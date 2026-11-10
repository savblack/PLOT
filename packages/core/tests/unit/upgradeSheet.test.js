import assert from 'node:assert/strict';
import test from 'node:test';

import { onUpgradeSheetGateHit, reportUpgradeSheetGateHit, upgradeSheetContent, upgradeSheetGateFeature } from '../../upgradeSheet.js';
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

test('upgradeSheetGateFeature maps sheet-only reasons and skips caller-tracked list gates', () => {
  assert.equal(upgradeSheetGateFeature('themes'), 'themes');
  assert.equal(upgradeSheetGateFeature('pins'), 'pins');
  assert.equal(upgradeSheetGateFeature('alerts'), 'people_alerts');
  assert.equal(upgradeSheetGateFeature('seasonAlerts'), 'season_alerts');
  assert.equal(upgradeSheetGateFeature('alertEmail'), 'alert_email');
  assert.equal(upgradeSheetGateFeature('lists'), null);
  assert.equal(upgradeSheetGateFeature('smartLists'), null);
  assert.equal(upgradeSheetGateFeature('collaborativeLists'), null);
  assert.equal(upgradeSheetGateFeature('nope'), null);

  const hits = [];
  const off = onUpgradeSheetGateHit((feature) => hits.push(feature));
  reportUpgradeSheetGateHit('themes');
  reportUpgradeSheetGateHit('lists');
  reportUpgradeSheetGateHit('pins');
  off();
  reportUpgradeSheetGateHit('alerts');
  assert.deepEqual(hits, ['themes', 'pins']);
});

test('every gate reason has sheet copy with no em dash, and the new ones report a feature', () => {
  const reasons = ['artwork', 'stats', 'tasteOverlap', 'calendarFeed', 'autoImport', 'justDecide', 'watchTogether'];
  for (const reason of reasons) {
    const content = upgradeSheetContent(reason);
    assert.ok(content, reason);
    assert.equal(content.meter, 0);
    assert.ok(content.title.length > 0 && content.body.length > 0 && content.context.length > 0, reason);
    assert.equal(content.also.length, 2, reason);
    assert.doesNotMatch(`${content.context} ${content.title} ${content.body}`, /—/);
  }
  assert.equal(upgradeSheetGateFeature('artwork'), 'custom_artwork');
  assert.equal(upgradeSheetGateFeature('stats'), 'history_drilldown');
  assert.equal(upgradeSheetGateFeature('tasteOverlap'), 'taste_overlap');
  assert.equal(upgradeSheetGateFeature('calendarFeed'), 'calendar_feed');
  assert.equal(upgradeSheetGateFeature('autoImport'), 'auto_import');
  // The sheet replaced Just Decide's own card, so it carries that card's slug.
  assert.equal(upgradeSheetGateFeature('justDecide'), 'tonight_picker');
  // The overlap page reports watch_together itself when it loads locked.
  assert.equal(upgradeSheetGateFeature('watchTogether'), null);
});
