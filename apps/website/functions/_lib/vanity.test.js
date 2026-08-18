import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vanityTarget } from './vanity.js';

const target = (href) => vanityTarget(new URL(href));

test('tags each social bio path with its own source', () => {
  assert.equal(target('https://theplot.tv/ig')?.search, '?utm_source=instagram&utm_medium=bio');
  assert.equal(target('https://theplot.tv/x')?.search, '?utm_source=x&utm_medium=bio');
  assert.equal(target('https://theplot.tv/th')?.search, '?utm_source=threads&utm_medium=bio');
});

test('redirects to the homepage, not back onto the vanity path', () => {
  assert.equal(target('https://theplot.tv/ig')?.pathname, '/');
});

test('a trailing slash is still the same link', () => {
  assert.equal(target('https://theplot.tv/ig/')?.searchParams.get('utm_source'), 'instagram');
});

test('story stickers separate from passive profile traffic', () => {
  const u = target('https://theplot.tv/ig?m=story&c=dune-part-three');
  assert.equal(u?.searchParams.get('utm_medium'), 'story');
  assert.equal(u?.searchParams.get('utm_campaign'), 'dune-part-three');
});

test('an unknown medium falls back to bio rather than passing through', () => {
  assert.equal(target('https://theplot.tv/ig?m=nonsense')?.searchParams.get('utm_medium'), 'bio');
});

test('leaves real pages alone', () => {
  assert.equal(target('https://theplot.tv/'), null);
  assert.equal(target('https://theplot.tv/about.html'), null);
  assert.equal(target('https://theplot.tv/whats-on/chart'), null);
});
