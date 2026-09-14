import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-key';

const { rollUp } = await import('../publish/reconcile.mjs');

const rows = (...statuses) => statuses.map((status) => ({ status }));

test('all sent is published', () => {
  assert.equal(rollUp(rows('published', 'published', 'published')), 'published');
});

test('some sent, some failed is a partial', () => {
  assert.equal(rollUp(rows('published', 'failed', 'published')), 'partially_published');
});

test('a social failure never moves the post out of approved', () => {
  // The article's visibility on theplot.tv keys off marketing_posts.status —
  // 'approved' and 'published' are visible, 'failed' is not. Rolling a failed
  // send up into the post status would take a perfectly good piece of writing
  // off the site because a tweet bounced. The two halves fail separately now.
  assert.equal(rollUp(rows('failed', 'failed', 'failed')), null);
  assert.equal(rollUp(rows('failed', 'scheduled')), null);
});

test('a post you deleted in Buffer is not a failed post', () => {
  // Deleting in Buffer is the review working as intended, not an incident.
  assert.equal(rollUp(rows('published', 'published', 'canceled')), 'published');
  assert.equal(rollUp(rows('canceled', 'failed')), null);
});

test('dropping every platform leaves the post alone', () => {
  // Nothing sent and nothing is coming, but the article is Linear's business,
  // so there is no status this run is entitled to write.
  assert.equal(rollUp(rows('canceled', 'canceled', 'canceled')), null);
});

test('still waiting is not an outcome', () => {
  assert.equal(rollUp(rows('scheduled', 'scheduled')), null);
  assert.equal(rollUp(rows('published', 'scheduled')), null);
});

test('a web-only post has nothing to roll up', () => {
  assert.equal(rollUp([]), null);
});
