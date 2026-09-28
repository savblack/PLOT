import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { premiumPalettes } from '@plot/core/tokens.js';
import { BASE_THEMES, PREMIUM_THEMES, themeAttributes } from '@plot/core/themes.js';

// The pre-paint script in index.html runs before any module loads, so it
// carries its own copy of the palette id -> base map. These tests run that
// script against every stored value and hold it to @plot/core/themes.js.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script data-cfasync="false">([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .find(body => body.includes('plot-theme'));

function prePaint(stored, systemDark = false) {
  const attrs = {};
  const context = {
    window: {
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: systemDark }),
    },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
  };
  vm.runInNewContext(script, context);
  return attrs;
}

test('the pre-paint script exists', () => {
  assert.ok(script && script.includes('plot-theme'));
});

test('the pre-paint script paints every theme the way useTheme will', () => {
  for (const id of [...BASE_THEMES, ...PREMIUM_THEMES]) {
    for (const systemDark of [false, true]) {
      const { mode, palette } = themeAttributes(id, systemDark);
      const attrs = prePaint(id, systemDark);
      assert.equal(attrs['data-theme'], mode, `${id} mode`);
      assert.equal(attrs['data-palette'], palette ?? undefined, `${id} palette`);
    }
  }
});

test('an empty or unknown stored value paints light with no palette', () => {
  assert.deepEqual(prePaint(null), { 'data-theme': 'light' });
  assert.deepEqual(prePaint('sepia'), { 'data-theme': 'light' });
});

test('the boot loader paints each palette on its own ground', () => {
  for (const [id, { colors }] of Object.entries(premiumPalettes)) {
    assert.ok(
      html.includes(`[data-palette="${id}"] body { background: ${colors.bg}; }`),
      `index.html should paint ${id} on ${colors.bg}`,
    );
  }
});
