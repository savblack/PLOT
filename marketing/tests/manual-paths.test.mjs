import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANUAL_OUTPUT_ROOT } from '../manual/paths.mjs';

// Derived from this file's own location, not hardcoded: the expected value has
// to hold on a CI runner and in a git worktree, not just one laptop's checkout.
// tests/ → marketing/, which is a different route to the root than the one
// paths.mjs takes (manual/ → marketing/), so this still checks the resolution.
const MARKETING = dirname(dirname(fileURLToPath(import.meta.url)));

test('manual fallback output stays inside marketing/plot-posts', () => {
  assert.equal(MANUAL_OUTPUT_ROOT, path.join(MARKETING, 'plot-posts'));
});
