// Resolves the one URL a weekly-batch social caption may carry: the title's
// official YouTube trailer. It comes from real data only (the payload's
// trailer_url, set by the trailer-drop trigger from TMDB, or TMDB's official
// YouTube trailers for the post's single title). Nothing is guessed: when no
// official trailer is known this returns null, and the brief tells the writer
// not to mention a trailer at all.
import { officialTrailerUrl } from '../../supabase/functions/_shared/copySchema.js';

const subjectOf = (post) => {
  if (post?.payload?.title) return post.payload.title;
  const refs = Array.isArray(post?.tmdb_refs) ? post.tmdb_refs : [];
  // A post about several titles (a chart, the week) has no single trailer, so
  // a caption there could link the wrong one. It gets none.
  return refs.length === 1 ? refs[0] : null;
};

/**
 * @param {object} post a marketing_posts row (payload, tmdb_refs)
 * @param {(mediaType: string, id: number) => Promise<Array<{key: string}>>} getTrailers
 *   official YouTube trailers, newest first (tmdb.getTrailers)
 * @returns {Promise<string|null>} https://www.youtube.com/watch?v=KEY, or null
 */
export const resolveTrailerUrl = async (post, getTrailers) => {
  if (post?.payload?.trailer_url) return officialTrailerUrl(post.payload.trailer_url);
  const subject = subjectOf(post);
  const id = subject?.tmdb_id ?? subject?.id;
  const mediaType = subject?.media_type;
  if (!id || !['movie', 'tv'].includes(mediaType) || !getTrailers) return null;
  const trailers = await Promise.resolve()
    .then(() => getTrailers(mediaType, id))
    .catch(() => []);
  const key = (trailers || []).find((v) => /^[A-Za-z0-9_-]{11}$/.test(v?.key || ''))?.key;
  return key ? officialTrailerUrl(`https://www.youtube.com/watch?v=${key}`) : null;
};
