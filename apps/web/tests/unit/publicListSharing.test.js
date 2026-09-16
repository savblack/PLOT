import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../../functions/list/[id].js';

const request = new Request('https://app.theplot.tv/list/test-list');

test('public list includes a signup path, sign-in and useful empty state without inventing titles', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => Response.json(
    url.includes('user_custom_lists?') ? [{ id: 'test-list', name: '<Weekend picks>', user_id: 'test-owner' }] : [],
  );
  try {
    const response = await onRequest({ request, params: { id: 'test-list' }, env: {} });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /&lt;Weekend picks&gt;/);
    assert.match(html, /Create your free watchlist/);
    assert.match(html, /href="\/signup\?src=list_page"/);
    assert.match(html, /href="\/login\?src=list_page"/);
    assert.match(html, /This list is empty for now/);
  } finally { globalThis.fetch = original; }
});

test('a private or unavailable list does not reveal list content or cache its response', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  try {
    const response = await onRequest({ request, params: { id: 'test-list' }, env: {} });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /noindex/);
  } finally { globalThis.fetch = original; }
});

// ID resolved from a TMDB search response for Severance during this change.
test('list titles lead to the save preview with attribution instead of leaving the app', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => Response.json(
    url.includes('user_custom_lists?') ? [{ id: 'test-list', name: 'Weekend', user_id: 'test-owner' }]
      : url.includes('user_custom_list_items?') ? [{ tmdb_id: 95396, media_type: 'tv', title: 'Severance', poster_path: null }]
        : [],
  );
  try {
    const response = await onRequest({ request, params: { id: 'test-list' }, env: {} });
    const html = await response.text();
    assert.match(html, /href="https:\/\/app.theplot.tv\/save\?media_type=tv&amp;tmdb_id=95396&amp;src=list_page"/);
    assert.match(html, /og:image/);
  } finally { globalThis.fetch = original; }
});
