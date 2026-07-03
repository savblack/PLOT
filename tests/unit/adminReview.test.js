import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCopyPatchFromForm,
  mergeCopyValues,
  groupPostsForDisplay,
  publishTimingLabel,
  reasonForPost,
  renderControlDeskPage,
  renderPublicationChips,
} from '../../supabase/functions/admin-review/view.js';

const makePost = (overrides = {}) => ({
  id: 'post-1',
  post_type: 'upcoming',
  topic_key: 'upcoming:2026-06-29',
  scheduled_for: '2026-06-28T12:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
  status: 'needs_review',
  slug: 'upcoming-post',
  copy: {
    x: 'Toy Story 5 leads this week.',
    instagram: 'Toy Story 5 leads this week.',
    threads: 'Toy Story 5 leads this week.',
    page_title: 'What to watch this week',
    page_body: ['Paragraph one.', 'Paragraph two.'],
    hashtags: ['pixar', 'movies'],
    cta_variant: 'whats_on_tonight',
    sources: [{ title: 'Source', url: 'https://example.com' }],
  },
  media: [{ portrait_path: 'post-1/card-0-portrait.jpg', landscape_path: 'post-1/card-0-landscape.jpg' }],
  tmdb_refs: [{ title: 'Toy Story 5' }],
  payload: { title: 'Toy Story 5' },
  marketing_post_publications: [
    { id: 'pub-x', platform: 'x', status: 'queued', permalink: null, error: null },
    { id: 'pub-ig', platform: 'instagram', status: 'queued', permalink: null, error: null },
    { id: 'pub-th', platform: 'threads', status: 'queued', permalink: null, error: null },
  ],
  ...overrides,
});

test('reasonForPost formats human-readable reasons', () => {
  assert.equal(reasonForPost(makePost({ post_type: 'question', tmdb_refs: [], payload: {} })), 'Generic audience question');
  assert.equal(reasonForPost(makePost({ post_type: 'hidden_gem' })), 'Highly rated, lesser seen: Toy Story 5');
});

test('buildCopyPatchFromForm and mergeCopyValues preserve edited fields', () => {
  const form = new FormData();
  form.set('x', 'Updated X copy');
  form.set('instagram', 'Updated Instagram');
  form.set('threads', 'Updated Threads');
  form.set('hashtags', '#one, two');
  form.set('page_title', 'Updated title');
  form.set('page_body', 'Paragraph A\n\nParagraph B');

  const patch = buildCopyPatchFromForm(form);
  assert.deepEqual(patch, {
    x: 'Updated X copy',
    instagram: 'Updated Instagram',
    threads: 'Updated Threads',
    hashtags: ['one', 'two'],
    page_title: 'Updated title',
    page_body: ['Paragraph A', 'Paragraph B'],
  });

  const merged = mergeCopyValues({ cta_variant: 'journal_it' }, form);
  assert.equal(merged.cta_variant, 'journal_it');
  assert.equal(merged.x, 'Updated X copy');
  assert.deepEqual(merged.page_body, ['Paragraph A', 'Paragraph B']);
});

test('groupPostsForDisplay prioritizes review work ahead of approved and rejected posts', () => {
  const posts = [
    makePost({ id: 'planned', status: 'planned' }),
    makePost({ id: 'approved', status: 'approved' }),
    makePost({ id: 'review', status: 'needs_review' }),
    makePost({ id: 'rejected', status: 'vetoed' }),
  ];

  const grouped = groupPostsForDisplay(posts);
  assert.deepEqual(grouped.reviewQueue.map((post) => post.id), ['review', 'planned']);
  assert.deepEqual(grouped.approved.map((post) => post.id), ['approved']);
  assert.deepEqual(grouped.rejected.map((post) => post.id), ['rejected']);
});

test('publish timing label explains approved future and due-now states', () => {
  const future = publishTimingLabel(makePost({ status: 'approved', scheduled_for: '2026-06-28T12:00:00.000Z' }), '2026-06-23T00:00:00.000Z');
  const dueNow = publishTimingLabel(makePost({ status: 'approved', scheduled_for: '2026-06-22T00:00:00.000Z' }), '2026-06-23T00:00:00.000Z');

  assert.match(future, /Approved for/);
  assert.equal(dueNow, 'Due now — next 5-minute publish check');
});

test('renderPublicationChips distinguishes queued, publishing, published, failed, and not attempted', () => {
  const queuedHtml = renderPublicationChips(makePost());
  assert.match(queuedHtml, /X queued/);
  assert.match(queuedHtml, /Instagram queued/);

  const mixedHtml = renderPublicationChips(makePost({
    marketing_post_publications: [
      { id: '1', platform: 'x', status: 'publishing', permalink: null, error: null },
      { id: '2', platform: 'instagram', status: 'published', permalink: 'https://instagram.com/post', error: null },
      { id: '3', platform: 'threads', status: 'failed', permalink: null, error: 'Oops' },
    ],
  }));
  assert.match(mixedHtml, /X publishing/);
  assert.match(mixedHtml, /Instagram live/);
  assert.match(mixedHtml, /Threads failed/);

  const notAttempted = renderPublicationChips(makePost({ marketing_post_publications: [] }));
  assert.match(notAttempted, /X not attempted/);
});

test('renderControlDeskPage renders the workflow sections and keeps approve and publish-now inside the editable form', () => {
  const active = [
    makePost({ id: 'review-1', status: 'needs_review' }),
    makePost({ id: 'approved-1', status: 'approved', scheduled_for: '2026-06-24T12:00:00.000Z' }),
    makePost({ id: 'rejected-1', status: 'vetoed' }),
  ];
  const history = [
    makePost({
      id: 'published-1',
      status: 'published',
      scheduled_for: '2026-06-20T12:00:00.000Z',
      marketing_post_publications: [{ id: 'pub-live', platform: 'x', status: 'published', permalink: 'https://x.com/post', error: null }],
    }),
  ];
  const html = renderControlDeskPage({
    active,
    history,
    metrics: new Map([['pub-live', { views: 1200, likes: 34 }]]),
    paused: false,
    flash: 'Saved only — nothing has been queued to publish.',
    acted: 'review-1',
    key: 'secret',
    nowIso: '2026-06-23T00:00:00.000Z',
    supabaseUrl: 'https://mkegtssedjyqldysvzga.supabase.co',
    siteUrl: 'https://theplot.tv',
  });

  assert.match(html, /Needs review/);
  assert.match(html, /Approved/);
  assert.match(html, /Rejected/);
  assert.match(html, /Published recently/);
  assert.match(html, /Start in Needs review/);
  assert.match(html, /data-show="history"/);
  assert.match(html, /Saved only — nothing has been queued to publish\./);
  assert.match(html, /<details class="edit" open>/);
  assert.match(html, /Social ready/);
  assert.match(html, /Article ready/);

  const formMatch = html.match(/<form id="p-review-1"[\s\S]*?<\/form>/);
  assert.ok(formMatch);
  const formHtml = formMatch[0];
  const approveIndex = formHtml.indexOf('name="action" value="approve"');
  const publishNowIndex = formHtml.indexOf('name="action" value="publish_now"');
  const rejectIndex = formHtml.indexOf('name="action" value="reject"');
  assert.ok(approveIndex >= 0);
  assert.ok(publishNowIndex > approveIndex);
  assert.ok(rejectIndex > publishNowIndex);
  assert.match(formHtml, /name="x"/);
  assert.match(formHtml, /name="action" value="approve"/);
  assert.match(formHtml, /name="action" value="publish_now"/);
  assert.match(formHtml, /Paragraph one\.\n\nParagraph two\./);
  assert.doesNotMatch(formHtml, /Paragraph one\.\\n\\nParagraph two\./);
});
