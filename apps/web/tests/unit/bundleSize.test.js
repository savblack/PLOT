import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUDGET, initialAssets, overBudget } from '../../../../scripts/check-bundle-size.mjs';

test('initial assets are the entry script plus every modulepreload, nothing lazy', () => {
  const html = `
    <script src="/boot/theme.js"></script>
    <script async type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-react-1.js">
    <link rel="modulepreload" crossorigin href="/assets/vendor-react-1.js">
    <link rel="stylesheet" href="/assets/index-abc.css">`;
  assert.deepEqual(initialAssets(html).sort(), ['assets/index-abc.js', 'assets/vendor-react-1.js']);
});

test('only the budgets that are exceeded are reported', () => {
  const ok = { initial: BUDGET.initial, total: BUDGET.total, largest: BUDGET.largest };
  assert.deepEqual(overBudget(ok), []);
  const over = overBudget({ ...ok, largest: BUDGET.largest + 1 });
  assert.equal(over.length, 1);
  assert.match(over[0], /^largest: /);
});
