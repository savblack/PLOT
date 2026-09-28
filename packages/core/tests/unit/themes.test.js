import assert from 'node:assert/strict';
import test from 'node:test';

import { colors, themeFamilies, themeFamilyVariants } from '../../tokens.js';
import {
  DEFAULT_FAMILY,
  LEGACY_THEMES,
  PREMIUM_FAMILIES,
  THEME_FAMILIES,
  THEME_MODES,
  canUseFamily,
  effectiveFamily,
  familySwatch,
  isPremiumFamily,
  readThemePreference,
  themeAttributes,
  themeColors,
} from '../../themes.js';
import { SETTINGS_VIEW } from '../../copy/settingsView.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';

test('the default family is free; Sage, Mist, Rose, Ink and Plum are the Premium ones', () => {
  assert.deepEqual([...THEME_MODES], ['light', 'dark', 'system']);
  assert.deepEqual([...PREMIUM_FAMILIES], ['sage', 'mist', 'rose', 'ink', 'plum']);
  assert.deepEqual([...THEME_FAMILIES], ['default', 'sage', 'mist', 'rose', 'ink', 'plum']);
  assert.equal(isPremiumFamily(DEFAULT_FAMILY), false);
  for (const isPremium of [true, false, null, undefined]) assert.equal(canUseFamily('default', isPremium), true);
});

test('every family in the data ships (no hidden candidates right now)', () => {
  assert.deepEqual(Object.keys(themeFamilyVariants), Object.keys(themeFamilies));
  assert.equal(isPremiumFamily('ocean'), false);
});

test('only a confirmed entitlement unlocks a Premium family', () => {
  assert.equal(canUseFamily('sage', true), true);
  assert.equal(canUseFamily('sage', false), false);
  assert.equal(canUseFamily('sage', null), false);
  assert.equal(canUseFamily('sage', undefined), false);
  assert.equal(canUseFamily('sepia', true), false);
  assert.equal(canUseFamily('toString', true), false);
});

test('a Premium family falls back to the default once Premium is known to be off, and is kept while loading', () => {
  for (const id of PREMIUM_FAMILIES) {
    assert.equal(effectiveFamily(id, false), 'default');
    assert.equal(effectiveFamily(id, true), id);
    assert.equal(effectiveFamily(id, null), id);
    assert.equal(effectiveFamily(id, undefined), id);
  }
  assert.equal(effectiveFamily('default', false), 'default');
  assert.equal(effectiveFamily('sepia', true), 'default');
});

test('the stored mode and family read back as a preference', () => {
  assert.deepEqual(readThemePreference('dark', 'sage'), { family: 'sage', mode: 'dark', migrated: false });
  assert.deepEqual(readThemePreference('system', null), { family: 'default', mode: 'system', migrated: false });
  assert.deepEqual(readThemePreference(null, null), { family: 'default', mode: 'light', migrated: false });
  assert.deepEqual(readThemePreference('sepia', 'nope'), { family: 'default', mode: 'light', migrated: false });
  assert.deepEqual(readThemePreference('light', 'ocean'), { family: 'default', mode: 'light', migrated: false });
});

test('retired single theme ids migrate to a family and mode', () => {
  const cases = {
    sage: ['sage', 'light'], cinema: ['sage', 'dark'], mist: ['mist', 'light'], midnight: ['mist', 'dark'],
    ink: ['ink', 'light'], linen: ['default', 'light'], espresso: ['default', 'dark'], clay: ['default', 'dark'],
    burgundy: ['default', 'dark'],
  };
  for (const [stored, [family, mode]] of Object.entries(cases)) {
    assert.deepEqual(readThemePreference(stored, 'rose'), { family, mode, migrated: true }, stored);
  }
  for (const { family } of Object.values(LEGACY_THEMES)) assert.ok(family === 'default' || isPremiumFamily(family), family);
});

test('themeAttributes resolves system live and omits the palette for the default', () => {
  assert.deepEqual(themeAttributes({ family: 'default', mode: 'light' }, true), { mode: 'light', palette: null });
  assert.deepEqual(themeAttributes({ family: 'default', mode: 'system' }, true), { mode: 'dark', palette: null });
  assert.deepEqual(themeAttributes({ family: 'sage', mode: 'system' }, false), { mode: 'light', palette: 'sage' });
  assert.deepEqual(themeAttributes({ family: 'mist', mode: 'dark' }, false), { mode: 'dark', palette: 'mist' });
});

test('families only override tokens the base defines', () => {
  for (const [id, family] of Object.entries(themeFamilyVariants)) {
    for (const mode of ['light', 'dark']) {
      for (const key of Object.keys(family[mode])) assert.ok(key in colors.light, `${id}.${mode}.${key}`);
    }
  }
});

test('every shipped family has a name and a light/dark swatch', () => {
  for (const id of THEME_FAMILIES) {
    assert.equal(typeof SETTINGS_VIEW.appearance.families[id], 'string', id);
    const { light, dark } = familySwatch(id);
    assert.equal(light.bg, themeColors(id, 'light').bg);
    assert.equal(dark.bg, themeColors(id, 'dark').bg);
    assert.equal(dark.accent, themeColors(id, 'dark').accent);
  }
});

// WCAG 2.x relative luminance / contrast ratio.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ['textPrimary', 'textSecondary', 'textMuted', 'accentText', 'accentSecondary', 'danger', 'rating', 'statusWatched', 'statusWatching', 'success'];
const GROUNDS = ['bg', 'surface', 'surfaceRaised', 'surfaceSunken'];
const FILL_PAIRS = [
  ['onAccentFill', 'accentFill'],
  ['onAccentFill', 'accentFillHover'],
  ['onAccentSecondaryFill', 'accentSecondaryFill'],
  ['onArtworkFill', 'artworkFill'],
  ['onArtworkFill', 'artworkFillHover'],
];

// Every variant in the data, hidden ones included, so a family is ready to ship.
const variant = (id, mode) => {
  const base = mode === 'dark' ? { ...colors.light, ...colors.dark } : { ...colors.light };
  return { ...base, ...themeFamilyVariants[id][mode] };
};
const VARIANTS = Object.keys(themeFamilyVariants).flatMap(id => ['light', 'dark'].map(mode => [id, mode]));

test('every text token clears 4.5:1 on every ground, in every family and mode', () => {
  for (const [id, mode] of VARIANTS) {
    const set = variant(id, mode);
    for (const text of TEXT) {
      for (const ground of GROUNDS) {
        const ratio = contrast(set[text], set[ground]);
        assert.ok(ratio >= 4.5, `${id} ${mode}: ${text} on ${ground} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('text on every fill clears 4.5:1, in every family and mode (the default too)', () => {
  const all = [['default', 'light'], ['default', 'dark'], ...VARIANTS];
  for (const [id, mode] of all) {
    const set = id === 'default' ? themeColors('default', mode) : variant(id, mode);
    for (const [text, fill] of FILL_PAIRS) {
      const ratio = contrast(set[text], set[fill]);
      assert.ok(ratio >= 4.5, `${id} ${mode}: ${text} on ${fill} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('body text reads over the highlight in every light variant', () => {
  for (const [id, mode] of [['default', 'light'], ...VARIANTS.filter(([, m]) => m === 'light')]) {
    const set = id === 'default' ? themeColors('default', mode) : variant(id, mode);
    const ratio = contrast(set.textPrimary, set.highlight);
    assert.ok(ratio >= 4.5, `${id}: text on highlight is ${ratio.toFixed(2)}:1`);
  }
});

test('the accent is a real signal: at least 3:1 against the ground', () => {
  for (const [id, mode] of VARIANTS) {
    const set = variant(id, mode);
    const ratio = contrast(set.accent, set.bg);
    assert.ok(ratio >= 3, `${id} ${mode}: accent on bg is ${ratio.toFixed(2)}:1`);
  }
});

test('every variant carries its own accent set and rating', () => {
  for (const [id, mode] of VARIANTS) {
    const c = themeFamilyVariants[id][mode];
    for (const key of ['accent', 'accentDim', 'accentText', 'accentFill', 'accentFillHover', 'onAccentFill', 'artworkFill', 'onArtworkFill', 'rating', 'border', 'borderStrong']) {
      assert.equal(typeof c[key], 'string', `${id}.${mode}.${key}`);
    }
  }
});

test('Ink light keeps a fill that shows on artwork: white with ink text', () => {
  const ink = themeColors('ink', 'light');
  assert.equal(ink.accentFill, '#111111');
  assert.equal(ink.artworkFill, ink.surfaceRaised);
  assert.equal(ink.onArtworkFill, ink.textPrimary);
});

test('the default family is exactly the base tokens', () => {
  assert.deepEqual(themeColors('default', 'light'), colors.light);
  assert.deepEqual(themeColors('default', 'dark'), { ...colors.light, ...colors.dark });
});

test('the plans copy sells themes as live and widgets and app icons as coming', () => {
  const themes = PLANS_PAGE.premiumFeatures.find(row => row.id === 'themes');
  assert.equal(themes.live, true);
  const customize = PLANS_PAGE.premiumFeatures.find(row => row.id === 'customize');
  assert.notEqual(customize.live, true);
  assert.doesNotMatch(customize.description, /themes/i);
  const rows = PLANS_PAGE.comparison.groups.flatMap(group => group.rows);
  assert.equal(rows.find(row => row.label === 'Widgets and app icons').tag, 'Coming soon');
  assert.equal(rows.some(row => row.label === 'Widgets, app icons and themes'), false);
  const card = PLANS_PAGE.premiumCard.find(row => row.icon === 'customise');
  assert.match(card.note, /Widgets and app icons are coming/);
});
