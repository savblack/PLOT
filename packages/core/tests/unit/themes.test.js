import assert from 'node:assert/strict';
import test from 'node:test';

import { colors, premiumPalettes } from '../../tokens.js';
import {
  BASE_THEMES,
  PREMIUM_THEMES,
  canUseTheme,
  effectiveTheme,
  isPremiumTheme,
  normalizeTheme,
  themeAttributes,
  themeBase,
  themeSwatch,
} from '../../themes.js';
import { SETTINGS_VIEW } from '../../copy/settingsView.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';

test('light, dark and system are free; every palette is Premium', () => {
  assert.deepEqual([...BASE_THEMES], ['light', 'dark', 'system']);
  assert.deepEqual([...PREMIUM_THEMES], ['sage', 'mist', 'espresso', 'midnight']);
  for (const id of BASE_THEMES) {
    assert.equal(isPremiumTheme(id), false);
    for (const isPremium of [true, false, null, undefined]) assert.equal(canUseTheme(id, isPremium), true);
  }
  for (const id of PREMIUM_THEMES) assert.equal(isPremiumTheme(id), true);
});

test('only a confirmed entitlement unlocks a palette', () => {
  assert.equal(canUseTheme('midnight', true), true);
  assert.equal(canUseTheme('midnight', false), false);
  assert.equal(canUseTheme('midnight', null), false);
  assert.equal(canUseTheme('midnight', undefined), false);
  assert.equal(canUseTheme('sepia', true), false);
  assert.equal(canUseTheme('toString', true), false);
});

test('a palette falls back to its light or dark base once Premium is known to be off', () => {
  assert.equal(effectiveTheme('sage', false), 'light');
  assert.equal(effectiveTheme('mist', false), 'light');
  assert.equal(effectiveTheme('espresso', false), 'dark');
  assert.equal(effectiveTheme('midnight', false), 'dark');
  for (const id of PREMIUM_THEMES) assert.equal(effectiveTheme(id, true), id);
});

test('a palette is kept while the entitlement is still loading', () => {
  assert.equal(effectiveTheme('espresso', null), 'espresso');
  assert.equal(effectiveTheme('espresso', undefined), 'espresso');
});

test('free themes are never changed by the entitlement', () => {
  for (const id of BASE_THEMES) {
    for (const isPremium of [true, false, null]) assert.equal(effectiveTheme(id, isPremium), id);
  }
});

test('unknown or missing stored values become light', () => {
  for (const value of [null, undefined, '', 'sepia', 'constructor', 42]) {
    assert.equal(normalizeTheme(value), 'light');
    assert.equal(effectiveTheme(value, true), 'light');
  }
  assert.equal(themeBase('sepia'), 'light');
});

test('themeAttributes gives the light/dark mode and palette to put on the document', () => {
  assert.deepEqual(themeAttributes('light', true), { mode: 'light', palette: null });
  assert.deepEqual(themeAttributes('dark', false), { mode: 'dark', palette: null });
  assert.deepEqual(themeAttributes('system', true), { mode: 'dark', palette: null });
  assert.deepEqual(themeAttributes('system', false), { mode: 'light', palette: null });
  assert.deepEqual(themeAttributes('sage', true), { mode: 'light', palette: 'sage' });
  assert.deepEqual(themeAttributes('midnight', false), { mode: 'dark', palette: 'midnight' });
});

test('premiumPalettes only override tokens their base defines', () => {
  for (const [id, palette] of Object.entries(premiumPalettes)) {
    assert.ok(palette.base === 'light' || palette.base === 'dark', id);
    for (const key of Object.keys(palette.colors)) assert.ok(key in colors.light, `${id}.${key}`);
  }
});

test('every palette has a name in the settings copy and a swatch', () => {
  for (const id of PREMIUM_THEMES) {
    assert.equal(typeof SETTINGS_VIEW.appearance.themes[id], 'string', id);
    const swatch = themeSwatch(id);
    assert.equal(swatch.bg, premiumPalettes[id].colors.bg);
    assert.equal(swatch.text, premiumPalettes[id].colors.textPrimary);
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

test('every text token clears 4.5:1 on every ground in every palette', () => {
  for (const [id, palette] of Object.entries(premiumPalettes)) {
    const base = palette.base === 'dark' ? { ...colors.light, ...colors.dark } : colors.light;
    const set = { ...base, ...palette.colors };
    for (const text of TEXT) {
      for (const ground of GROUNDS) {
        const ratio = contrast(set[text], set[ground]);
        assert.ok(ratio >= 4.5, `${id}: ${text} on ${ground} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
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
