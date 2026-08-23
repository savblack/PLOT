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

// Plain TMDB still, no PLOT branding — backdrop preferred, poster as a fallback.
const stillUrl = (title) => {
  if (!title?.backdrop_path && !title?.poster_path) return null;
  if (title.backdrop_path) return `${IMG_BASE}/${BACKDROP}${title.backdrop_path}`;
  return `${IMG_BASE}/${POSTER_HERO}${title.poster_path}`;
};

// Plain TMDB still for the What's On feed/article hero — no PLOT branding.
// Trending charts return null so they keep their branded chart render; every
// other post type leads with the title's backdrop (or poster as a fallback).
// The branded card renders are still produced for the social channels.
export const feedHeroUrl = (postType, payload) => {
  if (postType === 'trending') return null;
  return stillUrl(payload?.title || payload?.titles?.[0]);
};

// Same still-image preference, for a guide's hero: its first tmdb_ref — the
// anchor title for a "similar" guide, the top pick for a "best of" one.
export const guideHeroUrl = (tmdbRefs) => stillUrl(tmdbRefs?.[0]);
