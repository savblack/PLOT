import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isOpaqueBrowserException } from '../../src/utils/opaqueException.js';

/* The app drops the browser's opaque "Script error." in a before_send hook
 * built on isOpaqueBrowserException (see opaqueException.test.js for what the
 * predicate means and why it is deliberately narrow).
 *
 * The four other browser surfaces run the PostHog snippet instead of the npm
 * package and cannot import anything, so each carries its own hand-written
 * `dropOpaqueException`. Four copies of a predicate is four chances to drift,
 * and three of them are single-line — a stray paren would ship a marketing
 * page whose analytics throws on load, which nothing else here would catch.
 *
 * So: extract each copy, run it, and hold it to the same answers as the real
 * one. This is the agreement the comments in those files promise.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

const SURFACES = [
  'apps/website/js/config.js',
  'supabase/functions/title-page/index.ts',
  'supabase/functions/marketing-feed/index.ts',
  'functions/list/[id].js',
];

/** Pull `function dropOpaqueException(…) {…}` out of a file by brace matching. */
function extractPredicate(source, file) {
  const start = source.indexOf('function dropOpaqueException');
  assert.notEqual(start, -1, `${file} has no dropOpaqueException`);
  let depth = 0;
  let seenBody = false;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') { depth++; seenBody = true; }
    else if (source[i] === '}') depth--;
    if (seenBody && depth === 0) {
      const body = source.slice(start, i + 1);
      // Running the shipped copy, rather than a transcription of it, is the point.
      return new Function(`return (${body})`)();
    }
  }
  throw new Error(`${file}: unbalanced braces in dropOpaqueException`);
}

// The exception payloads from opaqueException.test.js, as PostHog events.
const asEvent = ($exception_list) => ({ event: '$exception', properties: { $exception_list } });

const CASES = [
  // [label, $exception_list]
  ['the opaque cross-origin Script error.', [
    { mechanism: { handled: false, synthetic: true, type: 'generic' }, type: 'Error', value: 'Script error.' },
  ]],
  ['synthetic but with stack frames', [
    { mechanism: { synthetic: true }, type: 'Error', value: 'Script error.',
      stacktrace: { frames: [{ filename: 'https://theplot.tv/js/config.js', lineno: 12 }] } },
  ]],
  ['an ordinary thrown exception', [
    { mechanism: { handled: false, synthetic: false, type: 'onunhandledrejection' },
      type: 'TypeError', value: 'Cannot read properties of undefined',
      stacktrace: { frames: [{ filename: 'nav.js', lineno: 1 }] } },
  ]],
  ['a stackless exception the page threw itself', [
    { mechanism: { handled: true, synthetic: false, type: 'generic' }, type: 'Error', value: 'no posthog' },
  ]],
  ['a mixed payload with one actionable entry', [
    { mechanism: { synthetic: true }, type: 'Error', value: 'Script error.' },
    { mechanism: { synthetic: false }, type: 'TypeError', value: 'real one' },
  ]],
  ['an empty frame list', [
    { mechanism: { synthetic: true }, type: 'Error', value: 'Script error.', stacktrace: { frames: [] } },
  ]],
  ['a malformed entry', [null]],
  ['an entry with no mechanism', [{ type: 'Error', value: 'no mechanism' }]],
  ['an empty list', []],
  ['a missing list', undefined],
];

for (const file of SURFACES) {
  const source = readFileSync(join(REPO_ROOT, file), 'utf8');

  test(`${file}: its dropOpaqueException agrees with the app's predicate`, () => {
    const drop = extractPredicate(source, file);
    for (const [label, list] of CASES) {
      const event = asEvent(list);
      const dropped = drop(event) === null;
      assert.equal(
        dropped,
        isOpaqueBrowserException(list),
        `${file} disagrees on ${label}`,
      );
      // Anything it keeps must come back unchanged, not rewritten.
      if (!dropped) assert.equal(drop(event), event, `${file} mutated a kept event`);
    }
  });

  test(`${file}: only $exception events are ever considered`, () => {
    const drop = extractPredicate(source, file);
    // A pageview whose properties happen to carry the key must survive.
    const pageview = { event: '$pageview', properties: { $exception_list: CASES[0][1] } };
    assert.equal(drop(pageview), pageview);
  });

  test(`${file}: error tracking is switched on and the hook is wired up`, () => {
    assert.match(source, /capture_exceptions:\s*true/, `${file} does not enable capture_exceptions`);
    assert.match(source, /before_send:\s*dropOpaqueException/, `${file} does not use the predicate`);
  });
}
