import { getConfig } from './config.js';

/**
 * Outbound "where to watch" links for provider chips.
 *
 * Strategy: stable provider *search* URLs (per-title deep links are not in
 * the TMDB payload and guessing them breaks), matched on the provider NAME —
 * TMDB provider ids are opaque and per-region variants abound, names are the
 * stable surface. Affiliate parameters are attached only where a program
 * exists and its tag is configured (see `affiliate` in core config); with no
 * tag the link degrades to a plain search URL, so this ships before any
 * affiliate approval. Unknown providers fall back to the title's JustWatch
 * page (TMDB includes it per title/region), which also satisfies JustWatch's
 * attribution expectations.
 *
 * Pure module — no DOM, no analytics; callers fire their own click events.
 *
 * @typedef {Object} WatchLink
 * @property {string} url
 * @property {'affiliate'|'search'|'justwatch'} kind
 */

const q = (s) => encodeURIComponent(String(s ?? '').trim());

const AMAZON_TLDS = {
  AU: 'com.au', US: 'com', GB: 'co.uk', CA: 'ca', DE: 'de', FR: 'fr',
  IT: 'it', ES: 'es', JP: 'co.jp', IN: 'in', BR: 'com.br', MX: 'com.mx',
  NL: 'nl', SE: 'se', SG: 'sg',
};

function amazonLink({ title, region }) {
  const tld = AMAZON_TLDS[region] || 'com';
  const tag = getConfig().affiliate?.amazonTags?.[region];
  const base = `https://www.amazon.${tld}/s?k=${q(title)}&i=instant-video`;
  return tag
    ? { url: `${base}&tag=${encodeURIComponent(tag)}`, kind: 'affiliate' }
    : { url: base, kind: 'search' };
}

function appleLink({ title }) {
  const token = getConfig().affiliate?.appleToken;
  const base = `https://tv.apple.com/search?term=${q(title)}`;
  return token
    ? { url: `${base}&at=${encodeURIComponent(token)}`, kind: 'affiliate' }
    : { url: base, kind: 'search' };
}

const search = (url) => ({ url, kind: 'search' });

// Ordered: first name match wins. Patterns run against the lowercased
// provider_name from TMDB (e.g. "Amazon Prime Video", "Disney Plus",
// "Apple TV+", "BINGE", "Google Play Movies").
const PROVIDERS = [
  { match: /^netflix/,        build: ({ title }) => search(`https://www.netflix.com/search?q=${q(title)}`) },
  { match: /^amazon/,         build: amazonLink },
  { match: /^apple tv/,       build: appleLink },
  { match: /^disney/,         build: ({ title }) => search(`https://www.disneyplus.com/search?q=${q(title)}`) },
  { match: /^(hbo )?max$/,    build: ({ title }) => search(`https://play.max.com/search?q=${q(title)}`) },
  { match: /^stan$/,          build: ({ title }) => search(`https://www.stan.com.au/search?q=${q(title)}`) },
  { match: /^binge$/,         build: ({ title }) => search(`https://binge.com.au/search?q=${q(title)}`) },
  { match: /^hulu/,           build: ({ title }) => search(`https://www.hulu.com/search?q=${q(title)}`) },
  { match: /^youtube/,        build: ({ title }) => search(`https://www.youtube.com/results?search_query=${q(title)}`) },
  { match: /^google play/,    build: ({ title }) => search(`https://play.google.com/store/search?q=${q(title)}&c=movies`) },
];

/**
 * @param {{providerName: string, title: string, region?: string, justwatchLink?: string|null}} args
 * @returns {WatchLink|null} null renders as today's inert chip
 */
export function buildWatchLink({ providerName, title, region, justwatchLink }) {
  const name = String(providerName ?? '').trim().toLowerCase();
  if (name && title) {
    const entry = PROVIDERS.find(p => p.match.test(name));
    if (entry) return entry.build({ title, region });
  }
  if (justwatchLink) return { url: justwatchLink, kind: 'justwatch' };
  return null;
}
