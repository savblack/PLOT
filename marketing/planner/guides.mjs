// Plans web-only long-form SEO "guide" posts (post_type 'guide') and inserts
// them as marketing_posts rows (status 'planned') for the copy worker to write.
//
// Two archetypes, ~4 per run:
//   • best_of  — "Best {genre} on {platform}" (TMDB discover, US flatrate)
//   • similar  — "If you liked {trending title}, watch these" (TMDB similar)
//
// Titles resolve LIVE from TMDB (never hardcoded ids). topic_key is stable (no
// date) so each evergreen topic is created once; the UNIQUE constraint makes the
// insert a no-op on repeat. Hooked into automation.runWeekly + `npm run mkt:guides`.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../lib/supabase.mjs';
import { tmdb, fetchTMDB } from '../lib/tmdb.mjs';

const REGION = 'US';
const BEST_OF_TARGET = Number(process.env.MARKETING_GUIDES_BESTOF || 2);
const ANCHORED_TARGET = Number(process.env.MARKETING_GUIDES_ANCHORED || 2);

const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Curated best-of combos (rotated by skipping any whose topic already exists).
// genre/platform are matched by NAME against TMDB's live genre + provider lists.
// Platform names must match TMDB's exact US provider names (verified):
// Netflix, HBO Max, Amazon Prime Video, Hulu, Disney Plus, Peacock Premium.
const BEST_OF_COMBOS = [
  { genre: 'Science Fiction', platform: 'HBO Max', media_type: 'movie' },
  { genre: 'Thriller', platform: 'Netflix', media_type: 'movie' },
  { genre: 'Comedy', platform: 'Amazon Prime Video', media_type: 'movie' },
  { genre: 'Horror', platform: 'HBO Max', media_type: 'movie' },
  { genre: 'Drama', platform: 'Hulu', media_type: 'movie' },
  { genre: 'Animation', platform: 'Disney Plus', media_type: 'movie' },
  { genre: 'Action', platform: 'Netflix', media_type: 'movie' },
  { genre: 'Sci-Fi & Fantasy', platform: 'HBO Max', media_type: 'tv' },
  { genre: 'Crime', platform: 'Netflix', media_type: 'tv' },
  { genre: 'Comedy', platform: 'Hulu', media_type: 'tv' },
];

const ref = (m) => ({ media_type: m.media_type, tmdb_id: m.id, title: m.title || m.name, poster_path: m.poster_path || null });

// name -> id maps, fetched once per run.
const cache = { genre: {}, provider: {} };
const genreMap = async (mediaType) => {
  if (cache.genre[mediaType]) return cache.genre[mediaType];
  const d = await fetchTMDB(`/genre/${mediaType}/list`);
  const map = new Map((d?.genres || []).map(g => [g.name.toLowerCase(), g.id]));
  cache.genre[mediaType] = map;
  return map;
};
const providerMap = async (mediaType) => {
  if (cache.provider[mediaType]) return cache.provider[mediaType];
  const d = await fetchTMDB(`/watch/providers/${mediaType}`, { watch_region: REGION });
  const map = (d?.results || []).map(p => ({ id: p.provider_id, name: p.provider_name }));
  cache.provider[mediaType] = map;
  return map;
};
// Exact name match only — fuzzy matching grabs the wrong provider ("HBO Max
// Amazon Channel" for "Max", the rent/buy "Apple TV" store for "Apple TV+").
// A combo whose platform name doesn't resolve exactly is simply skipped.
const resolveProvider = (list, name) =>
  list.find(p => p.name.toLowerCase() === name.toLowerCase())?.id || null;

const buildBestOf = async (combo) => {
  const genres = await genreMap(combo.media_type);
  const providers = await providerMap(combo.media_type);
  const genreId = genres.get(combo.genre.toLowerCase());
  const providerId = resolveProvider(providers, combo.platform);
  if (!genreId || !providerId) return null;

  const dateField = combo.media_type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte';
  const results = await tmdb.discover(combo.media_type, {
    with_genres: String(genreId),
    with_watch_providers: String(providerId),
    watch_region: REGION,
    with_watch_monetization_types: 'flatrate',
    sort_by: 'popularity.desc',
    'vote_count.gte': 80,
    [dateField]: new Date().toISOString().slice(0, 10),
  });
  const picks = (results || []).filter(m => m.poster_path).slice(0, 12);
  if (picks.length < 5) return null; // too thin to make a good list

  return {
    post_type: 'guide',
    topic_key: `guide:best:${slug(combo.genre)}:${slug(combo.platform)}:${combo.media_type}`,
    payload: { archetype: 'best_of', genre: combo.genre, platform: combo.platform, media_type: combo.media_type },
    tmdb_refs: picks.map(ref),
  };
};

const buildAnchored = async (anchor) => {
  const enriched = await tmdb.getEnrichment(anchor.media_type, anchor.id).catch(() => null);
  const sims = (enriched?.similar?.results || []).filter(m => m.poster_path).slice(0, 8);
  if (sims.length < 4) return null;
  return {
    post_type: 'guide',
    topic_key: `guide:like:${anchor.media_type}:${anchor.id}`,
    payload: {
      archetype: 'similar',
      anchor: { media_type: anchor.media_type, tmdb_id: anchor.id, title: anchor.title || anchor.name },
    },
    // Anchor first, then the recommendations.
    tmdb_refs: [ref(anchor), ...sims.map(ref)],
  };
};

const insertGuide = async (supabase, candidate, publishAt) => {
  const { error } = await supabase.from('marketing_posts').insert({
    post_type: candidate.post_type,
    topic_key: candidate.topic_key,
    status: 'planned',
    scheduled_for: publishAt.toISOString(),
    tmdb_refs: candidate.tmdb_refs,
    payload: candidate.payload,
  });
  if (error) {
    // Unique topic_key violation = already planned/published this evergreen topic.
    if (/duplicate key|unique/i.test(error.message)) return false;
    console.warn(`Guide insert failed (${candidate.topic_key}): ${error.message}`);
    return false;
  }
  return true;
};

export const planGuides = async (supabase = getSupabase()) => {
  let planned = 0;
  // Spread guides over the coming days (within pull.mjs's 8-day window).
  const at = (dayOffset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + dayOffset); d.setUTCHours(15, 0, 0, 0); return d; };

  // ── Best-of listicles ──
  let made = 0;
  for (const combo of BEST_OF_COMBOS) {
    if (made >= BEST_OF_TARGET) break;
    const candidate = await buildBestOf(combo).catch(() => null);
    if (!candidate) continue;
    if (await insertGuide(supabase, candidate, at(made + 1))) {
      planned++; made++;
      console.log(`Planned guide ${candidate.topic_key} (${candidate.tmdb_refs.length} titles)`);
    }
  }

  // ── Title-anchored ("shows like X") ──
  const trending = (await tmdb.getTrending('all', 'week').catch(() => []))
    .filter(m => m.poster_path && (m.media_type === 'movie' || m.media_type === 'tv'));
  let anchored = 0;
  for (const anchor of trending) {
    if (anchored >= ANCHORED_TARGET) break;
    const candidate = await buildAnchored(anchor).catch(() => null);
    if (!candidate) continue;
    if (await insertGuide(supabase, candidate, at(BEST_OF_TARGET + anchored + 1))) {
      planned++; anchored++;
      console.log(`Planned guide ${candidate.topic_key} (${candidate.tmdb_refs.length} titles)`);
    }
  }

  console.log(`Planned ${planned} guide(s).`);
  return planned;
};

const runDirectly = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (runDirectly) planGuides().catch((err) => { console.error(err); process.exit(1); });
