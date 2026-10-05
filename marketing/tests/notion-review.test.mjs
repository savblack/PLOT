import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CREATE_LIMIT,
  STATUS,
  blocksForPost,
  databaseCreateBody,
  databaseProperties,
  inboundDateDecision,
  inboundStatusDecision,
  isNotionVerification,
  notionSignatureOk,
  outboundPlan,
  pageIdFromWebhook,
  planInbound,
  propertiesForPost,
  shouldPollComments,
  socialReference,
  statusNameForRow,
} from '../../supabase/functions/_shared/notionReview.js';
import {
  applyArticleAction,
  commandForStatusName,
  guardIncomingStatus,
  linearArticlesEnabled,
  mergedCopyForEdit,
} from '../../supabase/functions/_shared/reviewActions.js';

const NOW = new Date('2026-10-05T00:00:00.000Z');
const FUTURE = '2026-10-08T12:00:00.000Z';
const PAST = '2026-09-01T12:00:00.000Z';

const post = (over = {}) => ({
  id: 'post-1',
  post_type: 'on_this_day',
  status: 'needs_review',
  scheduled_for: FUTURE,
  slug: 'a-title-2026-10-08',
  tmdb_refs: [{ title: 'Warrior' }],
  payload: {},
  copy: {
    x: 'Warrior opened fifteen years ago this week.',
    instagram: 'A night for the fight film that still holds.',
    threads: 'Warrior, fifteen years on, still earns the rewatch.',
    hashtags: ['a24', 'folkhorror', 'mikeflanagan'],
    alt_text: 'A poster of two men in a ring.',
    cta_variant: 'none',
    page_title: 'Warrior still hits harder than the poster',
    page_body: [
      'Warrior opened fifteen years ago this week with two brothers on the same fight card.',
      'Tom Hardy plays the younger brother as a co-writer might: all subtext, few words.',
      'Watch it for the final act, which trusts the fights to carry the family story.',
    ],
  },
  notion_observed_status: 'Review',
  notion_observed_date: '2026-10-08',
  notion_page_id: '11111111-1111-1111-1111-111111111111',
  notion_handled_comment_ids: [],
  notion_body_hash: 'same',
  ...over,
});

function fakeSupabase() {
  const calls = [];
  return {
    calls,
    from(table) {
      const op = { table };
      const chain = {
        update(payload) { op.kind = 'update'; op.payload = payload; return chain; },
        insert(payload) { op.kind = 'insert'; op.payload = payload; return chain; },
        eq() { return chain; },
        select() { return chain; },
        then(resolve, reject) {
          calls.push({ table: op.table, kind: op.kind, payload: op.payload });
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

test('status names map the same way Linear columns do', () => {
  assert.equal(commandForStatusName('Scheduled'), 'approve');
  assert.equal(commandForStatusName('Approved'), 'approve');
  assert.equal(commandForStatusName('Canceled'), 'reject');
  assert.equal(commandForStatusName('Cancelled'), 'reject');
  assert.equal(commandForStatusName('Review'), 'unapprove');
  assert.equal(commandForStatusName('In Review'), 'unapprove');
  assert.equal(commandForStatusName('Published'), null);
  assert.equal(commandForStatusName('Done'), null);
});

test('the row picks the status the page should show', () => {
  assert.equal(statusNameForRow(post(), NOW), 'Review');
  assert.equal(statusNameForRow(post({ status: 'approved' }), NOW), 'Scheduled');
  assert.equal(statusNameForRow(post({ status: 'vetoed' }), NOW), 'Canceled');
  assert.equal(statusNameForRow(post({ status: 'approved', scheduled_for: PAST }), NOW), 'Published');
  assert.equal(statusNameForRow(post({ status: 'published', scheduled_for: PAST }), NOW), 'Published');
  assert.equal(statusNameForRow(post({ status: 'partially_published', scheduled_for: PAST }), NOW), 'Published');
});

test('a status edit counts only when it differs from the status we last wrote', () => {
  const same = inboundStatusDecision({
    pageStatus: 'Review', observedStatus: 'Review', post: post(),
  });
  assert.equal(same.apply, false);
  assert.equal(same.reason, 'no state change in this update');

  const missing = inboundStatusDecision({
    pageStatus: 'Scheduled', observedStatus: null, post: post(),
  });
  assert.equal(missing.apply, false);
  assert.equal(missing.reason, 'no observed status yet');
});

test('does not re-assert a status the row already holds', () => {
  const decision = inboundStatusDecision({
    pageStatus: 'Scheduled',
    observedStatus: 'Review',
    post: post({ status: 'approved' }),
  });
  assert.equal(decision.apply, false);
  assert.equal(decision.reason, 'already');

  const guard = guardIncomingStatus({
    currentStatus: 'approved', command: 'approve', stateChanged: true,
  });
  assert.equal(guard.apply, false);
});

test('does not walk a published post backwards from a status edit', () => {
  for (const status of ['published', 'partially_published']) {
    const decision = inboundStatusDecision({
      pageStatus: 'Review',
      observedStatus: 'Published',
      post: post({ status, scheduled_for: PAST }),
    });
    assert.equal(decision.apply, false, status);
    assert.equal(decision.reason, 'post has already published', status);
  }
});

test('Scheduled, Canceled, and Review apply approve, reject, and unapprove', () => {
  const approve = inboundStatusDecision({
    pageStatus: 'Scheduled', observedStatus: 'Review', post: post(),
  });
  assert.deepEqual(approve, { apply: true, command: 'approve', target: 'approved' });

  const reject = inboundStatusDecision({
    pageStatus: 'Canceled', observedStatus: 'Review', post: post(),
  });
  assert.equal(reject.command, 'reject');

  const back = inboundStatusDecision({
    pageStatus: 'Review', observedStatus: 'Scheduled', post: post({ status: 'approved' }),
  });
  assert.equal(back.command, 'unapprove');
});

test('dragging to Published is not a command', () => {
  const decision = inboundStatusDecision({
    pageStatus: 'Published', observedStatus: 'Review', post: post(),
  });
  assert.equal(decision.apply, false);
  assert.equal(decision.reason, 'ignored');
});

test('a date edit reschedules only when it differs from the date we wrote', () => {
  const row = post();
  assert.equal(inboundDateDecision({ pageDate: '2026-10-08', observedDate: '2026-10-08', post: row }).apply, false);
  assert.equal(inboundDateDecision({ pageDate: '2026-10-09', observedDate: null, post: row }).apply, false);
  const moved = inboundDateDecision({ pageDate: '2026-10-09', observedDate: '2026-10-08', post: row });
  assert.deepEqual(moved, { apply: true, date: '2026-10-09' });
});

test('comments reuse the command parser, and our own replies are not commands', () => {
  const planned = planInbound({
    post: post(),
    pageStatus: 'Review',
    pageDate: '2026-10-08',
    observedStatus: 'Review',
    observedDate: '2026-10-08',
    handledIds: [],
    comments: [
      { id: 'c1', created_time: '2026-10-05T01:00:00.000Z', rich_text: [{ plain_text: '🤖 **PLOT** · Approved.' }] },
      { id: 'c2', created_time: '2026-10-05T02:00:00.000Z', rich_text: [{ plain_text: '/publish-now' }] },
    ],
  });
  assert.deepEqual(planned.actions.map((action) => action.intent?.command ?? action.type), ['publish_now']);
  assert.deepEqual(planned.seenCommentIds, ['c1', 'c2']);
});

test('a slash comment on a published post is still a command; a status drag is not', () => {
  const live = post({ status: 'published', scheduled_for: PAST, notion_observed_status: 'Published' });
  const planned = planInbound({
    post: live,
    pageStatus: 'Review',
    pageDate: '2026-09-01',
    observedStatus: 'Published',
    observedDate: '2026-09-01',
    handledIds: ['old'],
    comments: [{ id: 'c-new', created_time: '2026-10-05T03:00:00.000Z', rich_text: [{ plain_text: '/unapprove' }] }],
  });
  assert.equal(planned.actions.some((action) => action.source === 'status'), false);
  assert.equal(planned.actions.some((action) => action.intent?.command === 'unapprove'), true);
});

test('social copy is shown and never comes back as a command', () => {
  const text = socialReference(post());
  assert.match(text, /Edit captions in Buffer/);
  assert.match(text, /Warrior opened/);
  const props = propertiesForPost(post(), NOW);
  assert.equal(props['Social copy'].rich_text[0].text.content.includes('Buffer'), true);
  const planned = planInbound({
    post: post(),
    pageStatus: 'Review',
    pageDate: '2026-10-08',
    observedStatus: 'Review',
    observedDate: '2026-10-08',
    comments: [{ id: 'c', created_time: 't', rich_text: [{ plain_text: '/copy\nx: a brand new tweet' }] }],
  });
  assert.equal(planned.actions[0].type, 'invalid');
});

test('a copy edit that fails the contract writes nothing', async () => {
  const row = post();
  const bad = mergedCopyForEdit(row, { page_title: 'Hope — a return' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /em or en dash/);

  const db = fakeSupabase();
  const result = await applyArticleAction(db, row, {
    command: 'edit',
    fields: { page_title: 'Hope — a return' },
  }, { actor: 'notion', surface: 'notion' });
  assert.equal(result.ok, false);
  assert.deepEqual(db.calls, []);
});

test('a valid copy edit writes the article and logs actor notion', async () => {
  const row = post();
  const good = mergedCopyForEdit(row, { page_title: 'A quieter headline for Warrior' });
  assert.equal(good.ok, true);
  assert.equal(good.copy.page_title, 'A quieter headline for Warrior');
  assert.equal(good.copy.x, row.copy.x);

  const db = fakeSupabase();
  const result = await applyArticleAction(db, row, {
    command: 'edit',
    fields: { page_title: 'A quieter headline for Warrior' },
  }, { actor: 'notion', surface: 'notion' });
  assert.equal(result.ok, true);
  assert.deepEqual(db.calls.map((call) => call.table), ['marketing_posts', 'marketing_review_events']);
  assert.equal(db.calls[0].payload.copy.page_title, 'A quieter headline for Warrior');
  assert.equal(db.calls[1].payload.actor, 'notion');
  assert.equal(db.calls[1].payload.action, 'edit');
});

test('approve, reject, and publish-now do not touch publication rows', async () => {
  for (const command of ['approve', 'reject', 'publish_now', 'unapprove']) {
    const db = fakeSupabase();
    const result = await applyArticleAction(db, post(), { command }, { actor: 'notion', surface: 'notion' });
    assert.equal(result.ok, true, command);
    assert.deepEqual(db.calls.map((call) => call.table), ['marketing_posts', 'marketing_review_events'], command);
    assert.equal(db.calls[1].payload.actor, 'notion', command);
  }
});

test('the linear edit reply stays the sentence the webhook already sends', async () => {
  const db = fakeSupabase();
  const result = await applyArticleAction(db, post(), {
    command: 'edit',
    fields: { page_title: 'A quieter headline for Warrior' },
  }, { actor: 'linear', surface: 'linear' });
  assert.equal(
    result.reply,
    'Updated **page_title**. The database has your text now; the issue body above catches up within five minutes.',
  );
});

test('reschedule writes noon UTC and does not touch publications', async () => {
  const db = fakeSupabase();
  await applyArticleAction(db, post(), { command: 'reschedule', date: '2026-10-12' }, { actor: 'notion' });
  assert.equal(db.calls[0].payload.scheduled_for, '2026-10-12T12:00:00.000Z');
  assert.equal(db.calls[0].table, 'marketing_posts');
  assert.ok(!db.calls.some((call) => call.table === 'marketing_post_publications'));
});

test('outbound refreshes status without rewriting the body when the copy is unchanged', () => {
  const row = post({ status: 'approved' });
  const hash = 'frozen';
  const plan = outboundPlan({
    post: row,
    pageStatus: 'Review',
    pageDate: '2026-10-08',
    bodyHash: hash,
    supabaseUrl: 'https://example.supabase.co',
    now: NOW,
  });
  assert.equal(plan.desiredStatus, 'Scheduled');
  assert.equal(plan.patchProperties, true);
  assert.equal(plan.replaceBlocks, plan.bodyHash !== hash);
});

test('comment polling stays on the open review set', () => {
  assert.equal(shouldPollComments(post(), NOW), true);
  assert.equal(shouldPollComments(post({ status: 'approved', scheduled_for: PAST }), NOW), false);
  assert.equal(shouldPollComments(post({ status: 'approved', scheduled_for: '2026-10-01T12:00:00.000Z' }), NOW), true);
});

test('Linear article review stays on unless the flag is explicitly off', () => {
  assert.equal(linearArticlesEnabled(undefined), true);
  assert.equal(linearArticlesEnabled(''), true);
  assert.equal(linearArticlesEnabled('true'), true);
  assert.equal(linearArticlesEnabled('false'), false);
  assert.equal(linearArticlesEnabled('off'), false);
  assert.equal(linearArticlesEnabled('0'), false);
});

test('the database schema is created from config, not a built-in parent page', () => {
  assert.throws(() => databaseCreateBody(''), /NOTION_PARENT_PAGE_ID/);
  const body = databaseCreateBody('parent-from-env');
  assert.equal(body.parent.page_id, 'parent-from-env');
  assert.deepEqual(
    body.properties.Status.select.options.map((option) => option.name),
    [STATUS.review, STATUS.scheduled, STATUS.rejected, STATUS.published],
  );
  assert.ok(databaseProperties()['Social copy']);
  assert.ok(CREATE_LIMIT > 0 && CREATE_LIMIT < 50);

  const setup = readFileSync(new URL('../setup/notion-review-db.mjs', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../../supabase/functions/_shared/notionReview.js', import.meta.url), 'utf8');
  assert.equal(setup.includes('3ed4f244'), false);
  assert.equal(review.includes('3ed4f244'), false);
});

test('webhook helpers tell a handshake from a page event', async () => {
  assert.equal(isNotionVerification({ verification_token: 'secret_abc' }), true);
  assert.equal(isNotionVerification({ verification_token: 'secret_abc', type: 'page.properties_updated' }), false);
  assert.equal(pageIdFromWebhook({
    type: 'page.properties_updated',
    entity: { id: 'abc', type: 'page' },
  }), 'abc');
  assert.equal(pageIdFromWebhook({
    type: 'comment.created',
    entity: { id: 'comment', type: 'comment' },
    data: { page_id: 'page-1' },
  }), 'page-1');

  const body = '{"type":"page.properties_updated"}';
  const secret = 'secret_test';
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(await notionSignatureOk(secret, body, `sha256=${hex}`), true);
  assert.equal(await notionSignatureOk(secret, body, hex), true);
  assert.equal(await notionSignatureOk(secret, body, 'sha256=deadbeef'), false);
  assert.equal(await notionSignatureOk('', body, `sha256=${hex}`), false);
});

test('the page body renders the article and keeps social copy out of the title', () => {
  const blocks = blocksForPost(post(), 'https://example.supabase.co');
  const dumped = JSON.stringify(blocks);
  assert.match(dumped, /Warrior still hits harder/);
  assert.match(dumped, /Social copy \(read only\)/);
  assert.match(dumped, /\/copy/);
  assert.doesNotMatch(dumped, /3ed4f244/);
});
