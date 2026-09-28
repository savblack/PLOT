import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { themeFamilies } from '@plot/core/tokens.js';
import { LEGACY_THEMES, THEME_FAMILIES, THEME_MODES, readThemePreference, themeAttributes } from '@plot/core/themes.js';

// The pre-paint script in index.html runs before any module loads, so it
// carries a generated copy of the family list and the retired theme ids. These
// tests run that script against stored values and hold it to themes.js.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script data-cfasync="false">([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(body => body.includes('plot-theme'));

function prePaint(mode, family, systemDark = false) {
  const attrs = {};
  const store = { 'plot-theme': mode, 'plot-theme-family': family };
  const context = {
    window: {
      localStorage: { getItem: (key) => store[key] ?? null },
      matchMedia: () => ({ matches: systemDark }),
    },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
  };
  vm.runInNewContext(script, context);
  return attrs;
}

const expected = (mode, family, systemDark) => {
  const pref = readThemePreference(mode, family);
  const { mode: resolved, palette } = themeAttributes(pref, systemDark);
  return palette ? { 'data-theme': resolved, 'data-palette': palette } : { 'data-theme': resolved };
};

test('the pre-paint script exists', () => {
  assert.ok(script && script.includes('plot-theme-family'));
});

test('the pre-paint script paints every family and mode the way useTheme will', () => {
  for (const family of [...THEME_FAMILIES, null]) {
    for (const mode of [...THEME_MODES, null]) {
      for (const systemDark of [false, true]) {
        assert.deepEqual(prePaint(mode, family, systemDark), expected(mode, family, systemDark), `${family}/${mode}/${systemDark}`);
      }
    }
  }
});

test('a retired theme id paints as the family and mode it became', () => {
  for (const id of Object.keys(LEGACY_THEMES)) {
    assert.deepEqual(prePaint(id, 'rose'), expected(id, 'rose', false), id);
  }
});

test('an unknown stored value paints the default light', () => {
  assert.deepEqual(prePaint('sepia', 'ocean'), { 'data-theme': 'light' });
});

test('the boot loader paints each variant on its own ground', () => {
  for (const [id, family] of Object.entries(themeFamilies)) {
    for (const mode of ['light', 'dark']) {
      const line = `[data-palette="${id}"][data-theme="${mode}"] body { background: ${family[mode].bg}; }`;
      assert.ok(html.includes(line), `index.html should paint ${id} ${mode}`);
    }
  }
});

// The generated family blocks must be live CSS, not swallowed by an unclosed
// comment around the markers.
test('tokens.css carries a live block for every family variant', () => {
  const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
  const region = css.slice(css.indexOf('/* @palettes:start */') + '/* @palettes:start */'.length, css.indexOf('/* @palettes:end */'));
  assert.doesNotMatch(region, /\/\*|\*\//);
  for (const [id, family] of Object.entries(themeFamilies)) {
    for (const mode of ['light', 'dark']) {
      assert.match(region, new RegExp(`:root\\[data-palette="${id}"\\]\\[data-theme="${mode}"\\] \\{\\n  --bg: ${family[mode].bg};`));
    }
  }
});
