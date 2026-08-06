import assert from 'node:assert/strict';
import test from 'node:test';

import { colors, radii, spacing, cssVarName } from '../../tokens.js';

test('cssVarName kebab-cases a camelCase key with a leading --', () => {
  assert.equal(cssVarName('surfaceRaised'), '--surface-raised');
  assert.equal(cssVarName('epgBarStream'), '--epg-bar-stream');
  assert.equal(cssVarName('badgePremium'), '--badge-premium');
});

test('cssVarName leaves a key with no capitals untouched apart from the prefix', () => {
  assert.equal(cssVarName('bg'), '--bg');
});

test('colors.dark only overrides a subset of keys, all of which exist in colors.light', () => {
  const darkKeys = Object.keys(colors.dark);
  assert.ok(darkKeys.length > 0);
  assert.ok(darkKeys.every(key => key in colors.light));
  assert.ok(darkKeys.length < Object.keys(colors.light).length);
});

test('colors.light defines every token colors.dark leaves for inheritance, e.g. the calendar chip colors', () => {
  assert.equal('chipNow' in colors.dark, false);
  assert.equal(typeof colors.light.chipNow, 'string');
});

test('radii and spacing expose the documented numeric scales', () => {
  assert.deepEqual(radii, { md: 16, lg: 24, badge: 10, pill: 9999 });
  assert.deepEqual(spacing, { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
});
