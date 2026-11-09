// Shared sweep for marketing-notion-mirror and marketing-notion-sync.
//
// One function does both directions so a webhook and the cron cannot disagree
// about what a Status edit means. Inbound runs first, against the status and
// date the previous sweep recorded. Outbound then paints the page from the
// row, including whatever the inbound pass just wrote.
//
import { BOT_MARKER, HELP_TEXT } from './reviewCommands.js';
import { applyArticleAction, applyWeekAction } from './reviewActions.js';
import {
  CREATE_LIMIT,
  PROPS,
  STATUS,
  blocksForPost,
  bodyFingerprint,
  indexPages,
  notionId,
  outboundPlan,
  planInbound,
  propertiesForPost,
  readPageFields,
  rememberCommentIds,
  shouldPollComments,
  statusNameForRow,
} from './notionReview.js';
import {
  createComment,
  listComments,
  listDatabasePages,
  notionRequest,
  replaceBlocks,
} from './notionApi.js';

const CREATABLE = ['needs_review', 'approved'];
const WITH_PAGE = [
  'needs_review', 'approved', 'published', 'partially_published', 'vetoed',
  'planned', 'copy_ready', 'generated',
];

const replyText = (body) => `${BOT_MARKER} · ${body}`;

/**
 * Starts marketing-weekly-batch.yml from a Notion /generate comment.
 * The token is the caller's: this module does not read the environment.
 */
export const githubDispatch = (token, repo) => async (workflow) => {
  if (!token) return { ok: false, reason: 'GH_DISPATCH_TOKEN_CONTENT is not set' };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'plot-notion-sync',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    const detail = body.slice(0, 160).replace(/\s+/g, ' ').trim();
    return { ok: false, reason: `GitHub refused the dispatch (${res.status}${detail ? `: ${detail}` : ''})` };
  } catch (err) {
    return { ok: false, reason: `the dispatch call errored (${String(err?.message ?? err).slice(0, 120)})` };
  }
};

const stamp = (supabase, id, patch) =>
  supabase.from('marketing_posts').update(patch).eq('id', id);

const reload = async (supabase, id) => {
  const { data, error } = await supabase.from('marketing_posts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const clearPage = (supabase, id, error) => stamp(supabase, id, {
  notion_page_id: null,
  notion_page_url: null,
  notion_remote_edited_at: null,
  notion_observed_status: null,
  notion_observed_date: null,
  notion_body_hash: null,
  notion_handled_comment_ids: [],
  notion_sync_error: error ? String(error).slice(0, 500) : null,
});

async function postReply(token, pageId, body) {
  try {
    await createComment(token, pageId, replyText(body).slice(0, 1900));
  } catch (err) {
    console.error('Notion reply failed:', err);
  }
}

async function applyActions(supabase, token, post, actions, opts) {
  let current = post;
  for (const action of actions) {
    if (opts.dryRun) continue;
    if (action.type === 'unparsed') {
      await postReply(token, opts.pageId, 'That looked like a command, but I could not read it. The command has to be the first line of the comment.\n\n' + HELP_TEXT);
      continue;
    }
    if (action.type === 'invalid') {
      await postReply(token, opts.pageId, `${action.errors.map((e) => `- ${e}`).join('\n')}\n\n${HELP_TEXT}`);
      continue;
    }
    if (action.type !== 'command') continue;
    try {
      const result = action.week
        ? await applyWeekAction(supabase, action.intent, opts.actionOpts)
        : await applyArticleAction(supabase, current, action.intent, opts.actionOpts);
      await postReply(token, opts.pageId, result.reply);
      if (!action.week) current = await reload(supabase, current.id) ?? current;
    } catch (err) {
      console.error('Notion command failed:', err);
      await postReply(token, opts.pageId, `That failed on our side and nothing changed: ${String(err?.message ?? err).slice(0, 200)}`);
    }
  }
  return current;
}

async function writePage(token, pageId, post, plan, supabaseUrl, now) {
  let written = null;
  if (plan.patchProperties) {
    written = await notionRequest(token, `/pages/${pageId}`, {
      method: 'PATCH',
      body: { properties: propertiesForPost(post, now) },
    });
  }
  if (plan.replaceBlocks) {
    await replaceBlocks(token, pageId, blocksForPost(post, supabaseUrl));
    written = await notionRequest(token, `/pages/${pageId}`);
  }
  return written;
}

/**
 * Inbound, then outbound, for one row and the Notion page we already fetched.
 * `comments` may be null when this page is outside the comment window and was
 * not edited. Pass an array (possibly empty) to consider comments.
 */
export async function syncPost(supabase, post, page, opts) {
  const fields = readPageFields(page);
  const pageId = fields.id;
  if (!pageId) throw new Error('Notion page has no id');

  if (fields.archived) {
    if (!opts.dryRun) await clearPage(supabase, post.id, 'Notion page is archived');
    return { archived: true };
  }

  const comments = opts.comments;
  const planned = planInbound({
    post,
    pageStatus: fields.status,
    pageDate: fields.pageDate,
    observedStatus: post.notion_observed_status,
    observedDate: post.notion_observed_date,
    comments: comments ?? [],
    handledIds: post.notion_handled_comment_ids,
  });

  const current = await applyActions(supabase, opts.token, post, planned.actions, {
    dryRun: opts.dryRun,
    pageId,
    actionOpts: opts.actionOpts,
  });

  const plan = outboundPlan({
    post: current,
    pageStatus: fields.status,
    pageDate: fields.pageDate,
    bodyHash: current.notion_body_hash,
    supabaseUrl: opts.supabaseUrl,
    now: opts.now,
  });

  // A status we just applied is already what the row wants. Don't patch the
  // property back to the pre-command value: outboundPlan reads the reloaded row.
  let written = null;
  if (!opts.dryRun && (plan.patchProperties || plan.replaceBlocks)) {
    written = await writePage(opts.token, pageId, current, plan, opts.supabaseUrl, opts.now);
  }

  // A status or date command we accepted is itself the new baseline, even
  // when the page body did not need a rewrite. Leaving the old observed value
  // would make the next sweep treat the same edit as a fresh decision.
  const appliedStatus = planned.actions.some((action) => action.source === 'status');
  const appliedDate = planned.actions.some((action) => action.source === 'date');
  const observedStatus = plan.patchProperties
    ? (plan.desiredStatus ?? fields.status)
    : (appliedStatus ? fields.status : (current.notion_observed_status ?? fields.status));
  const observedDate = plan.patchProperties
    ? plan.desiredDate
    : (appliedDate ? fields.pageDate : (current.notion_observed_date ?? fields.pageDate));

  // Idle pages are left alone. Stamping every row on every tick would write
  // the whole catalogue every five minutes, and a quiet sweep should be reads.
  const needsStamp = planned.actions.length > 0
    || planned.seenCommentIds.length > 0
    || plan.patchProperties
    || plan.replaceBlocks
    || !current.notion_observed_status
    || !current.notion_page_id;

  if (!opts.dryRun && needsStamp) {
    await stamp(supabase, current.id, {
      notion_page_id: pageId,
      notion_page_url: written?.url ?? fields.url ?? current.notion_page_url,
      notion_synced_at: new Date().toISOString(),
      notion_remote_edited_at: written?.last_edited_time ?? fields.lastEdited,
      notion_observed_status: observedStatus,
      notion_observed_date: observedDate,
      notion_body_hash: plan.bodyHash,
      notion_handled_comment_ids: rememberCommentIds(
        current.notion_handled_comment_ids,
        planned.seenCommentIds,
      ),
      notion_sync_error: null,
    });
  }

  return {
    inbound: planned.actions.length,
    patched: plan.patchProperties,
    blocks: plan.replaceBlocks,
  };
}

async function createPage(supabase, post, opts) {
  const properties = propertiesForPost(post, opts.now);
  if (!properties[PROPS.status]) {
    properties[PROPS.status] = { select: { name: statusNameForRow(post, opts.now) ?? STATUS.review } };
  }
  const blocks = blocksForPost(post, opts.supabaseUrl);
  const created = await notionRequest(opts.token, '/pages', {
    method: 'POST',
    body: {
      parent: { database_id: opts.databaseId },
      properties,
      children: blocks.slice(0, 100),
    },
  });
  const pageId = notionId(created.id);
  if (blocks.length > 100) {
    await notionRequest(opts.token, `/blocks/${pageId}/children`, {
      method: 'PATCH',
      body: { children: blocks.slice(100) },
    });
  }
  const desired = statusNameForRow(post, opts.now) ?? STATUS.review;
  await stamp(supabase, post.id, {
    notion_page_id: pageId,
    notion_page_url: created.url ?? null,
    notion_synced_at: new Date().toISOString(),
    notion_remote_edited_at: created.last_edited_time ?? null,
    notion_observed_status: desired,
    notion_observed_date: properties[PROPS.scheduled]?.date?.start ?? null,
    notion_body_hash: bodyFingerprint(post, opts.supabaseUrl),
    notion_handled_comment_ids: [],
    notion_sync_error: null,
  });
  return pageId;
}

async function commentsFor(token, post, page, opts) {
  const fields = readPageFields(page);
  const edited = fields.lastEdited
    && post.notion_remote_edited_at
    && new Date(fields.lastEdited) > new Date(post.notion_remote_edited_at);
  if (opts.forceComments || shouldPollComments(post, opts.now) || edited || !post.notion_observed_status) {
    return await listComments(token, fields.id);
  }
  return null;
}

/**
 * The whole sweep. Reads Notion, applies human edits, then paints pages from
 * the rows. Dry run does the reads and the planning and writes nothing.
 */
export async function sweepNotion(supabase, opts) {
  const { pages, complete } = await listDatabasePages(opts.token, opts.databaseId);
  const index = indexPages(pages);
  const done = new Set();
  const counts = {
    created: 0, adopted: 0, inbound: 0, patched: 0, blocks: 0,
    would_create: 0, skipped_archived: 0, errors: 0,
    pages: pages.length, query_complete: complete,
  };

  const { data: pending, error: pendingError } = await supabase
    .from('marketing_posts')
    .select('*')
    .in('status', CREATABLE)
    .is('notion_page_id', null)
    .not('slug', 'is', null)
    .order('scheduled_for', { ascending: false });
  if (pendingError) throw new Error(pendingError.message);

  let created = 0;
  for (const post of pending ?? []) {
    const existing = index.byPostId.get(post.id);
    if (existing) {
      counts.adopted++;
      if (opts.dryRun) continue;
      try {
        const comments = await commentsFor(opts.token, { ...post, notion_page_id: readPageFields(existing).id }, existing, opts);
        const result = await syncPost(supabase, post, existing, { ...opts, comments: comments ?? [] });
        done.add(post.id);
        counts.inbound += result.inbound ? 1 : 0;
        if (result.patched) counts.patched++;
        if (result.blocks) counts.blocks++;
      } catch (err) {
        counts.errors++;
        console.error(`Notion adopt failed for ${post.id}:`, err);
        if (!opts.dryRun) {
          await stamp(supabase, post.id, { notion_sync_error: String(err?.message ?? err).slice(0, 500) });
        }
      }
      continue;
    }
    counts.would_create++;
    if (opts.dryRun) continue;
    if (created >= CREATE_LIMIT) continue;
    try {
      await createPage(supabase, post, opts);
      done.add(post.id);
      created++;
      counts.created++;
    } catch (err) {
      counts.errors++;
      console.error(`Notion create failed for ${post.topic_key}:`, err);
      await stamp(supabase, post.id, { notion_sync_error: String(err?.message ?? err).slice(0, 500) });
    }
  }

  const { data: mirrored, error: mirroredError } = await supabase
    .from('marketing_posts')
    .select('*')
    .not('notion_page_id', 'is', null)
    .in('status', WITH_PAGE);
  if (mirroredError) throw new Error(mirroredError.message);

  for (const post of mirrored ?? []) {
    if (done.has(post.id)) continue;
    const page = index.byId.get(notionId(post.notion_page_id));
    if (!page) {
      if (complete && !opts.dryRun) {
        counts.skipped_archived++;
        await clearPage(supabase, post.id, 'Notion page is gone');
      }
      continue;
    }
    try {
      const comments = await commentsFor(opts.token, post, page, opts);
      // Null comments means "don't look". planInbound would otherwise treat
      // an empty list as "no new comments", which is the same result, so an
      // empty list is safe. Passing null skips the request only.
      const result = await syncPost(supabase, post, page, {
        ...opts,
        comments: comments ?? [],
      });
      if (result.archived) {
        counts.skipped_archived++;
        continue;
      }
      if (result.inbound) counts.inbound++;
      if (result.patched) counts.patched++;
      if (result.blocks) counts.blocks++;
    } catch (err) {
      counts.errors++;
      console.error(`Notion sync failed for ${post.topic_key}:`, err);
      const status = err?.status;
      if (status === 404 && !opts.dryRun) {
        await clearPage(supabase, post.id, 'Notion page is gone');
      } else if (!opts.dryRun) {
        await stamp(supabase, post.id, { notion_sync_error: String(err?.message ?? err).slice(0, 500) });
      }
    }
  }

  return counts;
}

/**
 * Webhook entry: one page, inbound and outbound, same rules as the sweep.
 * Returns null when the page is not one of ours.
 */
export async function syncNotionPage(supabase, pageId, opts) {
  const id = notionId(pageId);
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*')
    .eq('notion_page_id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const page = await notionRequest(opts.token, `/pages/${id}`);
  const comments = await listComments(opts.token, id);
  const result = await syncPost(supabase, data, page, { ...opts, comments, forceComments: true });
  return result;
}
