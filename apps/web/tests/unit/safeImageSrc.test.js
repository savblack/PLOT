import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeImageSrc } from '../../src/utils/safeImageSrc.js';

test('keeps a local preview and an https address', () => {
  assert.equal(safeImageSrc('blob:https://app.theplot.tv/1f0c'), 'blob:https://app.theplot.tv/1f0c');
  assert.equal(safeImageSrc('https://example.supabase.co/storage/v1/object/public/avatars/a.png'), 'https://example.supabase.co/storage/v1/object/public/avatars/a.png');
});

test('drops anything else', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com/a.png', 'not a url', '', null, undefined, 42]) {
    assert.equal(safeImageSrc(url), undefined, String(url));
  }
});
