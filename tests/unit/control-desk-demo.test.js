import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemoPosts, enabledPlatformsForPost, previewFirstComment, previewTextForPlatform } from '../../control-desk/src/demo-data.mjs';
import { mediaSourceForItem } from '../../control-desk/src/media.mjs';

test('demo workspace includes representative workflow states', () => {
  const posts = createDemoPosts(new Date('2026-06-29T00:00:00Z'));
  const states = posts.map((post) => post.state);

  assert.deepEqual(states, ['draft', 'in_review', 'scheduled', 'failed']);
  assert.equal(posts.every((post) => Array.isArray(post.tmdb_refs) && post.tmdb_refs.length === 0), true);
});

test('preview text prefers channel override before shared copy', () => {
  const [post] = createDemoPosts(new Date('2026-06-29T00:00:00Z'));

  assert.match(previewTextForPlatform(post, 'x'), /Three watchlist picks/i);
  assert.match(previewTextForPlatform(post, 'instagram'), /Tonight's watchlist is sorted/i);
});

test('enabled platforms and first comment reflect channel configuration', () => {
  const [, reviewPost, scheduledPost] = createDemoPosts(new Date('2026-06-29T00:00:00Z'));

  assert.deepEqual(enabledPlatformsForPost(reviewPost).map((entry) => entry.platform), ['x', 'threads']);
  assert.match(previewFirstComment(scheduledPost, 'instagram'), /Drop your own weekend pick/i);
});

test('mediaSourceForItem supports demo data urls and prefers preferred orientation', () => {
  const [post] = createDemoPosts(new Date('2026-06-29T00:00:00Z'));

  assert.match(mediaSourceForItem(post.media[0]), /^data:image\/svg\+xml/i);
  assert.equal(
    mediaSourceForItem({ portrait_path: null, landscape_path: 'https://example.com/landscape.jpg' }, 'landscape'),
    'https://example.com/landscape.jpg',
  );
});
