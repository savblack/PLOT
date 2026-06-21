import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { MANUAL_OUTPUT_ROOT } from '../manual/paths.mjs';

test('manual fallback output stays inside marketing/plot-posts', () => {
  assert.equal(
    MANUAL_OUTPUT_ROOT,
    path.join('/Users/savannahblack/Projects/PLOT/marketing', 'plot-posts'),
  );
});
