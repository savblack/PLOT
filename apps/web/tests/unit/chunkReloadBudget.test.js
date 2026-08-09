// The stale-chunk reload budget is enforced in two places that cannot import
// each other: src/utils/chunkError.js (module scope, used by the React error
// boundaries) and an inline <script> in index.html that runs before any module
// exists, so it can catch a failed *entry* script — the one failure no error
// boundary ever sees, because React never mounted.
//
// They share one sessionStorage key, so if the key, window or max ever diverge
// the two halves fight: one thinks the budget is spent while the other keeps
// reloading, or vice versa. The original code asked a comment to keep them in
// sync by hand. This asserts it instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(WEB, 'index.html'), 'utf8');
const util = readFileSync(join(WEB, 'src', 'utils', 'chunkError.js'), 'utf8');

/** Pull `var|const NAME = <literal>` out of a source file. */
function constant(src, name) {
  const m = src.match(new RegExp(`(?:var|const)\\s+${name}\\s*=\\s*([^;]+);`));
  assert.ok(m, `expected to find ${name}`);
  return m[1].trim().replace(/_/g, '').replace(/['"]/g, '');
}

test('index.html and chunkError.js agree on the reload budget', () => {
  assert.equal(
    constant(html, 'KEY'),
    constant(util, 'RELOAD_KEY'),
    'sessionStorage key differs — the two halves would not see each other\'s reloads',
  );
  assert.equal(
    constant(html, 'WINDOW_MS'),
    constant(util, 'RELOAD_WINDOW_MS'),
    'reload window differs — one half would expire the budget before the other',
  );
  assert.equal(
    constant(html, 'MAX'),
    constant(util, 'MAX_RELOADS'),
    'reload cap differs — the two halves would allow a different number of attempts',
  );
});

test('the pre-React listener still renders a fallback when the budget runs out', () => {
  // Without this, an exhausted budget leaves #root empty and the visitor sees a
  // blank page: there is no React crash screen to fall back to, because the
  // entry script is what failed.
  assert.match(html, /function showFallback\s*\(/, 'showFallback() should exist');
  assert.match(html, /showFallback\(\);\s*\n\s*return;/, 'it should run before giving up');
  assert.match(html, /getElementById\('root'\)/, 'it should write into #root');
});
