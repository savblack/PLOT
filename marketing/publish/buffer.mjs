// X publisher via Buffer's GraphQL API (free plan; Buffer absorbs X's
// pay-per-use API costs — the only verified $0 route to X).
//
// Endpoint: POST https://api.buffer.com  {query}  with Bearer BUFFER_API_KEY.
// createPost(input: {channelId, schedulingType: automatic, mode: shareNow,
// text, assets: [{image: {url, metadata: {altText}}}]}).
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

// Resolve the X channel id once per run (or use BUFFER_CHANNEL_ID directly).
let channelIdPromise = null;
const getXChannelId = () => (channelIdPromise ??= (async () => {
  if (process.env.BUFFER_CHANNEL_ID) return process.env.BUFFER_CHANNEL_ID;
  const { account } = await gql('query { account { organizations { id } } }');
  for (const org of account?.organizations || []) {
    const { channels } = await gql(
      `query { channels(input: { organizationId: ${str(org.id)} }) { id service isLocked isDisconnected } }`);
    const x = (channels || []).find(c => c.service === 'twitter' && !c.isLocked && !c.isDisconnected);
    if (x) return x.id;
  }
  throw new Error('No connected X (twitter) channel found in Buffer');
})());

/**
 * @param {object} content {text, imageUrls (1-4 public URLs) | imageUrl, altText}
 * @returns {{platform_post_id, permalink}}
 */
export const publishToBuffer = async ({ text, imageUrls, imageUrl, altText }) => {
  // VOICE.md forbids URLs on X (downranking; also keeps a future direct-X
  // fallback at the cheap non-link rate). Hard-fail rather than quietly post.
  if (/https?:\/\/|www\./i.test(text)) throw new Error('X copy contains a URL — refusing to publish');

  const urls = (imageUrls || (imageUrl ? [imageUrl] : [])).slice(0, 4); // X caps at 4 images
  const assets = urls.map((url, i) =>
    `{ image: { url: ${str(url)}${i === 0 && altText ? `, metadata: { altText: ${str(altText)} }` : ''} } }`);

  const channelId = await getXChannelId();
  const mutation = `mutation {
    createPost(input: {
      channelId: ${str(channelId)},
      schedulingType: automatic,
      mode: shareNow,
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
