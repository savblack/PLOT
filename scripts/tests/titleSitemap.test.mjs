import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderTitlesSitemap } from '../../supabase/functions/_shared/titleSitemap.js';

test('the Week 1 tracked titles render as nine canonical movie URLs', async () => {
  const titles = JSON.parse(await readFile(new URL('../title-sitemap-week1.json', import.meta.url), 'utf8'));
  const { xml, count } = renderTitlesSitemap(titles);
  assert.equal(count, 9);
  for (const title of titles) {
    const slug = title.title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    assert.match(xml, new RegExp(`<loc>https://theplot\\.tv/movie/${slug}-${title.tmdb_id}</loc>`));
  }
  assert.equal((xml.match(/<url>/g) || []).length, 9);
  const withFeedDuplicate = renderTitlesSitemap([...titles, { id: 1421903, media_type: 'movie', title: 'Different feed title' }]);
  assert.match(withFeedDuplicate.xml, /<loc>https:\/\/theplot.tv\/movie\/werwulf-1421903<\/loc>/);
  assert.equal(withFeedDuplicate.count, 9);
});
