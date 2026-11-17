// Pure sitemap formatting. The slug rule matches the public title-page URL.
const slugify = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'title';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[c]));

export function renderTitlesSitemap(titles, site = 'https://theplot.tv') {
  const urls = new Map();
  for (const title of titles) {
    const id = Number(title.tmdb_id ?? title.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const type = title.media_type === 'tv' ? 'tv' : 'movie';
    // Tracked titles are passed first. Keep their verified canonical spelling
    // if a later discovery feed names the same ID differently.
    if (!urls.has(`${type}:${id}`)) urls.set(`${type}:${id}`, `${site}/${type}/${slugify(title.title || title.name)}-${id}`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls.values()].map((loc) => `<url><loc>${esc(loc)}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`;
  return { xml, count: urls.size };
}
