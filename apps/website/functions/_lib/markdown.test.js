import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsMarkdown, homepageMarkdownResponse } from './markdown.js';

test('recognises markdown content negotiation', () => {
  assert.equal(acceptsMarkdown(new Request('https://theplot.tv/', { headers: { Accept: 'text/markdown' } })), true);
  assert.equal(acceptsMarkdown(new Request('https://theplot.tv/', { headers: { Accept: 'text/html, text/markdown;q=0' } })), false);
});

test('returns markdown without changing browser defaults', async () => {
  const response = homepageMarkdownResponse(new Request('https://theplot.tv/', { headers: { Accept: 'text/markdown' } }));
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.match(await response.text(), /^# PLOT/m);
});
