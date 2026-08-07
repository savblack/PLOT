import assert from 'node:assert/strict';
import test from 'node:test';

import { edgeFunctionUrl } from '../../functions.js';
import { configure } from '../../config.js';

// callAuthenticatedFunction is a thin network wrapper (an authenticated POST +
// error-body parsing) with no fetch injection seam, so it is not covered here —
// only its pure URL-builder sibling, edgeFunctionUrl, is.

test.afterEach(() => {
  configure({ supabaseUrl: '' });
});

test('edgeFunctionUrl returns null without a configured supabaseUrl or a name', () => {
  assert.equal(edgeFunctionUrl('my-func'), null);
  configure({ supabaseUrl: 'https://proj.supabase.co' });
  assert.equal(edgeFunctionUrl(''), null);
  assert.equal(edgeFunctionUrl(null), null);
});

test('edgeFunctionUrl builds the functions/v1 URL for the configured project', () => {
  configure({ supabaseUrl: 'https://proj.supabase.co' });
  assert.equal(edgeFunctionUrl('my-func'), 'https://proj.supabase.co/functions/v1/my-func');
});

test('edgeFunctionUrl normalizes a supabaseUrl with trailing slashes', () => {
  configure({ supabaseUrl: 'https://proj.supabase.co///' });
  assert.equal(edgeFunctionUrl('my-func'), 'https://proj.supabase.co/functions/v1/my-func');
});

test('edgeFunctionUrl appends query params, keeping falsy-but-defined values and dropping only null/undefined', () => {
  configure({ supabaseUrl: 'https://proj.supabase.co' });
  const url = edgeFunctionUrl('my-func', { a: 1, b: 'x', c: null, d: undefined, e: 0, f: '', g: false });
  assert.equal(url, 'https://proj.supabase.co/functions/v1/my-func?a=1&b=x&e=0&f=&g=false');
});
