// Thin Notion REST client. Pinned to the 2022-06-28 API, which still addresses
// a database by id. A later version renamed that to a data source; this code
// does not speak it.

const NOTION_VERSION = '2022-06-28';

export const notionRequest = async (token, path, { method = 'GET', body } = {}, retried = false) => {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429 && !retried) {
    const wait = Number(res.headers.get('retry-after') ?? 1);
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 5) * 1000));
    return notionRequest(token, path, { method, body }, true);
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Notion answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};

export const listDatabasePages = async (token, databaseId) => {
  const pages = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionRequest(token, `/databases/${databaseId}/query`, { method: 'POST', body });
    pages.push(...(data.results ?? []));
    if (!data.has_more) return { pages, complete: true };
    cursor = data.next_cursor;
  }
  return { pages, complete: false };
};

export const listComments = async (token, pageId) => {
  const out = [];
  let cursor;
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ block_id: pageId, page_size: '100' });
    if (cursor) q.set('start_cursor', cursor);
    const data = await notionRequest(token, `/comments?${q}`);
    out.push(...(data.results ?? []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return out;
};

export const createComment = (token, pageId, text) => {
  const content = String(text ?? '').slice(0, 1900);
  return notionRequest(token, '/comments', {
    method: 'POST',
    body: {
      parent: { page_id: pageId },
      rich_text: [{ type: 'text', text: { content } }],
    },
  });
};

const listChildIds = async (token, pageId) => {
  const ids = [];
  let cursor;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ page_size: '100' });
    if (cursor) q.set('start_cursor', cursor);
    const data = await notionRequest(token, `/blocks/${pageId}/children?${q}`);
    for (const block of data.results ?? []) ids.push(block.id);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return ids;
};

export const replaceBlocks = async (token, pageId, blocks) => {
  const ids = await listChildIds(token, pageId);
  for (const id of ids) {
    await notionRequest(token, `/blocks/${id}`, { method: 'DELETE' });
  }
  for (let i = 0; i < blocks.length; i += 50) {
    await notionRequest(token, `/blocks/${pageId}/children`, {
      method: 'PATCH',
      body: { children: blocks.slice(i, i + 50) },
    });
  }
};
