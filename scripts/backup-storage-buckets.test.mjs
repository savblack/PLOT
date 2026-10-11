import assert from 'node:assert/strict';
import test from 'node:test';
import { manifestKey, needsDownload, readManifestSync } from './backup-storage-buckets.mjs';

test('manifest keys are bucket plus path', () => {
  assert.equal(manifestKey('avatars', 'u1/avatar.jpg'), 'avatars/u1/avatar.jpg');
});

test('a missing manifest entry always downloads', () => {
  assert.equal(needsDownload(undefined, { size: 10, updated_at: '2026-10-01' }), true);
});

test('same size and updated_at is a skip', () => {
  const obj = { size: 80, updated_at: '2026-10-05T14:55:00Z' };
  assert.equal(needsDownload(obj, obj), false);
});

test('a replaced avatar at the same path still downloads', () => {
  const prev = { size: 80, updated_at: '2026-10-01T00:00:00Z' };
  const next = { size: 80, updated_at: '2026-10-05T14:55:00Z' };
  assert.equal(needsDownload(prev, next), true);
});

test('a size change downloads even if the timestamp matches', () => {
  assert.equal(needsDownload({ size: 10, updated_at: 't' }, { size: 11, updated_at: 't' }), true);
});

test('an empty or junk manifest is treated as a first run', () => {
  assert.deepEqual(readManifestSync(''), {});
  assert.deepEqual(readManifestSync('{}'), {});
  assert.deepEqual(readManifestSync('[]'), {});
});
