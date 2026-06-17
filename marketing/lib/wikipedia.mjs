// Free Wikipedia / Wikidata enrichment — no API key, no cost.
// Resolves a title to its English Wikipedia page (preferring the exact match
// via the Wikidata id from TMDB) and returns a short background extract the
// copy worker can paraphrase. Best-effort: any failure returns null.
const UA = 'PLOT-marketing/1.0 (+https://theplot.tv)';

const getJson = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
};

// Wikidata id -> English Wikipedia page title (the reliable path: no ambiguity).
const enwikiTitleFromWikidata = async (qid) => {
  const data = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`);
  return data?.entities?.[qid]?.sitelinks?.enwiki?.title || null;
};

/**
 * @param {{wikidataId?: string|null, title?: string, year?: string|null}} opts
 * @returns {Promise<{title, extract, url}|null>}
 */
export const getWikipediaSummary = async ({ wikidataId, title, year } = {}) => {
  try {
    let pageTitle = wikidataId ? await enwikiTitleFromWikidata(wikidataId) : null;

    // Fallback: title search (less precise, so only used when there's no QID).
    if (!pageTitle && title) {
      const q = year ? `${title} ${year}` : title;
      const search = await getJson(
        `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`);
      pageTitle = search?.pages?.[0]?.title || null;
    }
    if (!pageTitle) return null;

    const sum = await getJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`);
    if (!sum || sum.type === 'disambiguation' || !sum.extract) return null;

    return {
      title: sum.title,
      extract: sum.extract.slice(0, 1200),
      url: sum.content_urls?.desktop?.page
        || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
    };
  } catch {
    return null;
  }
};
