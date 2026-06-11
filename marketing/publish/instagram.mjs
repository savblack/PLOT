// Instagram publisher — Instagram Login API (graph.instagram.com).
// Single image: container -> poll -> publish.
// Carousel: child containers -> parent CAROUSEL container -> poll -> publish.
// Token + account id come from the marketing_tokens table.
const BASE = 'https://graph.instagram.com/v23.0';

const igFetch = async (path, params, { method = 'GET' } = {}) => {
  const url = new URL(`${BASE}/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url, { method });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Instagram API ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  }
  return data;
};

const waitForContainer = async (containerId, accessToken) => {
  for (let i = 0; i < 12; i++) {
    const { status_code } = await igFetch(containerId, { fields: 'status_code', access_token: accessToken });
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR') throw new Error(`Instagram container ${containerId} errored`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Instagram container ${containerId} not ready after 60s`);
};

/**
 * @param {object} token   {account_id, access_token} from marketing_tokens
 * @param {object} content {caption, imageUrls: [public JPEG URLs]} (1 = single, 2+ = carousel)
 * @returns {{platform_post_id, permalink}}
 */
export const publishToInstagram = async (token, { caption, imageUrls }) => {
  const { account_id: accountId, access_token: accessToken } = token;
  let creationId;

  if (imageUrls.length === 1) {
    const { id } = await igFetch(`${accountId}/media`, {
      image_url: imageUrls[0], caption, access_token: accessToken,
    }, { method: 'POST' });
    await waitForContainer(id, accessToken);
    creationId = id;
  } else {
    const children = [];
    for (const url of imageUrls.slice(0, 10)) {
      const { id } = await igFetch(`${accountId}/media`, {
        image_url: url, is_carousel_item: 'true', access_token: accessToken,
      }, { method: 'POST' });
      children.push(id);
    }
    await Promise.all(children.map(id => waitForContainer(id, accessToken)));
    const { id } = await igFetch(`${accountId}/media`, {
      media_type: 'CAROUSEL', children: children.join(','), caption, access_token: accessToken,
    }, { method: 'POST' });
    await waitForContainer(id, accessToken);
    creationId = id;
  }

  const { id: mediaId } = await igFetch(`${accountId}/media_publish`, {
    creation_id: creationId, access_token: accessToken,
  }, { method: 'POST' });

  const { permalink } = await igFetch(mediaId, { fields: 'permalink', access_token: accessToken })
    .catch(() => ({ permalink: null }));
  return { platform_post_id: mediaId, permalink };
};

export const getInstagramInsights = async (token, mediaId) => {
  const data = await igFetch(`${mediaId}/insights`, {
    metric: 'views,reach,likes,comments,saved,shares',
    access_token: token.access_token,
  });
  const byName = Object.fromEntries((data?.data || []).map(m => [m.name, m.values?.[0]?.value ?? null]));
  return {
    views: byName.views ?? byName.reach ?? null,
    likes: byName.likes ?? null,
    replies: byName.comments ?? null,
    reposts: byName.shares ?? null,
    saves: byName.saved ?? null,
    link_clicks: null,
    raw: data,
  };
};

export const refreshInstagramToken = async (accessToken) => {
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram token refresh ${res.status}: ${JSON.stringify(data)}`);
  return { access_token: data.access_token, expires_in: data.expires_in };
};
