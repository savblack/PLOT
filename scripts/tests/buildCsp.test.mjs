import assert from 'node:assert/strict';
import test from 'node:test';
import { inlineScripts } from '../build-csp.mjs';

test('inline scripts are found whatever the end tag looks like', () => {
  const html = [
    '<script>one()</script>',
    '<script>two()</script >',
    '<SCRIPT type="module">three()</SCRIPT\n>',
  ].join('\n');
  assert.deepEqual(inlineScripts(html), ['one()', 'two()', 'three()']);
});

test('a script ending in "</script >" does not swallow the next block', () => {
  const html = '<script>a()</script ><p>text</p><script src="/x.js"></script><script>b()</script>';
  assert.deepEqual(inlineScripts(html), ['a()', 'b()']);
});

test('external and data blocks need no hash', () => {
  const html = '<script src="/a.js"></script><script type="application/ld+json">{"a":1}</script><script>c()</script>';
  assert.deepEqual(inlineScripts(html), ['c()']);
});
