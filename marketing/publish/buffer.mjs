// Buffer publisher for ALL channels (X, Instagram, Threads) via Buffer's GraphQL
// API — the $0 route, and the single publishing path now that scheduling is
// centralised in Buffer.
//
// Endpoint: POST https://api.buffer.com  {query}  with Bearer BUFFER_API_KEY.
// createPost(input: {channelId, schedulingType: automatic, mode, dueAt?,
//   saveToDraft?, text, assets: [{image:{url, metadata:{altText}}}]}).
//   mode: shareNow (post immediately) | customScheduled (+dueAt, a specific time)
//   saveToDraft: true  -> a draft you approve in Buffer before it sends
// No idempotency key exists — publish.mjs's atomic claim prevents duplicates.
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

  const mutation = `mutation {
    createPost(input: {
      channelId: ${str(channelId)},
      schedulingType: automatic,
      mode: ${mode}${dueAt}${draftField},
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
