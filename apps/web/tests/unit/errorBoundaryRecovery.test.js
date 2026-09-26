import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const boundary = readFileSync(join(WEB, 'src', 'components', 'ErrorBoundary.jsx'), 'utf8');
const router = readFileSync(join(WEB, 'src', 'router.jsx'), 'utf8');

test('chunk recovery spends the reload budget only in componentDidCatch', () => {
  const derived = boundary.match(/static getDerivedStateFromError\(error\) \{([\s\S]*?)\n {2}\}/)?.[1] || '';
  const caught = boundary.match(/componentDidCatch\(error, info\) \{([\s\S]*?)\n {2}\}/)?.[1] || '';

  assert.doesNotMatch(derived, /markChunkReload|location\.reload/, 'render recovery must stay side-effect free');
  assert.match(caught, /markChunkReload\(\)/, 'the committed error should spend one reload attempt');
  assert.match(caught, /window\.location\.reload\(\)/, 'the committed error should refresh the stale app');
});

test('the persistent app boundary resets after route navigation', () => {
  assert.match(boundary, /prevProps\.resetKey !== this\.props\.resetKey/);
  assert.match(router, /resetKey=\{location\.pathname\}/);
});
