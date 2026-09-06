import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpaqueBrowserException } from '../../src/utils/opaqueException.js';

// The exact payload PostHog captured from the Turnstile script on 2026-08-31.
const SCRIPT_ERROR = [
  {
    id: '01a05778-b79a-78e2-b1c7-8de92ef8031c',
    mechanism: { handled: false, synthetic: true, type: 'generic' },
    type: 'Error',
    value: 'Script error.',
  },
];

test('drops the browser\'s opaque cross-origin "Script error."', () => {
  assert.equal(isOpaqueBrowserException(SCRIPT_ERROR), true);
});

test('keeps a synthetic exception that still has stack frames', () => {
  assert.equal(isOpaqueBrowserException([{
    mechanism: { handled: false, synthetic: true, type: 'generic' },
    type: 'Error',
    value: 'Script error.',
    stacktrace: { frames: [{ filename: 'https://app.theplot.tv/assets/index.js', lineno: 12 }] },
  }]), false);
});

test('keeps an ordinary thrown exception', () => {
  assert.equal(isOpaqueBrowserException([{
    mechanism: { handled: false, synthetic: false, type: 'onunhandledrejection' },
    type: 'TypeError',
    value: 'Cannot read properties of undefined',
    stacktrace: { frames: [{ filename: 'app.js', lineno: 1 }] },
  }]), false);
});

test('keeps a stackless exception the page threw itself', () => {
  // Not synthetic: the page really did throw this, so it is signal even
  // without frames.
  assert.equal(isOpaqueBrowserException([{
    mechanism: { handled: true, synthetic: false, type: 'generic' },
    type: 'Error',
    value: 'Supabase client missing',
  }]), false);
});

test('keeps a mixed payload where any entry is actionable', () => {
  assert.equal(isOpaqueBrowserException([
    { mechanism: { synthetic: true }, type: 'Error', value: 'Script error.' },
    { mechanism: { synthetic: false }, type: 'TypeError', value: 'real one' },
  ]), false);
});

test('treats an empty frame list as no stack', () => {
  assert.equal(isOpaqueBrowserException([{
    mechanism: { synthetic: true },
    type: 'Error',
    value: 'Script error.',
    stacktrace: { frames: [] },
  }]), true);
});

test('ignores anything that is not a populated list', () => {
  for (const input of [undefined, null, [], {}, 'Script error.', 0]) {
    assert.equal(isOpaqueBrowserException(input), false);
  }
});

test('ignores malformed entries rather than dropping the event', () => {
  assert.equal(isOpaqueBrowserException([null]), false);
  assert.equal(isOpaqueBrowserException(['Script error.']), false);
  assert.equal(isOpaqueBrowserException([{ type: 'Error', value: 'no mechanism' }]), false);
});
