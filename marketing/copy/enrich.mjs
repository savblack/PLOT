// Builds the research pack for a post: the free, structured backbone the copy
// worker writes the blog post from. Combines extended TMDB data with a
// Wikipedia background extract for the post's primary title(s), plus a short
// list of starting-point source URLs the worker can browse further.
//
// All sources here are $0: TMDB and Wikipedia/Wikidata are free. Live web
// research (reception, recent news) is left to the worker's own browsing.
import { tmdb } from '../lib/tmdb.mjs';
import { getWikipediaSummary } from '../lib/wikipedia.mjs';
import { getRatings } from '../lib/omdb.mjs';

const yearOf = (s) => (typeof s === 'string' && /^\d{4}/.test(s) ? s.slice(0, 4) : null);

/**
 * @param {object} post  marketing_posts row (uses tmdb_refs + payload)
 * @param {{maxTitles?: number}} opts  how many of the post's titles to enrich
 * @returns {Promise<Array>} one research entry per enriched title (possibly empty)
 */
export const enrichPost = async (post, { maxTitles = 2 } = {}) => {
  const refs = (Array.isArray(post.tmdb_refs) ? post.tmdb_refs : [])
    .filter(r => r?.id && r?.media_type)
    .slice(0, maxTitles);

  const out = [];
  for (const ref of refs) {
    const tm = await tmdb.getEnrichment(ref.media_type, ref.id).catch(() => null);
    const [wiki, ratings] = await Promise.all([
      getWikipediaSummary({
        wikidataId: tm?.wikidata_id,
        title: ref.title,
        year: yearOf(tm?.release_date),
      }).catch(() => null),
      getRatings(tm?.imdb_id).catch(() => null),
    ]);

    const sources = [];
    if (wiki?.url) sources.push({ title: `Wikipedia — ${ref.title}`, url: wiki.url });
    if (tm?.imdb_id) sources.push({ title: `IMDb — ${ref.title}`, url: `https://www.imdb.com/title/${tm.imdb_id}/` });
    sources.push({ title: `TMDB — ${ref.title}`, url: `https://www.themoviedb.org/${ref.media_type}/${ref.id}` });

    out.push({ title: ref.title, media_type: ref.media_type, tmdb: tm, wikipedia: wiki, ratings, sources });
  }
  return out;
};
