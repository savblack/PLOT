import assert from 'node:assert/strict';
import test from 'node:test';
import { captureAttribution, currentArticleAttribution } from '../../src/utils/attribution.js';

function withBrowser(search, fn) {
  const store = new Map();
  globalThis.window = {
    location: { search, hostname: 'app.theplot.tv' },
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
    },
  };
  globalThis.document = { referrer: '' };
  try { return fn(store); }
  finally { delete globalThis.window; delete globalThis.document; }
}

test('What’s On article entry captures the slug as both first touch and current article', () => {
  withBrowser('?src=whats_on_article&utm_content=widows-bay-rewrites-the-emmy-record-book-2026-09-16', () => {
    const first = captureAttribution();
    assert.equal(first.src, 'whats_on_article');
    assert.equal(first.utm_content, 'widows-bay-rewrites-the-emmy-record-book-2026-09-16');
    assert.deepEqual(currentArticleAttribution(), {
      current_article_slug: 'widows-bay-rewrites-the-emmy-record-book-2026-09-16',
    });
  });
});

test('current article is not inferred from unrelated utm_content', () => {
  withBrowser('?src=newsletter&utm_content=weekly-digest', () => {
    assert.deepEqual(currentArticleAttribution(), {});
  });
});

test('first touch stays fixed while the current article follows the active link', () => {
  withBrowser('?src=instagram&utm_content=launch-post', (store) => {
    captureAttribution();
    window.location.search = '?src=whats_on_article&utm_content=second-article';
    const first = captureAttribution();
    assert.equal(first.src, 'instagram');
    assert.equal(first.utm_content, 'launch-post');
    assert.deepEqual(currentArticleAttribution(), { current_article_slug: 'second-article' });
    assert.ok(store.has('plot_attribution'));
  });
});
