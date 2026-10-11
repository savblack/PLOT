import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFooterWordmark } from '../lib/wordmark.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('charts card reuses the website footer wordmark svg', async () => {
  const html = await readFile(path.join(root, 'apps/website/_partials/footer.html'), 'utf8');
  const svg = extractFooterWordmark(html);
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /viewBox="52 -681 1403 871"/);
  assert.match(svg, /<path /);
});

test('charts card copies the footer wordmark crop and fill', async () => {
  const css = await readFile(path.join(root, 'apps/website/_partials/footer.css'), 'utf8');
  const card = await readFile(path.join(root, 'marketing/templates/trending-chart.html'), 'utf8');
  const snippets = [
    '108cqw * 681 / 1403',
    '14.9cqw',
    'width: 108cqw',
    'aspect-ratio: 1403 / 871',
    'margin-left: -4cqw',
    'fill: var(--surface, #f1e9dc)',
  ];
  for (const snippet of snippets) {
    assert.ok(css.includes(snippet), `footer css missing ${snippet}`);
    assert.ok(card.includes(snippet), `charts card missing ${snippet}`);
  }
});
