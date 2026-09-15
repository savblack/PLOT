// Buffer client for ALL social channels (X, Instagram, Threads) — the $0 route,
// and the single publishing path now that scheduling lives in Buffer rather
// than here.
//
// The pipeline no longer SENDS. It schedules: schedule.mjs pushes the week into
// Buffer with a dueAt, you review and adjust it there, and Buffer does the
// sending. reconcile.mjs then reads back what actually happened. So this module
// has two halves — one that writes a post, one that reads it — and the reading
// half is what keeps the database honest about a queue it no longer controls.
//
// Endpoint: POST https://api.buffer.com  {query}  with Bearer BUFFER_API_KEY.
// createPost(input: {channelId, schedulingType: automatic, mode, dueAt?,
//   saveToDraft?, text, assets: [{image:{url, metadata:{altText}}}]}).
//   mode: shareNow (post immediately) | customScheduled (+dueAt, a specific time)
//   saveToDraft: true  -> a draft you approve in Buffer before it sends
// No idempotency key exists — the atomic claim in schedule.mjs prevents
// duplicates.
const API_URL = 'https://api.buffer.com';

const gql = async (query) => {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) throw new Error('BUFFER_API_KEY is not set');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors?.length) {
    throw new Error(`Buffer API ${res.status}: ${data.errors?.[0]?.message || JSON.stringify(data)}`);
  }
  return data.data;
};

const str = (s) => JSON.stringify(String(s ?? ''));

// Resolve channel ids by Buffer service ('twitter' | 'instagram' | 'threads'),
// cached for the run. Override any with BUFFER_CHANNEL_<SERVICE> if ever needed.
let channelsPromise = null;
const getChannels = () => (channelsPromise ??= (async () => {
  const { account } = await gql('query { account { organizations { id } } }');
  const map = {};
  for (const org of account?.organizations || []) {
    const { channels } = await gql(
      `query { channels(input: { organizationId: ${str(org.id)} }) { id service isLocked isDisconnected } }`);
    for (const c of channels || []) {
      if (!c.isLocked && !c.isDisconnected && !map[c.service]) map[c.service] = c.id;
    }
  }
  return map;
})());

const channelFor = async (service) => {
  const override = process.env[`BUFFER_CHANNEL_${service.toUpperCase()}`];
  if (override) return override;
  const id = (await getChannels())[service];
  if (!id) throw new Error(`No connected Buffer channel for service "${service}"`);
  return id;
};

/**
 * Publish (or schedule, or draft) one post to one Buffer channel.
 * @param {object} content
 *   service:     'twitter' | 'instagram' | 'threads'
 *   text:        post body
 *   imageUrls:   public image URLs (1 for X, carousel for IG/Threads) — [] = text-only
 *   altText:     alt text for the first image
 *   scheduledAt: ISO/Date — if set, schedule at that time (else post now)
 *   draft:       true -> save as a Buffer draft to approve there
 * @returns {{platform_post_id, permalink}}
 */
export const publishToBuffer = async ({
  service = 'twitter', text, imageUrls, imageUrl, altText, scheduledAt, draft = false,
}) => {
  // VOICE.md forbids URLs on X (downranking). IG/Threads captions may say
  // "theplot.tv", so the guard is X-only.
  if (service === 'twitter' && /https?:\/\/|www\./i.test(text)) {
    throw new Error('X copy contains a URL — refusing to publish');
  }

  const cap = service === 'twitter' ? 4 : 10; // X caps at 4 images; IG/Threads carousels
  const urls = (imageUrls || (imageUrl ? [imageUrl] : [])).slice(0, cap);
  const assets = urls.map((url, i) =>
    `{ image: { url: ${str(url)}${i === 0 && altText ? `, metadata: { altText: ${str(altText)} }` : ''} } }`);

  const mode = scheduledAt ? 'customScheduled' : 'shareNow';
  const dueAt = scheduledAt ? `, dueAt: ${str(new Date(scheduledAt).toISOString())}` : '';
  const draftField = draft ? ', saveToDraft: true' : '';
  const channelId = await channelFor(service);

  // Instagram requires both `type` (post | story | reel) and `shouldShareToFeed`
  // or Buffer rejects the post. We always publish a normal feed post.
  const metaField = service === 'instagram'
    ? ', metadata: { instagram: { type: post, shouldShareToFeed: true } }' : '';

  const mutation = `mutation {
    createPost(input: {
      channelId: ${str(channelId)},
      schedulingType: automatic,
      mode: ${mode}${dueAt}${draftField}${metaField},
      text: ${str(text)},
      assets: [${assets.join(', ')}]
    }) {
      ... on PostActionSuccess { post { id externalLink } }
      ... on MutationError { message }
    }
  }`;

  const data = await gql(mutation);
  const result = data?.createPost;
  if (!result?.post) throw new Error(`Buffer createPost failed: ${result?.message || 'unknown error'}`);
  return { platform_post_id: result.post.id, permalink: result.post.externalLink || null };
};

// ── The reading half ─────────────────────────────────────────────────────────
// Once a post is in Buffer it stops being ours. You can edit its text, move it,
// or delete it there, and nothing tells us — Buffer has no webhook. So the only
// way the database can stay honest is to ask. Everything below is that ask.

/**
 * Like `gql`, but hands back errors instead of throwing.
 *
 * Needed because "this post no longer exists" is a NORMAL outcome here, not a
 * failure: it is what deleting a post in Buffer looks like from out here, and it
 * is the single most likely thing you will do on a review. A helper that threw
 * would make the expected case indistinguishable from an outage.
 */
const gqlSoft = async (query) => {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) throw new Error('BUFFER_API_KEY is not set');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: body.data, errors: body.errors || [] };
};

// Buffer's own vocabulary for where a post is up to, straight off PostStatus:
//   draft | needs_approval | scheduled | sending | sent | error
// Kept as Buffer's words rather than translated at the boundary, so a surprising
// value shows up as itself in a log rather than as our guess about it.
const NOT_FOUND = /not.?found|does not exist|no such post/i;

/**
 * Read one Buffer post back.
 *
 * @param {string} id  the Buffer post id, stored on the publication row
 * @returns {Promise<null | {
 *   status: string, sentAt: string|null, permalink: string|null,
 *   text: string|null, dueAt: string|null, error: string|null,
 * }>}  null means Buffer has no such post — you deleted it there.
 */
export const getBufferPost = async (id) => {
  const { ok, status, data, errors } = await gqlSoft(`query {
    post(input: { id: ${str(id)} }) {
      id status dueAt sentAt externalLink text
      error { message }
    }
  }`);

  // A deleted post reads as either a null payload or an explicit not-found
  // error, depending on how it was removed. Both mean the same thing to us.
  if (errors.length) {
    const message = String(errors[0]?.message ?? '');
    const code = String(errors[0]?.extensions?.code ?? '');
    if (code === 'NOT_FOUND' || NOT_FOUND.test(message)) return null;
    throw new Error(`Buffer post(${id}) failed: ${message || `status ${status}`}`);
  }
  if (!ok) throw new Error(`Buffer API ${status} reading post ${id}`);
  const post = data?.post;
  if (!post) return null;

  return {
    status: post.status ?? null,
    sentAt: post.sentAt ?? null,
    permalink: post.externalLink ?? null,
    text: post.text ?? null,
    dueAt: post.dueAt ?? null,
    error: post.error?.message ?? null,
  };
};

/**
 * How much room is left in the queue, per channel.
 *
 * The plan caps scheduled posts PER CHANNEL (10 on the free plan — the API
 * reports it as `limits.scheduledPosts`, and Buffer's pricing page confirms the
 * per-channel reading). A generated week is 7 per channel, so a week fits and
 * two weeks do not. Worth knowing BEFORE pushing rather than discovering it as a
 * rejection partway through a channel, which would leave half a week scheduled
 * and half not.
 *
 * @returns {Promise<{limit: number|null, scheduled: Record<string, number>}>}
 *   `scheduled` is keyed by Buffer service name; `limit` is null if the account
 *   does not report one (a paid plan with no cap), meaning "do not check".
 */
export const channelCapacity = async () => {
  const { account } = await gql(
    'query { account { organizations { id limits { scheduledPosts } } } }');
  const org = account?.organizations?.[0];
  const limit = org?.limits?.scheduledPosts ?? null;

  const scheduled = {};
  if (org?.id) {
    // Both statuses occupy a queue slot: `sending` is a post Buffer has started
    // but not finished, and it has not freed its slot yet.
    for (const state of ['scheduled', 'sending']) {
      const { posts } = await gql(`query {
        posts(first: 100, input: {
          organizationId: ${str(org.id)},
          filter: { status: ${state} }
        }) { edges { node { channelService } } }
      }`);
      for (const edge of posts?.edges || []) {
        const service = edge?.node?.channelService;
        if (service) scheduled[service] = (scheduled[service] || 0) + 1;
      }
    }
  }
  return { limit, scheduled };
};

/**
 * Each channel's own posting schedule: the times of day Buffer recommends for
 * that service, per weekday, in the channel's timezone.
 *
 * This is what "let Buffer pick the time" actually means. The alternative —
 * `mode: addToQueue`, which drops a post into the next free slot — cannot be
 * used here, because it lets QUEUE ORDER decide the date. PLOT's copy is
 * day-specific ("14 days until...", "aired last night"), and Threads has only
 * two slots a day against roughly sixteen posts a week, so posts would quietly
 * land on days their own text contradicts. Pinning the day and borrowing the
 * hour keeps both: Buffer's judgement about when people are reading, ours about
 * what day the post is for.
 *
 * @returns {Promise<Record<string, {timezone: string, byDay: Record<string, string[]>}>>}
 *   keyed by Buffer service; `byDay` keys are 'mon'...'sun', values 'HH:MM'.
 */
export const getPostingSchedules = async () => {
  const { account } = await gql('query { account { organizations { id } } }');
  const out = {};
  for (const org of account?.organizations || []) {
    const { channels } = await gql(`query {
      channels(input: { organizationId: ${str(org.id)} }) {
        service timezone isLocked isDisconnected
        postingSchedule { day times }
      }
    }`);
    for (const c of channels || []) {
      if (c.isLocked || c.isDisconnected || out[c.service]) continue;
      const byDay = {};
      for (const slot of c.postingSchedule || []) {
        const times = (slot.times || []).filter(Boolean).sort();
        if (times.length) byDay[String(slot.day).toLowerCase()] = times;
      }
      out[c.service] = { timezone: c.timezone || 'Australia/Sydney', byDay };
    }
  }
  return out;
};
