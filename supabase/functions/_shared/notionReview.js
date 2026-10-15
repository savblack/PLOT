// Pure Notion-side planning for the What's On review database.
//
// The mirror writes pages. The sweep reads them back. The dangerous case is
// treating the mirror's own write as a decision (a prior mirror did this once and unapproved a post the operator had just cleared). Notion's
// webhook does not include the previous property value, so the sweep stores
// the Status and Scheduled date it last wrote and treats a difference as the
// only evidence of a human edit.
//
// No network and no Deno.env. marketing/tests/notion-review.test.mjs covers it.

import { parseCommand, looksLikeAttempt, HELP_TEXT, WEEK_SCOPED, BOT_MARKER } from './reviewCommands.js';
import { dueDateFor } from './reviewTitle.js';
import { articleLink, reason } from './postSummary.js';
import { commandForStatusName, guardIncomingStatus } from './reviewActions.js';

export { commandForStatusName, guardIncomingStatus, WEEK_SCOPED, BOT_MARKER, HELP_TEXT };

export const PROPS = {
  title: 'Name',
  status: 'Status',
  scheduled: 'Scheduled',
  articleUrl: 'Article URL',
  postType: 'Post type',
  social: 'Social copy',
  postId: 'Post id',
};

export const STATUS = {
  review: 'Review',
  scheduled: 'Scheduled',
  rejected: 'Canceled',
  published: 'Published',
};

// Newest posts first, and only this many creates per sweep. The creation set
// is every approved article that has no page yet, which on a first run is the
// whole back catalogue. Opening all of them in one tick is how an earlier mirror once filed 161 issues. The rest wait for the next tick.
export const CREATE_LIMIT = 15;

// How far around "now" an already-live article still has its comments polled
// by the sweep. Older pages still take status and date edits (those come from
// the database query, which reads every page). Their slash-command comments
// are applied when the webhook delivers, or on the sweep if the page was also
// edited. A comment alone does not bump Notion's last_edited_time.
export const COMMENT_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

const LIVE = ['approved', 'published', 'partially_published'];

export const isArticleComplete = (post, now = new Date()) =>
  LIVE.includes(post?.status) && new Date(post.scheduled_for) <= new Date(now);

/**
 * The Status option the row calls for. Null means leave the property alone
 * (a planned row, or a published row whose day has not arrived).
 */
export const statusNameForRow = (post, now = new Date()) => {
  if (!post) return null;
  if (isArticleComplete(post, now)) return STATUS.published;
  if (post.status === 'approved') return STATUS.scheduled;
  if (post.status === 'vetoed') return STATUS.rejected;
  if (post.status === 'needs_review') return STATUS.review;
  return null;
};

export const notionId = (id) => {
  const raw = String(id ?? '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(raw)) return String(id ?? '');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
};

const textChunk = (content) => {
  const text = String(content ?? '');
  if (!text) return [{ type: 'text', text: { content: '' } }];
  const out = [];
  for (let i = 0; i < text.length; i += 1900) {
    out.push({ type: 'text', text: { content: text.slice(i, i + 1900) } });
  }
  return out;
};

export const plainText = (rich) => {
  if (!Array.isArray(rich)) return '';
  return rich.map((part) => part?.plain_text ?? part?.text?.content ?? '').join('');
};

export const commentText = (comment) => plainText(comment?.rich_text);

/**
 * Read the properties the sweep makes decisions from. Social copy is not
 * among them. It is rendered onto the page and never read back.
 */
export const readPageFields = (page) => {
  const props = page?.properties ?? {};
  const start = props[PROPS.scheduled]?.date?.start ?? null;
  return {
    id: page?.id ? notionId(page.id) : null,
    status: props[PROPS.status]?.select?.name ?? null,
    pageDate: start ? String(start).slice(0, 10) : null,
    postId: plainText(props[PROPS.postId]?.rich_text).trim() || null,
    url: page?.url ?? null,
    lastEdited: page?.last_edited_time ?? null,
    archived: page?.archived === true || page?.in_trash === true,
  };
};

/**
 * Status decision for one page.
 *
 * No observed status means the mirror has not recorded a baseline yet, so the
 * current value is not a decision. The outbound pass records it.
 */
export const inboundStatusDecision = ({ pageStatus, observedStatus, post }) => {
  if (observedStatus == null || observedStatus === '') {
    return { apply: false, reason: 'no observed status yet' };
  }
  const statusChanged = String(pageStatus ?? '') !== String(observedStatus);
  const command = commandForStatusName(pageStatus);
  return guardIncomingStatus({
    currentStatus: post?.status,
    command,
    stateChanged: statusChanged,
  });
};

/**
 * A Scheduled-date edit is a reschedule, with the same shape of guard:
 * only when it differs from the date we last wrote, and not when the row
 * already lands on that day.
 */
export const inboundDateDecision = ({ pageDate, observedDate, post }) => {
  if (!observedDate || !pageDate) return { apply: false, reason: 'no observed date yet' };
  if (pageDate === observedDate) return { apply: false, reason: 'no date change' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pageDate)) return { apply: false, reason: 'bad date' };
  if (pageDate === dueDateFor(post)) return { apply: false, reason: 'already' };
  return { apply: true, date: pageDate };
};

const asIdList = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);

/**
 * Commands to run for one page, plus the comment ids to remember so the next
 * sweep does not run them again. Status and date are included only when the
 * guards say so. Comments reuse parseCommand, including its loop guard.
 */
export const planInbound = ({
  post,
  pageStatus,
  pageDate,
  observedStatus,
  observedDate,
  comments,
  handledIds,
}) => {
  const actions = [];
  const status = inboundStatusDecision({ pageStatus, observedStatus, post });
  if (status.apply) {
    actions.push({ type: 'command', source: 'status', intent: { command: status.command } });
  }

  const date = inboundDateDecision({ pageDate, observedDate, post });
  if (date.apply) {
    actions.push({ type: 'command', source: 'date', intent: { command: 'reschedule', date: date.date } });
  }

  const handled = new Set(asIdList(handledIds));
  const seenCommentIds = [];
  const ordered = [...(comments ?? [])].sort((a, b) =>
    String(a?.created_time ?? '').localeCompare(String(b?.created_time ?? '')));

  for (const comment of ordered) {
    if (!comment?.id || handled.has(comment.id)) continue;
    seenCommentIds.push(comment.id);
    const text = commentText(comment);
    const intent = parseCommand(text);
    if (!intent) {
      if (looksLikeAttempt(text)) actions.push({ type: 'unparsed', commentId: comment.id });
      continue;
    }
    if (intent.errors?.length) {
      actions.push({ type: 'invalid', commentId: comment.id, errors: intent.errors });
      continue;
    }
    actions.push({
      type: 'command',
      source: 'comment',
      commentId: comment.id,
      intent,
      week: WEEK_SCOPED.has(intent.command),
    });
  }

  return { actions, seenCommentIds, status, date };
};

export const rememberCommentIds = (existing, seen) => {
  const next = [...asIdList(existing), ...asIdList(seen)];
  return next.slice(-200);
};

export const shouldPollComments = (post, now = new Date()) => {
  if (!post?.notion_page_id && !post?.scheduled_for) return false;
  if (!isArticleComplete(post, now)) return true;
  const delta = Math.abs(new Date(now).getTime() - new Date(post.scheduled_for).getTime());
  return delta < COMMENT_WINDOW_MS;
};

const etLong = (iso) =>
  new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
  });

const mediaUrl = (supabaseUrl, path) =>
  `${supabaseUrl}/storage/v1/object/public/marketing/${path}`;

/**
 * Social copy for display. The sweep never parses this back into the row.
 */
export const socialReference = (post) => {
  const copy = post?.copy || {};
  const hasSocial = copy.x || copy.instagram || copy.threads;
  if (post?.post_type === 'guide' || !hasSocial) {
    return 'No social copy on this post.';
  }
  const lines = [];
  if (copy.x) lines.push(`X: ${copy.x}`);
  if (copy.instagram) lines.push(`Instagram: ${copy.instagram}`);
  if (copy.threads) lines.push(`Threads: ${copy.threads}`);
  if (Array.isArray(copy.hashtags) && copy.hashtags.length) {
    lines.push(`Hashtags: ${copy.hashtags.map((tag) => `#${String(tag).replace(/^#/, '')}`).join(' ')}`);
  }
  lines.push('Edit captions in Buffer. A change here is overwritten on the next sweep and is not saved.');
  return lines.join('\n');
};

export const blocksForPost = (post, supabaseUrl) => {
  const copy = post?.copy || {};
  const blocks = [];
  const link = articleLink(post);

  blocks.push({
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: textChunk(
        'This page is rendered from the database. Set Status to Scheduled to approve, Review to send it back, or Canceled to reject. Change the Scheduled date to move the day. Social copy on this page is read-only. Edit captions in Buffer. Approving does not change those posts.',
      ),
    },
  });

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: textChunk(`${etLong(post.scheduled_for)} · ${reason(post)}`) },
  });

  if (link) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: 'Read the article', link: { url: link } },
        }],
      },
    });
  }

  const media = Array.isArray(post.media) ? post.media : [];
  if (supabaseUrl) {
    for (const card of media) {
      if (!card?.landscape_path) continue;
      blocks.push({
        object: 'block',
        type: 'image',
        image: { type: 'external', external: { url: mediaUrl(supabaseUrl, card.landscape_path) } },
      });
    }
  }

  if (copy.page_title || copy.page_body?.length) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: textChunk(copy.page_title || 'Article') },
    });
    for (const para of copy.page_body || []) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: textChunk(para) },
      });
    }
  } else {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: textChunk('No article written yet.') },
    });
  }

  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: textChunk('Social copy (read only)') },
  });
  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: textChunk(socialReference(post)) },
  });

  return blocks;
};

/**
 * Notion's Name property. The day and the post type already have Scheduled
 * and Post type, so the title is only the article title. The fallback matches
 * the old review subject, without that prefix. A row with no title at all
 * is called Article, so the Name property is never blank.
 */
export const articleTitle = (post) => {
  const subject = String(
    post?.copy?.page_title
    || post?.tmdb_refs?.[0]?.title
    || post?.payload?.title
    || '',
  ).trim();
  return subject || 'Article';
};

// `shape` is part of the hash on purpose. The Commands block was never in
// this object, and a title that was already only the article title would not
// move `title`. Pages written before this change store the previous hash.
// The new shape makes the next sweep replace those blocks and rewrite Name.
// That pass is outbound. Status and Scheduled are still a decision only when
// they differ from the values the sweep last wrote.
export const BODY_SHAPE = 'article-title';

export const bodyFingerprint = (post, supabaseUrl) => JSON.stringify({
  title: articleTitle(post),
  shape: BODY_SHAPE,
  reason: reason(post),
  link: articleLink(post),
  pageTitle: post?.copy?.page_title ?? null,
  body: post?.copy?.page_body ?? null,
  social: socialReference(post),
  type: post?.post_type ?? null,
  media: (post?.media || []).map((card) => card?.landscape_path ?? null),
  images: Boolean(supabaseUrl),
});

export const propertiesForPost = (post, now = new Date()) => {
  const desired = statusNameForRow(post, now);
  const social = socialReference(post).slice(0, 1900);
  const props = {
    [PROPS.title]: { title: textChunk(articleTitle(post).slice(0, 2000)) },
    [PROPS.scheduled]: { date: { start: dueDateFor(post) } },
    [PROPS.articleUrl]: { url: articleLink(post) },
    [PROPS.postType]: { rich_text: textChunk(String(post.post_type ?? '').replace(/_/g, ' ')) },
    [PROPS.social]: { rich_text: textChunk(social) },
    [PROPS.postId]: { rich_text: textChunk(String(post.id ?? '')) },
  };
  if (desired) props[PROPS.status] = { select: { name: desired } };
  return props;
};

/**
 * Whether the sweep should write the page back. Status is reconciled from
 * the row whenever it is not an unapplied human decision (the caller applies
 * inbound first). Block replacement follows the article body, not the status,
 * so an approval does not wipe the page content.
 *
 * A body-hash mismatch rewrites Name and the blocks. That includes the shape
 * mark that drops the dated title and the Commands section. The rewrite is
 * not a status or date command. Those still require a difference from the
 * values last written.
 */
export const outboundPlan = ({ post, pageStatus, pageDate, bodyHash, supabaseUrl, now }) => {
  const desired = statusNameForRow(post, now);
  const nextDate = dueDateFor(post);
  const nextHash = bodyFingerprint(post, supabaseUrl);
  const statusDrift = Boolean(desired) && pageStatus !== desired;
  const dateDrift = pageDate !== nextDate;
  const bodyDrift = bodyHash !== nextHash;
  return {
    patchProperties: statusDrift || dateDrift || bodyDrift,
    replaceBlocks: bodyDrift,
    desiredStatus: desired,
    desiredDate: nextDate,
    bodyHash: nextHash,
  };
};

export const databaseProperties = () => ({
  [PROPS.title]: { title: {} },
  [PROPS.status]: {
    select: {
      options: [
        { name: STATUS.review, color: 'yellow' },
        { name: STATUS.scheduled, color: 'green' },
        { name: STATUS.rejected, color: 'red' },
        { name: STATUS.published, color: 'gray' },
      ],
    },
  },
  [PROPS.scheduled]: { date: {} },
  [PROPS.articleUrl]: { url: {} },
  [PROPS.postType]: { rich_text: {} },
  [PROPS.social]: { rich_text: {} },
  [PROPS.postId]: { rich_text: {} },
});

export const databaseCreateBody = (parentPageId) => {
  if (!parentPageId) throw new Error('NOTION_PARENT_PAGE_ID is required');
  return {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: "What's On review" } }],
    properties: databaseProperties(),
  };
};

export const indexPages = (pages) => {
  const byId = new Map();
  const byPostId = new Map();
  for (const page of pages ?? []) {
    const fields = readPageFields(page);
    if (!fields.id || fields.archived) continue;
    byId.set(fields.id, page);
    if (fields.postId) byPostId.set(fields.postId, page);
  }
  return { byId, byPostId };
};

export const isNotionVerification = (payload) =>
  Boolean(payload)
  && typeof payload.verification_token === 'string'
  && payload.verification_token.length > 0
  && payload.type == null
  && payload.entity == null;

export const pageIdFromWebhook = (payload) => {
  const type = String(payload?.type ?? '');
  if (type.startsWith('comment.')) {
    return payload?.data?.page_id ?? payload?.data?.parent?.id ?? null;
  }
  if (payload?.entity?.type === 'page') return payload.entity.id ?? null;
  return payload?.data?.page_id ?? null;
};

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const notionSignatureHex = async (secret, body) => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Notion signs the raw body with the verification token and sends
 * `X-Notion-Signature: sha256=<hex>`. The prefix is accepted either way.
 */
export const notionSignatureOk = async (secret, body, header) => {
  if (!secret || !header) return false;
  const expected = await notionSignatureHex(secret, body);
  const got = String(header).replace(/^sha256=/i, '').trim().toLowerCase();
  return timingSafeEqual(expected, got);
};
