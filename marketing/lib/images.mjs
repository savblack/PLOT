// Downloads TMDB images and inlines them as base64 data URIs so rendered
// media never hotlinks TMDB's CDN (per their API terms) and renders are
// immune to network flake mid-screenshot.
const IMG_BASE = 'https://image.tmdb.org/t/p';

export const POSTER_GRID = 'w500';   // grids of several posters
export const POSTER_HERO = 'w780';   // single-poster hero cards
export const BACKDROP = 'w1280';     // full-bleed backdrop cards

export const fetchImageDataUri = async (tmdbPath, size = POSTER_HERO) => {
  if (!tmdbPath) return null;
  const url = `${IMG_BASE}/${size}${tmdbPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Image fetch failed (${res.status}): ${url}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${buf.toString('base64')}`;
};

// Plain TMDB still for the What's On feed/article hero — no PLOT branding.
// Trending charts return null so they keep their branded chart render; every
// other post type leads with the title's backdrop (or poster as a fallback).
// The branded card renders are still produced for the social channels.
export const feedHeroUrl = (postType, payload) => {
  if (postType === 'trending') return null;
  const title = payload?.title || payload?.titles?.[0];
  if (!title) return null;
  if (title.backdrop_path) return `${IMG_BASE}/${BACKDROP}${title.backdrop_path}`;
  if (title.poster_path) return `${IMG_BASE}/${POSTER_HERO}${title.poster_path}`;
  return null;
};

// Resolve poster/backdrop data URIs for a list of TMDB items, in parallel.
export const hydrateImages = async (items, { posterSize = POSTER_HERO, backdrops = false } = {}) =>
  Promise.all(items.map(async (item) => ({
    ...item,
    poster_data_uri: await fetchImageDataUri(item.poster_path, posterSize),
    backdrop_data_uri: backdrops ? await fetchImageDataUri(item.backdrop_path, BACKDROP) : null,
  })));
