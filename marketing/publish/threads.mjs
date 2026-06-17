// Threads publisher — graph.threads.net, same container pattern as Instagram.
const BASE = 'https://graph.threads.net/v1.0';

const thFetch = async (path, params, { method = 'GET' } = {}) => {
  const url = new URL(`${BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url, { method });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Threads API ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  }
  return data;
};

const waitForContainer = async (containerId, accessToken) => {
  for (let i = 0; i < 12; i++) {
    const { status } = await thFetch(containerId, { fields: 'status', access_token: accessToken });
    if (status === 'FINISHED') return;
    if (status === 'ERROR') throw new Error(`Threads container ${containerId} errored`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Threads container ${containerId} not ready after 60s`);
};

/**
 * @param {object} token   {account_id, access_token} from marketing_tokens
 * @param {object} content {text, imageUrls} (0 = text-only, 1 = single image, 2+ = carousel)
 * @returns {{platform_post_id, permalink}}
 */
export const publishToThreads = async (token, { text, imageUrls = [] }) => {
  const { account_id: userId, access_token: accessToken } = token;
  let creationId;

  if (!imageUrls.length) {
    // Text-only post (conversation type).
    const { id } = await thFetch(`${userId}/threads`, {
      media_type: 'TEXT', text, access_token: accessToken,
    }, { method: 'POST' });
    await waitForContainer(id, accessToken);
    creationId = id;
  } else if (imageUrls.length === 1) {
    const { id } = await thFetch(`${userId}/threads`, {
      media_type: 'IMAGE', image_url: imageUrls[0], text, access_token: accessToken,
    }, { method: 'POST' });
    await waitForContainer(id, accessToken);
    creationId = id;
  } else {
    const children = [];
    for (const url of imageUrls.slice(0, 10)) {
      const { id } = await thFetch(`${userId}/threads`, {
        media_type: 'IMAGE', image_url: url, is_carousel_item: 'true', access_token: accessToken,
      }, { method: 'POST' });
      children.push(id);
    }
    await Promise.all(children.map(id => waitForContainer(id, accessToken)));
    const { id } = await thFetch(`${userId}/threads`, {
      media_type: 'CAROUSEL', children: children.join(','), text, access_token: accessToken,
    }, { method: 'POST' });
    await waitForContainer(id, accessToken);
    creationId = id;
  }

  const { id: mediaId } = await thFetch(`${userId}/threads_publish`, {
    creation_id: creationId, access_token: accessToken,
  }, { method: 'POST' });

  const { permalink } = await thFetch(mediaId, { fields: 'permalink', access_token: accessToken })
    .catch(() => ({ permalink: null }));
  return { platform_post_id: mediaId, permalink };
};

export const getThreadsInsights = async (token, mediaId) => {
  const data = await thFetch(`${mediaId}/insights`, {
    metric: 'views,likes,replies,reposts,quotes',
    access_token: token.access_token,
  });
  const byName = Object.fromEntries((data?.data || []).map(m => [m.name, m.values?.[0]?.value ?? null]));
  return {
    views: byName.views ?? null,
    likes: byName.likes ?? null,
    replies: byName.replies ?? null,
    reposts: (byName.reposts ?? 0) + (byName.quotes ?? 0) || null,
    saves: null,
    link_clicks: null,
    raw: data,
  };
};

export const refreshThreadsToken = async (accessToken) => {
  const url = new URL('https://graph.threads.net/refresh_access_token');
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Threads token refresh ${res.status}: ${JSON.stringify(data)}`);
  return { access_token: data.access_token, expires_in: data.expires_in };
};
