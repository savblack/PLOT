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

test('portrait wordmark keeps the footer scale and side crop', async () => {
  const css = await readFile(path.join(root, 'apps/website/_partials/footer.css'), 'utf8');
  const card = await readFile(path.join(root, 'marketing/templates/trending-chart.html'), 'utf8');
  for (const snippet of ['108cqw * 681 / 1403', '14.9cqw']) {
    assert.ok(css.includes(snippet), `footer css missing ${snippet}`);
  }
  const portrait = card.slice(0, card.indexOf('@media (min-aspect-ratio: 4/3)'));
  for (const snippet of ['width: 108cqw', 'aspect-ratio: 1403 / 871', 'margin-left: -4cqw']) {
    assert.ok(portrait.includes(snippet), `portrait wordmark missing ${snippet}`);
  }
  assert.doesNotMatch(portrait, /14\.9cqw/);
  assert.match(portrait, /overflow:\s+visible/);
});

test('charts wordmark uses the darker beige, with the portrait baseline on the card edge', async () => {
  const theme = await readFile(path.join(root, 'apps/website/theme.css'), 'utf8');
  const card = await readFile(path.join(root, 'marketing/templates/trending-chart.html'), 'utf8');
  assert.match(theme, /--surface-hover:\s+#eadfcf/i);
  assert.match(card, /--wordmark:\s+#eadfcf/);
  assert.match(card, /fill:\s+var\(--wordmark,\s+#eadfcf\)/);
  assert.doesNotMatch(card, /#f1e9dc/i);
  const at = card.indexOf('@media (min-aspect-ratio: 4/3)');
  const portrait = card.slice(0, at);
  const landscape = card.slice(at);
  assert.match(portrait, /top:\s+calc\(100cqh - 108cqw \* 686 \/ 1403\)/);
  assert.doesNotMatch(portrait, /98cqw/);
  assert.match(landscape, /width:\s+100cqw/);
  assert.match(landscape, /margin-left:\s+0/);
  assert.doesNotMatch(landscape, /98cqw/);
  assert.match(landscape, /bottom:\s+0/);
  assert.match(landscape, /top:\s+auto/);
  assert.match(landscape, /margin-top:\s+calc\(-1cqw \+ 8cqh\)/);
});
