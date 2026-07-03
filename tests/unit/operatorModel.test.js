import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLegacyCopy,
  mapOperatorStateToLegacy,
  operatorPostFromMarketingPost,
  weekRange,
} from '../../control-desk/shared/model.mjs';

test('buildLegacyCopy favors channel overrides over shared text', () => {
  const copy = buildLegacyCopy({
    shared_text: 'Shared draft body',
    channel_overrides: {
      x: 'X override',
      instagram: '',
      threads: 'Threads override',
    },
    hashtags: ['plot', '#movies'],
    alt_text: 'Poster',
    page_title: 'A guide',
    page_body: ['One', 'Two'],
  });

  assert.equal(copy.x, 'X override');
  assert.equal(copy.instagram, 'Shared draft body');
  assert.equal(copy.threads, 'Threads override');
  assert.deepEqual(copy.hashtags, ['plot', 'movies']);
});

test('operatorPostFromMarketingPost maps generated rows into operator drafts', () => {
  const post = operatorPostFromMarketingPost({
    id: 'legacy-post-id',
    post_type: 'question',
    topic_key: 'conversation:2026-06-29',
    scheduled_for: '2026-06-29T09:30:00.000Z',
    copy: { x: 'What are you watching?', threads: 'What are you watching?' },
    tmdb_refs: [],
    payload: { kind: 'question' },
  });

  assert.equal(post.source, 'generated');
  assert.equal(post.state, 'draft');
  assert.equal(post.variants.length, 2);
  assert.deepEqual(post.variants.map((entry) => entry.platform), ['x', 'threads']);
  assert.equal(post.sync_link.legacy_post_id, 'legacy-post-id');
});

test('mapOperatorStateToLegacy preserves publish outcomes for compatibility rows', () => {
  assert.equal(mapOperatorStateToLegacy('draft', []), 'generated');
  assert.equal(mapOperatorStateToLegacy('scheduled', []), 'approved');
  assert.equal(mapOperatorStateToLegacy('rejected', []), 'vetoed');
  assert.equal(
    mapOperatorStateToLegacy('failed', [
      { enabled: true, status: 'published' },
      { enabled: true, status: 'failed' },
    ]),
    'partially_published',
  );
});

test('weekRange returns a Monday-start window', () => {
  const { start, end } = weekRange(new Date('2026-07-01T10:00:00.000Z'));
  assert.equal(start.toISOString().slice(0, 10), '2026-06-29');
  assert.equal(end.toISOString().slice(0, 10), '2026-07-06');
});
