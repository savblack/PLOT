/**
 * marketing-feed — "What's On", Plot's update feed at theplot.tv/whats-on.
 *
 * Every marketing post is originally published here; social posts link back.
 * Served via a Vercel rewrite from the static site:
 *   /whats-on            -> GET  <fn>/           index (featured + daily wire)
 *   /whats-on?type=x     -> GET  <fn>/?type=x    filtered by post type
 *   /whats-on?page=2     -> GET  <fn>/?page=2    older entries
 *   /whats-on/<slug>     -> GET  <fn>/<slug>     entry page (with OG tags)
 *
 * Entries become visible at their scheduled publish time (same moment the
 * social publisher runs); vetoed/failed posts never appear.
 *
 * Public function: must be reachable without a Supabase JWT. This is pinned in
 * supabase/config.toml (verify_jwt = false), so a plain `supabase functions
 * deploy marketing-feed` keeps it public — no need to remember --no-verify-jwt.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

// Db is the *default* instantiation
// (SupabaseClient<unknown, …, never, never>), so every row came back
// `never` and the real client was not even assignable to it. Bind it to
// the schema instead.
type Db = SupabaseClient<Database>;
// Shared site footer markup and styles — generated from website/_partials/footer.html
// and footer.css. Run `npm run footer` to regenerate after editing either partial.
import { FOOTER_CSS, FOOTER_HTML } from './footer.generated.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { youtubeKey, youtubeTrailerKey } from '../_shared/youtube.ts';
import { ARTICLE_TABLE_CSS, articleExcerpt, isArticleTable, renderArticleBlock } from '../_shared/articleBody.js';
import { selectTmdbMatch } from '../_shared/tmdbMatch.js';
import { articleSignupPromptHtml } from '../_shared/articleSignupPrompt.js';
import { clampDescription, fitTitle } from '../_shared/seoText.ts';

const SITE = 'https://theplot.tv';
const APP = 'https://app.theplot.tv';
const FEED_TITLE = "What's On";
const FEED_SEO_TITLE = "What's On: Film & TV Releases, Streaming & Trends – Plot";
const FEED_PATH = '/whats-on';
const PAGE_SIZE = 30;
const SEARCH_LIMIT = 60;
const SEARCH_TERMS = 5;

// Words from a search box, safe to put inside a PostgREST or() filter: the
// characters that delimit or wildcard a filter value become word breaks.
const searchWords = (q: string) =>
  q.replace(/[,()%_*\\"':;&|<>=]/g, ' ').split(/\s+/).filter((w) => w.length > 0).slice(0, SEARCH_TERMS);

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Link a charted title to its public title page (theplot.tv/movie|tv/<slug>),
// matching the slug the title-page function canonicalises to.
const slugify = (s: string) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'title';
// Refs are written {id, title, media_type} by the planner but were read as
// `tmdb_id` here, so most of them resolved to undefined and silently dropped the
// title link and the save CTA. Read both shapes; don't migrate the rows.
const refId = (r: TmdbRef | null | undefined) => r?.tmdb_id ?? r?.id ?? null;

// Ranks a post's refs against its own copy. `mention` is the first paragraph that
// names the title, -1 when it is never named (planner order then stands). The
// planner's ref order is its guess at importance; the prose is the article's own
// answer, and the two disagree: on the Emmy guide refs[0] is The Pitt while the
// copy says "take Widow's Bay". Measured over every published guide, 19 of 19
// refs are named somewhere in the body, and this picks a different lead on
// exactly that one post.
const rankRefs = (body: string[], refs: TmdbRef[]) =>
  refs.map((ref, order) => ({
    ref,
    order,
    mention: body.findIndex((para) => {
      const t = String(ref.title || '').toLowerCase().trim();
      return t ? String(para || '').toLowerCase().includes(t) : false;
    }),
  }));

// Articles written before titles were attached carry no tmdb_refs, so there is
// nothing to hang a save button on. Where the copy states a title the way these
// guides do ("Disclosure Day (Friday, October 9). ..."), read it from the prose
// and resolve it on TMDB. Deliberately narrow: only a paragraph that opens with
// a name followed by a date or year in brackets is a candidate, and a candidate
// is kept only when TMDB has exactly one title of that name (the article's year
// breaks a tie), so "A horror library refresh (Thursday, October 1)" resolves
// to nothing rather than to a wrong film. A TMDB failure just yields no titles.
const LEADING_TITLE = /^([^()\n]{2,70}?)\s+\((?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day|January|February|March|April|May|June|July|August|September|October|November|December|\d{4})\b[^)]*\)/;
const resolveMentionedTitles = async (body: string[], year: number | null): Promise<TmdbRef[]> => {
  const key = Deno.env.get('TMDB_API_KEY');
  if (!key) return [];
  const names = [...new Set(body
    .map((text) => LEADING_TITLE.exec(String(text || '').trim())?.[1]?.trim())
    .filter((name): name is string => Boolean(name)))].slice(0, 8);
  const found = await Promise.all(names.map(async (name): Promise<TmdbRef | null> => {
    try {
      const r = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${key}&language=en-US&include_adult=false&query=${encodeURIComponent(name)}`,
        { signal: AbortSignal.timeout(2500) },
      );
      if (!r.ok) return null;
      const { results } = await r.json();
      const hit = selectTmdbMatch(results, { title: name, year });
      return hit
        ? { media_type: hit.media_type, id: hit.id, title: hit.title ?? hit.name ?? name, poster_path: hit.poster_path ?? null }
        : null;
    } catch {
      return null;
    }
  }));
  const seen = new Set<number>();
  return found.filter((t): t is TmdbRef => {
    const id = t ? refId(t) : null;
    if (!t || !id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

// Reads as prose in a sentence ("not streaming in the UK"). Mirrors the same
// map in supabase/functions/title-page, so the two surfaces word it alike.
const REGION_NAMES: Record<string, string> = {
  US: 'the US', GB: 'the UK', AU: 'Australia', CA: 'Canada', NZ: 'New Zealand',
  IE: 'Ireland', IN: 'India', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy',
  NL: 'the Netherlands', SE: 'Sweden', BR: 'Brazil', MX: 'Mexico', JP: 'Japan',
  KR: 'South Korea', SG: 'Singapore',
};
const regionName = (code: string) => REGION_NAMES[code] || code;

const titleHref = (mediaType: string, tmdbId: number | string, title: string) =>
  `${SITE}/${mediaType === 'tv' ? 'tv' : 'movie'}/${slugify(title)}-${tmdbId}`;

const mediaUrl = (path: string) =>
  `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/marketing/${path}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const fmtWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

const fmtMonthDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

// Posts planned before the planner switched to US order still carry labels
// like "Friday 18 December" in their payload. Reorder them on the way out so
// every page reads "Friday, December 18"; labels already in US order pass through.
const DAY_MONTH = new RegExp(
  '\\b(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? )?(\\d{1,2}) '
  + '(January|February|March|April|May|June|July|August|September|October|November|December)\\b', 'g');
const usDateLabel = (label: string | null | undefined) =>
  (label || '').replace(DAY_MONTH, (_m, day, n, month) => (day ? `${day}, ${month} ${n}` : `${month} ${n}`));

const utcDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);

// Visible = approved (cleared to publish on its day) or already published; never
// while still under review, vetoed, failed or skipped.
const VISIBLE_STATUSES = ['approved', 'published', 'partially_published'];

const TYPE_META: Record<string, { label: string; tone: string }> = {
  countdown: { label: 'Countdown', tone: '#B03A5E' },
  now_streaming: { label: 'Now streaming', tone: '#0F6E56' },
  trending: { label: 'Trending', tone: '#534AB7' },
  trailer: { label: 'Trailer drop', tone: '#8A5410' },
  upcoming: { label: 'Upcoming this week', tone: '#185FA5' },
  on_this_day: { label: 'On this day', tone: '#6b6b70' },
  watch_tonight: { label: 'What to watch tonight', tone: '#0F6E56' },
  hidden_gem: { label: 'Hidden gem', tone: '#534AB7' },
  question: { label: 'Let’s talk', tone: '#8A5410' },
  guide: { label: 'Guide', tone: '#185FA5' },
};

// Content-type filters for the feed. The chart is its own page, linked from the
// top nav (not a feed filter).
const FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'Latest' },
  { key: 'upcoming', label: 'This week' },
  { key: 'now_streaming', label: 'New at home' },
  { key: 'countdown', label: 'Coming soon' },
  { key: 'trailer', label: 'First look' },
];

type TmdbRef = { media_type: string; tmdb_id?: number; id?: number; title: string; poster_path?: string | null };
type WatchProvider = { provider_id: number; provider_name: string; logo_path?: string | null };
type FeedPost = {
  slug: string;
  copy: { page_title?: string; page_body?: string[]; hero_image?: string; inline_titles?: boolean } | null;
  media: { portrait_path?: string; landscape_path?: string }[] | null;
  post_type: string;
  scheduled_for: string;
  status: string;
  tmdb_refs?: TmdbRef[] | null;
  payload?: {
    // Countdown / now_streaming planner fields. `kind` is cinema | streaming |
    // rental | tv; `title.where` is the editorial platform name when TMDB's
    // JustWatch feed has not listed it yet (common on premiere day).
    home_kind?: string | null;
    kind?: string | null;
    trailer_url?: string | null;
    when_label?: string | null;
    title?: { title?: string | null; where?: string | null } | null;
    // The week ahead stores its dated set here. It predates this type and was
    // never declared; the rows read it so a title can carry its release date
    // without a TMDB lookup.
    titles?: { tmdb_id?: number; when_label?: string | null; release_kind?: string | null; poster_path?: string | null }[] | null;
  } | null;
};

const postTitle = (p: FeedPost) => p.copy?.page_title || TYPE_META[p.post_type]?.label || p.post_type;
// Feed/article hero. Most posts use the plain TMDB still (no Plot branding) set
// in copy.hero_image; the branded render (media[0]) is for social channels.
// Trending charts have no hero_image, so they keep their branded chart render.
const postImage = (p: FeedPost) => {
  const hero = p.copy?.hero_image;
  if (typeof hero === 'string' && /^https?:\/\//.test(hero)) return hero;
  return p.media?.[0]?.landscape_path ? mediaUrl(p.media[0].landscape_path) : null;
};
// Static branded 1200×630 fallback (Plot wordmark + tagline) for pages with no
// per-post image, so every shared Plot link previews on-brand.
const OG_FALLBACK = `${SITE}/og-image.png`;
// Link-preview image: prefer the branded per-post social render, then the plain
// hero still, then the static brand image. (The on-page hero keeps using
// postImage's plain still.)
//
// A single-title post used to fall back to a branded app.theplot.tv/api/og
// card. That path died with the move off Vercel — it returns the SPA shell as
// text/html — and its Cloudflare replacement cannot render on the free plan,
// so there is nothing left to point at: such a post now takes its hero still,
// or the static card. tmdb_refs carries only poster_path, and a 2:3 poster
// crops badly into a 1.91:1 slot.
const postShareImage = (p: FeedPost) => {
  if (p.media?.[0]?.landscape_path) return mediaUrl(p.media[0].landscape_path);
  const hero = p.copy?.hero_image;
  return typeof hero === 'string' && /^https?:\/\//.test(hero) ? hero : OG_FALLBACK;
};
const postBody = (p: FeedPost) => (Array.isArray(p.copy?.page_body) ? p.copy.page_body : []);
const entryUrl = (p: FeedPost) => `${SITE}${FEED_PATH}/${p.slug}`;

const providerLogo = (path: string | null | undefined) =>
  path ? `https://image.tmdb.org/t/p/w92${path}` : null;

const uniqueProviders = (providers: WatchProvider[]) => {
  const seen = new Set<number>();
  return providers.filter((provider) => provider && !seen.has(provider.provider_id) && seen.add(provider.provider_id));
};

// Article CTAs use a fresh, regional TMDB watch-provider lookup. This keeps the
// destination logos honest when a title moves between services, rather than
// freezing a provider name into the marketing-post record.
// "In this story" — the module that gives an article somewhere to go. An
// article about one film that never links that film, and offers no way to keep
// it, is a dead end; this sits under the lede rather than at the foot, because
// that is where a reader is still deciding whether they care.
//
// Three states, the same three the title page card has: providers, in theaters,
// and nothing. The last is the common one across the back catalogue, so it says
// so plainly and lets the watchlist be the way out.
const storyModule = async (post: FeedPost, region: string, ref = post.tmdb_refs?.[0]) => {
  const id = refId(ref);
  if (!id || !ref?.media_type) return '';

  const mediaType = ref.media_type === 'tv' ? 'tv' : 'movie';
  // `src` identifies the surface; `utm_content` names the exact article. The
  // app keeps both the first-touch value and the current article through signup.
  const saveUrl = `${APP}/save?media_type=${mediaType}&tmdb_id=${id}&src=whats_on_article&utm_content=${encodeURIComponent(post.slug)}`;
  const pageUrl = titleHref(ref.media_type, id, ref.title || postTitle(post));

  let detail: Record<string, unknown> | null = null;
  try {
    const key = Deno.env.get('TMDB_API_KEY');
    if (key) {
      const r = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${key}&language=en-US&append_to_response=watch/providers,credits`,
      );
      if (r.ok) detail = await r.json();
    }
  } catch {
    // A TMDB hiccup should never stop an editorial article from rendering.
  }

  const d = detail || {};
  const isMovie = mediaType === 'movie';
  const title = (isMovie ? d.title : d.name) as string || ref.title || postTitle(post);
  const date = (isMovie ? d.release_date : d.first_air_date) as string | undefined;
  const yr = date ? String(date).slice(0, 4) : '';
  const runtime = isMovie
    ? (d.runtime ? `${Math.floor((d.runtime as number) / 60)}h ${(d.runtime as number) % 60}m` : '')
    : ((d as any).number_of_seasons ? `${(d as any).number_of_seasons} season${(d as any).number_of_seasons === 1 ? '' : 's'}` : '');
  const byline = isMovie
    ? (((d as any).credits?.crew || []).find((c: any) => c.job === 'Director')?.name || '')
    : (((d as any).networks || [])[0]?.name || '');
  const facts = [yr, runtime, byline].filter(Boolean).join(' · ');

  const posterPath = (d.poster_path as string) || ref.poster_path || null;
  const poster = posterPath ? `https://image.tmdb.org/t/p/w185${posterPath}` : null;

  const avail = ((d as any)['watch/providers']?.results || {})[region] || {};
  const streaming = uniqueProviders([...(avail.flatrate || []), ...(avail.free || []), ...(avail.ads || [])]).slice(0, 4);
  const rentBuy = uniqueProviders([...(avail.rent || []), ...(avail.buy || [])]).slice(0, 4);

  // A streaming / rental / TV premiere must never fall through to the "In
  // cinemas" heuristic. That heuristic only means "released movie, JustWatch
  // still empty" — which is the normal state for a day-one Amazon exclusive.
  const kind = post.payload?.kind || null;
  const homeKind = post.payload?.home_kind || null;
  const editorialWhere = typeof post.payload?.title?.where === 'string'
    ? post.payload.title.where.trim()
    : '';
  const isHomeRelease = kind === 'streaming' || kind === 'rental' || kind === 'tv'
    || homeKind === 'streaming' || homeKind === 'rental'
    || post.post_type === 'now_streaming';

  let inCinemas = false;
  if (isMovie && d.status === 'Released' && date && !isHomeRelease) {
    const days = (Date.now() - new Date(date).getTime()) / 86400000;
    inCinemas = days >= 0 && days <= 90 && !streaming.length && !rentBuy.length;
  }

  const chips = (label: string, list: WatchProvider[]) =>
    `<span class="sm-row"><span class="sm-label">${esc(label)}</span>${list.map((pr) => {
      const logo = providerLogo(pr.logo_path);
      return logo
        ? `<img class="sm-logo" src="${esc(logo)}" alt="${esc(pr.provider_name)}" loading="lazy">`
        : `<span class="sm-plain">${esc(pr.provider_name)}</span>`;
    }).join('')}</span>`;

  const homeLabel = (kind === 'rental' || homeKind === 'rental') ? 'Rent or buy' : 'Stream';
  const today = new Date().toISOString().slice(0, 10);
  const notYetOut = Boolean(date && date > today);
  const when = usDateLabel(post.payload?.when_label);

  let status: string;
  if (streaming.length) status = chips('Stream', streaming);
  else if (rentBuy.length) status = chips('Rent or buy', rentBuy);
  else if (editorialWhere) {
    status = `<span class="sm-row"><span class="sm-label">${esc(homeLabel)}</span><span class="sm-plain">${esc(editorialWhere)}</span></span>`;
  } else if (isHomeRelease && notYetOut && when) {
    status = `<span class="sm-row"><span class="sm-chip">Streaming</span><span class="sm-note">Arrives ${esc(when)}.</span></span>`;
  } else if (isHomeRelease) {
    status = `<span class="sm-row"><span class="sm-chip">Streaming</span><span class="sm-note">Available to stream.</span></span>`;
  } else if (inCinemas) status = `<span class="sm-row"><span class="sm-chip">In theaters</span><span class="sm-note">Not yet on any streaming service.</span></span>`;
  else status = `<span class="sm-note">Not streaming in ${esc(regionName(region))} right now.</span>`;

  return `<aside class="storymod">
    ${poster ? `<a href="${esc(pageUrl)}" class="sm-art"><img src="${esc(poster)}" alt="${esc(title)} poster" loading="lazy"></a>` : ''}
    <div class="sm-copy">
      <span class="sm-eyebrow">In this story</span>
      <a class="sm-title" href="${esc(pageUrl)}">${esc(title)}</a>
      ${facts ? `<span class="sm-facts">${esc(facts)}</span>` : ''}
      ${status}
    </div>
    <a class="sm-save" data-cta="article_save" href="${esc(saveUrl)}">Save to your Plot</a>
  </aside>`;
};

// First Look articles carry the exact official YouTube trailer selected by the
// planner. Keep playback inside the article, but retain an ordinary YouTube
// link for browsers or privacy tools that block embeds. Only recognized
// YouTube URLs become embeds; anything else falls back to storyModule below.
const trailerModule = async (post: FeedPost, ref = post.tmdb_refs?.[0]) => {
  if (post.post_type !== 'trailer') return '';
  const id = refId(ref);
  if (!id || !ref?.media_type) return '';

  const mediaType = ref.media_type === 'tv' ? 'tv' : 'movie';
  let key = youtubeKey(post.payload?.trailer_url);
  // Published First Look rows from before trailer_url was added still deserve
  // the player. Resolve their current official trailer from TMDB using the
  // verified ref stored on the article; never invent or hardcode a video key.
  if (!key) {
    try {
      const apiKey = Deno.env.get('TMDB_API_KEY');
      if (apiKey) {
        const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/videos?api_key=${apiKey}&language=en-US`);
        if (response.ok) key = youtubeTrailerKey((await response.json())?.results);
      }
    } catch {
      // The normal story card below remains the safe fallback.
    }
  }
  if (!key) return '';

  const title = post.payload?.title?.title || ref.title || postTitle(post);
  const saveUrl = `${APP}/save?media_type=${mediaType}&tmdb_id=${id}&src=whats_on_article&utm_content=${encodeURIComponent(post.slug)}`;
  const youtubeUrl = `https://www.youtube.com/watch?v=${key}`;
  const release = post.payload?.when_label ? `In theaters ${usDateLabel(post.payload.when_label)}` : '';

  return `<aside class="trailermod" aria-label="${esc(title)} trailer">
    <div class="tm-video">
      <iframe src="https://www.youtube-nocookie.com/embed/${key}?rel=0" title="Watch the ${esc(title)} trailer" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
    </div>
    <div class="tm-foot">
      <div class="tm-copy">
        <span class="tm-eyebrow">First look</span>
        <span class="tm-title">Watch the trailer</span>
        <span class="tm-sub">${esc(title)}${release ? ` · ${esc(release)}` : ''}</span>
      </div>
      <div class="tm-actions">
        <a class="tm-youtube" href="${youtubeUrl}" target="_blank" rel="noopener noreferrer">Open on YouTube</a>
        <a class="tm-save" data-cta="article_save" href="${esc(saveUrl)}">Save to your Plot</a>
      </div>
    </div>
  </aside>`;
};

// A home arrival is either a subscription premiere ("Now streaming") or a
// cinema release reaching the digital stores ("Now at home"); the planner
// records which in payload.home_kind, so a reader never mistakes a $20 rental
// for streaming. Older posts without the field keep the type label.
const HOME_KIND_LABEL: Record<string, string> = { streaming: 'Now streaming', rental: 'Now at home' };

// Kicker chips: sage everywhere except the featured (lead) story, which is
// pink. The per-type tone colours in TYPE_META are not used for chips.
const kicker = (p: Pick<FeedPost, 'post_type' | 'payload'>, featured = false) => {
  const m = TYPE_META[p.post_type];
  if (!m) return '';
  const label = (p.post_type === 'now_streaming' && HOME_KIND_LABEL[p.payload?.home_kind ?? '']) || m.label;
  return `<span class="kick${featured ? ' featured' : ''}">${esc(label)}</span>`;
};

// Analytics (PostHog, gtag and GTM) and page behaviour for these pages live in
// static files on the marketing site, apps/website/js/whats-on-head.js and
// whats-on.js. The site's CSP allows no un-hashed inline script, and a page
// rendered here has no build step to hash against. Same PostHog project token
// as the app and marketing site, with cross_subdomain_cookie so a visit here
// joins the same landing → signup funnel. The ?v= is a cache bust: bump it
// when either file changes.
const WHATS_ON_JS_VERSION = '20261016';
const ANALYTICS_SCRIPT = `<script src="${SITE}/js/whats-on-head.js?v=${WHATS_ON_JS_VERSION}"></script>`;
const GTM_NOSCRIPT = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PC72PHBN" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

const SHORT_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
// A published article does not change once it is live, and its "More from"
// row is its older neighbours, not the newest posts, so it can be shared for a
// day like the title pages. Uncached article hits were most of the slow pages
// in the site audit.
const ARTICLE_CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800';

const page = (title: string, head: string, body: string, status = 200, nav = 'whats-on', cacheControl = SHORT_CACHE, after = '') =>
  new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="${SITE}/favicon.svg">
${ANALYTICS_SCRIPT}
${head}
<link rel="preload" href="${SITE}/fonts/Gabarito-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${SITE}/fonts/DMSans-Variable.woff2" as="font" type="font/woff2" crossorigin>
<style>
  /* Self-hosted from apps/website/fonts — this function is proxied under
     theplot.tv, so an absolute path resolves against that origin regardless
     of where the HTML itself is generated. */
  @font-face { font-family: 'Gabarito'; src: url('${SITE}/fonts/Gabarito-Variable.woff2') format('woff2'); font-weight: 400 900; font-style: normal; font-display: swap; }
  @font-face { font-family: 'DM Sans'; src: url('${SITE}/fonts/DMSans-Variable.woff2') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }
  :root {
    /* Marketing palette — mirrors apps/website/theme.css. Cream ground, soft
       charcoal ink, the pink is a FILL behind charcoal text only. */
    --ink: #292924; --paper: #f1e9dc; --bg: #f8f2ea; --fill: #ff88c8; --fill-hover: #ff9fd3;
    --accent: #E05578; --sage: #dbe1b0;
    --mut: #5f5a52; --faint: #8a847a; --hair: rgba(41,41,36,0.12);
    --display: 'Gabarito', 'DM Sans', system-ui, sans-serif;
    --ease: cubic-bezier(0.23, 1, 0.32, 1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--ink);
    font-family: 'DM Sans', system-ui, sans-serif; font-weight: 400;
    line-height: 1.6; position: relative;
  }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; opacity: 0.025; z-index: 10;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
  }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 36px 40px 110px; }
  .sc { font-size: 0.68rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; }
  .hl { font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
  .card { background: var(--paper); border-radius: 20px; }
  .chip { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 9999px; font-size: 0.66rem; font-weight: 500; letter-spacing: 0.02em; background: var(--sage); color: var(--ink); }
  .chip.pink { background: var(--fill); } .chip.sage { background: var(--sage); }
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .r1, .r2, .r3, .r4 { animation: rise 0.7s var(--ease) both; }
  .r2 { animation-delay: 0.08s; } .r3 { animation-delay: 0.16s; } .r4 { animation-delay: 0.24s; }
  @media (prefers-reduced-motion: reduce) { .r1, .r2, .r3, .r4 { animation: none; } }

  /* ── nav: identical to the home page (apps/website/nav.css) ── */
  nav.topnav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    padding: 0 2rem; height: 64px;
    display: flex; align-items: center; justify-content: space-between;
    background: transparent;
    transition: background 0.3s var(--ease), backdrop-filter 0.3s var(--ease);
  }
  nav.topnav.scrolled { background: rgba(248,242,234,0.86); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .nav-logo { text-decoration: none; display: flex; align-items: center; font-family: var(--display); font-size: 1.65rem; font-weight: 700; letter-spacing: -0.1em; color: var(--ink); line-height: 1; user-select: none; }
  .nav-links { display: flex; align-items: center; gap: 2rem; list-style: none; }
  .nav-links li { display: flex; }
  /* Small tracked capitals: the same values as apps/website/nav.css. */
  .nav-links a { display: inline-block; padding: 0.75rem 0.25rem; text-decoration: none; color: var(--mut); font-size: 0.69rem; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; transition: color 0.2s, background 0.2s; }
  .nav-links a:hover { color: var(--ink); }
  .nav-links a.current { color: var(--ink); }
  .nav-cta { background: var(--fill); padding: 0.6rem 1.1rem !important; border-radius: 9999px; line-height: 1; }
  .nav-links a.nav-cta { color: var(--ink); font-weight: 700; }
  .nav-cta:hover { background: var(--fill-hover); }
  .nav-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 14px 12px; margin-right: -12px; flex-direction: column; gap: 5px; }
  .nav-hamburger span { display: block; width: 22px; height: 2px; background: var(--ink); border-radius: 2px; transition: all 0.3s var(--ease); }
  .nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .nav-hamburger.open span:nth-child(2) { opacity: 0; }
  .nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  @media (max-width: 600px) {
    .nav-links { display: none; }
    .nav-links.open { display: flex; flex-direction: column; position: fixed; top: 64px; left: 0; right: 0; background: rgba(248,242,234,0.94); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); padding: 1.25rem 2rem; gap: 0.35rem; align-items: stretch; }
    .nav-links.open li { display: block; }
    .nav-links.open a { display: block; padding: 0.85rem 0; text-align: center; }
    .nav-links.open .nav-cta { margin-top: 0.5rem; padding: 0.85rem 0 !important; }
    .nav-hamburger { display: flex; }
    nav.topnav.nav-open { background: rgba(248,242,234,0.94); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); }
  }

  /* ── masthead ── */
  .head { padding: 104px 0 0; }
  .head-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; }
  .dateline { color: var(--mut); white-space: nowrap; padding-bottom: 0.6em; }
  h1.feed-title { font-family: var(--display); font-size: clamp(2.8rem, 6vw, 4rem); font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
  h1.feed-title em { font-style: normal; font-weight: 500; color: var(--mut); }

  .wsearch { display: flex; align-items: center; gap: 8px; margin: 22px 0 0; max-width: 520px; background: var(--paper); border-radius: 9999px; padding: 5px 5px 5px 18px; }
  .wsearch input[type=search] { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 0.95rem; color: var(--ink); padding: 8px 0; -webkit-appearance: none; appearance: none; }
  .wsearch input[type=search]::placeholder { color: var(--faint); }
  .wsearch button { border: 0; border-radius: 9999px; background: var(--fill); color: var(--ink); font: inherit; font-size: 0.85rem; font-weight: 600; padding: 9px 16px; cursor: pointer; transition: background 0.2s; }
  .wsearch button:hover { background: var(--fill-hover); }
  .wsearch:focus-within { box-shadow: 0 0 0 2px var(--ink); }
  .search-sum { margin: 28px 0 0; color: var(--mut); font-weight: 300; }
  .search-sum a { color: var(--ink); }
  nav.dex { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; border-bottom: 1px solid var(--hair); margin: 28px 0 0; }
  .dex-links { display: flex; gap: 28px; flex-wrap: wrap; }
  .dex a { color: var(--mut); text-decoration: none; padding-bottom: 12px; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
  .dex a:hover { color: var(--ink); }
  .dex a.active { color: var(--ink); border-bottom-color: var(--accent); }

  /* ── front page: feed column + sidebar ── */
  .feed-grid { display: grid; grid-template-columns: minmax(0, 8fr) minmax(0, 4fr); gap: 40px; align-items: start; margin-top: 28px; }
  .feed-main, .feed-side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

  /* lead story: still left, copy right, in one card */
  .feature { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 28px; align-items: center; padding: 24px; text-decoration: none; color: inherit; }
  .feature.text-led { grid-template-columns: minmax(0, 1fr); }
  .f-media img { width: 320px; height: 240px; object-fit: cover; display: block; border-radius: 14px; }
  .f-media .ph { width: 320px; height: 240px; background: var(--bg); display: flex; align-items: flex-end; padding: 22px; border-radius: 14px; }
  .f-media .ph span { font-family: var(--display); font-weight: 600; font-size: 1.4rem; color: var(--ink); line-height: 1.1; }
  .f-text { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .feature h2 { font-family: var(--display); font-size: clamp(1.6rem, 2.4vw, 1.9rem); font-weight: 700; line-height: 1.05; letter-spacing: -0.025em; }
  .feature:hover h2 { color: var(--mut); }
  .feature .dek { color: var(--mut); font-size: 0.95rem; line-height: 1.55; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .f-foot { display: flex; align-items: center; gap: 14px; margin-top: 4px; }
  .feature .f-date { color: var(--mut); }
  .feature .f-read { display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 9999px; background: var(--ink); color: var(--bg); font-size: 0.82rem; font-weight: 500; text-transform: none; letter-spacing: 0; transition: transform 0.2s var(--ease); }
  .feature:hover .f-read { transform: translateY(-1px); }

  /* story cards (the old rail) */
  .rail { display: contents; }
  .rail-row { display: flex; align-items: center; gap: 20px; padding: 20px 24px; text-decoration: none; color: inherit; background: var(--paper); border-radius: 20px; }
  .rail-thumb { width: 64px; height: 88px; object-fit: cover; border-radius: 10px; flex-shrink: 0; background: var(--bg); display: block; }
  .rail-body { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
  .rail-t { font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; font-size: 1.2rem; line-height: 1.2; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; transition: color 0.25s var(--ease); }
  .rail-row:hover .rail-t { color: var(--mut); }
  .rail-date { color: var(--mut); white-space: nowrap; }

  /* named sections live inside cards */
  .sec-card { padding: 24px 28px 28px; display: flex; flex-direction: column; gap: 18px; }
  .sec-card.tight { padding-bottom: 12px; }
  .sec-head { display: flex; align-items: center; gap: 10px; }
  .sec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fill); flex-shrink: 0; }
  .sec-label { font-family: var(--display); font-weight: 700; letter-spacing: -0.03em; font-size: 1.4rem; line-height: 1; white-space: nowrap; }
  .sec-rule { flex: 1; }
  .view-all { font-size: 0.68rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink); text-decoration: none; white-space: nowrap; }
  .view-all:hover { color: var(--mut); }
  .kick.featured { background: var(--fill); }
  .kick { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 9999px; background: var(--sage); font-size: 0.62rem; font-weight: 500; letter-spacing: 0.04em; text-transform: none; color: var(--ink); align-self: flex-start; }

  /* New at home: poster shelf */
  .shelf { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 18px; }
  .shelf-item { text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 10px; }
  .shelf-item img, .shelf-item .ph { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 14px; display: block; background: var(--bg); }
  .shelf-item .kick { margin: 0; }
  .shelf-t { font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; font-size: 0.95rem; line-height: 1.2; transition: color 0.25s var(--ease); }
  .shelf-item:hover .shelf-t { color: var(--mut); }

  /* Trending: ranked list, sidebar */
  .trend-list { list-style: none; display: flex; flex-direction: column; }
  .trend-row { display: grid; grid-template-columns: 24px 36px 1fr auto; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; }
  .trend-rank { font-family: var(--display); font-weight: 700; font-size: 1.35rem; line-height: 1; color: var(--ink); }
  .trend-rank.top { color: var(--accent); }
  .trend-poster { width: 36px; aspect-ratio: 2/3; object-fit: cover; border-radius: 6px; display: block; background: var(--bg); }
  .trend-t { font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; font-size: 1rem; line-height: 1.2; transition: color 0.25s var(--ease); min-width: 0; }
  .trend-row:hover .trend-t { color: var(--mut); }
  .ch-move { font-size: 0.64rem; font-weight: 500; letter-spacing: 0.02em; white-space: nowrap; }
  .mv-new { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 9999px; background: var(--sage); color: var(--ink); }
  .mv-up { color: #0F6E56; } .mv-down { color: #B03A5E; } .mv-same { color: var(--faint); }

  /* Coming soon: date block + thumb + title, sidebar */
  .datecards { display: flex; flex-direction: column; }
  .datecard { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; }
  .date-badge { width: 40px; text-align: center; flex-shrink: 0; font-size: 0.6rem; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mut); line-height: 1.2; }
  .date-badge .dd { display: block; font-family: var(--display); font-weight: 700; font-size: 1.35rem; line-height: 1; color: var(--ink); letter-spacing: -0.02em; }
  .dc-media img, .dc-media .ph { width: 36px; height: 54px; object-fit: cover; border-radius: 6px; display: block; background: var(--bg); }
  .dc-t { font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; font-size: 0.95rem; line-height: 1.2; transition: color 0.25s var(--ease); }
  .datecard:hover .dc-t { color: var(--mut); }

  /* First look: two wide trailer cards */
  .wide-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
  .wide-card { text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 10px; }
  .wc-media { position: relative; }
  .wc-media img, .wc-media .ph { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 14px; display: block; background: var(--bg); }
  .play-pill { position: absolute; bottom: 12px; left: 12px; background: var(--bg); color: var(--ink); padding: 5px 10px; border-radius: 9999px; font-size: 0.66rem; font-weight: 500; }
  .wc-t { font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; font-size: 1rem; line-height: 1.2; transition: color 0.25s var(--ease); }
  .wide-card:hover .wc-t { color: var(--mut); }

  /* More updates: dated list in a card */
  .tail-list { display: flex; flex-direction: column; }
  .tail-list a { display: flex; justify-content: space-between; gap: 20px; padding: 13px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; font-family: var(--display); font-weight: 500; letter-spacing: -0.01em; font-size: 1rem; line-height: 1.25; }
  .tail-list a:hover { color: var(--mut); }
  .tail-list .meta { color: var(--mut); font-family: 'DM Sans', system-ui, sans-serif; font-size: 0.68rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; padding-top: 3px; }

  /* ── editorial list (Oct 2026) ──
     The front page drops the cream-on-cream boxes: an image-led lead, stories
     as hairline-ruled rows, sections headed by an ink rule, and the type label
     as small kicker text instead of a pill. Scoped to .feed-grid so article
     and filtered-list pages are untouched. The About card keeps its ink panel. */
  .feed-grid { gap: 56px; }
  .feed-main { gap: 0; }
  .feed-side { gap: 36px; }
  .feed-grid .kick { background: none; padding: 0; border-radius: 0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #B83558; }
  .feed-grid .rail-row .kick, .feed-grid .shelf-item .kick { color: var(--mut); }
  .feed-grid .feature { display: block; padding: 0; background: none; border-radius: 0; margin-bottom: 8px; }
  .feed-grid .f-media img, .feed-grid .f-media .ph { width: 100%; height: auto; aspect-ratio: 16 / 8; border-radius: 14px; margin-bottom: 20px; }
  .feed-grid .f-text { gap: 8px; }
  .feed-grid .feature h2 { font-size: clamp(1.9rem, 3.2vw, 2.4rem); line-height: 1.08; letter-spacing: -0.035em; max-width: 22ch; }
  .feed-grid .feature .dek { max-width: 58ch; margin-bottom: 6px; }
  .feed-grid .rail-row { background: none; border-radius: 0; padding: 16px 0; border-bottom: 1px solid var(--hair); gap: 24px; }
  .feed-grid .feature + .rail-row { border-top: 1px solid var(--ink); margin-top: 28px; }
  .feed-grid .rail-thumb { width: 72px; height: 72px; border-radius: 10px; }
  .feed-grid .rail-t { font-size: 1.15rem; }
  .feed-grid .rail-date { text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.72rem; }
  .feed-grid .sec-card { background: none; border-radius: 0; padding: 0; gap: 14px; }
  .feed-main > .sec-card { margin: 36px 0 12px; }
  .feed-grid .sec-head { padding-bottom: 12px; border-bottom: 1px solid var(--ink); }
  .feed-grid .sec-dot { display: none; }
  .feed-grid .sec-label { font-size: 1.25rem; }
  .feed-grid .trend-row:first-child, .feed-grid .datecard:first-child, .feed-grid .tail-list a:first-child { border-top: none; }
  .feed-grid .trend-rank.top { color: #B83558; }
  @media (max-width: 900px) {
    .feed-grid { gap: 32px; }
    .feed-grid .feature { padding: 0; }
  }
  @media (max-width: 760px) {
    .feed-grid .rail-row { padding: 14px 0; gap: 14px; }
    .feed-grid .rail-thumb { width: 56px; height: 56px; }
    .feed-grid .rail-t { font-size: 1.05rem; }
    .feed-grid .sec-card { padding: 0; }
  }

  /* filtered / paged list (unchanged structure, new type) */
  .group { display: grid; grid-template-columns: 170px 1fr; gap: 36px; padding-top: 34px; border-top: 1px solid var(--hair); }
  .g-date { padding-top: 22px; }
  .g-day { display: block; color: var(--ink); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; }
  .g-day.today { color: var(--accent); }
  .g-num { display: block; color: var(--mut); font-size: 0.82rem; margin-top: 4px; }
  .row { display: flex; gap: 28px; align-items: flex-start; justify-content: space-between; padding: 22px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; }
  .group .g-list .row:first-child { border-top: none; padding-top: 22px; }
  .row-t { display: block; font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; font-size: 1.35rem; line-height: 1.15; margin-top: 8px; transition: color 0.25s var(--ease); }
  .row:hover .row-t { color: var(--mut); }
  .row-dek { display: block; color: var(--mut); font-size: 0.92rem; line-height: 1.45; margin-top: 8px; }
  .row img { width: 240px; aspect-ratio: 3/2; object-fit: cover; flex-shrink: 0; border-radius: 14px; }
  .row .ph { width: 240px; aspect-ratio: 3/2; flex-shrink: 0; background: var(--paper); border-radius: 14px; }
  .older-row { border-top: 1px solid var(--hair); padding: 26px 0 0; text-align: center; }
  .older { color: var(--mut); text-decoration: none; }
  .older:hover { color: var(--ink); }

  /* entry page */
  .crumbs { max-width: 680px; margin: 0 auto; padding-top: 40px; display: flex; align-items: center; gap: 8px; font-size: 0.78rem; color: var(--mut); }
  .crumbs a { color: var(--mut); text-decoration: none; }
  .crumbs a:hover { color: var(--ink); }
  .crumbs .sep2 { color: var(--faint); }
  .post { width: 100%; max-width: 680px; min-width: 0; margin: 0 auto; padding-top: 24px; }
  .post-head .a-meta { display: flex; gap: 14px; align-items: center; margin-bottom: 20px; }
  .post-head .a-meta .d { color: var(--mut); }
  .post-head .a-meta .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--faint); opacity: 0.6; }
  .post-head h1 { font-family: var(--display); font-size: clamp(2.2rem, 5vw, 3.2rem); font-weight: 700; line-height: 1.02; letter-spacing: -0.03em; }
  figure.hero { margin: 40px 0 44px; }
  figure.hero img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; border-radius: 20px; }
  /* No still: the title leads. There is no image frame to leave empty. */
  .post.text-led .post-head h1 { margin-bottom: 28px; }
  .post-body p { font-size: 1.06rem; color: #3a3630; margin-bottom: 24px; }
  .post-body p.lede { font-weight: 600; color: var(--ink); margin-bottom: 30px; }
${ARTICLE_TABLE_CSS}
  .endcta { display: flex; align-items: center; justify-content: space-between; gap: 32px; margin-top: 52px; padding: 28px 32px; background: var(--paper); border-radius: 20px; }
  .endcta .ec-title { display: block; font-family: var(--display); font-weight: 700; font-size: 1.6rem; line-height: 1.05; letter-spacing: -0.03em; }
  .endcta .ec-sub { display: block; color: var(--mut); font-size: 0.9rem; margin-top: 8px; }
  /* The tail of a guide: what the modules did not feature. Two columns on a
     desktop, one on a phone; the row is the same shape at two titles or twenty. */
  .gt { max-width: 680px; margin: 40px auto 0; padding-top: 26px; border-top: 1px solid var(--hair); }
  .gt-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .gt-head h2 { font-family: var(--display); font-weight: 700; font-size: 1.32rem; letter-spacing: -0.03em; }
  .gt-count { font-size: 0.74rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mut); }
  .gt-card { background: var(--paper); border-radius: 16px; padding: 6px 20px; margin-top: 14px; display: flex; gap: 26px; }
  .gt-col { flex: 1; min-width: 0; }
  .gt-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(41,41,36,0.1); }
  .gt-col .gt-row:last-child { border-bottom: none; }
  .gt-art { flex-shrink: 0; display: block; width: 40px; }
  .gt-art img, .gt-ph { width: 40px; height: 60px; object-fit: cover; border-radius: 6px; display: block; background: var(--bg); }
  .gt-text { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .gt-note { font-size: 0.76rem; color: var(--mut); }
  .gt-chip { flex-shrink: 0; background: var(--sage); color: var(--ink); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
  .gt-name { min-width: 0; font-family: var(--display); font-weight: 700; font-size: 0.94rem; letter-spacing: -0.015em; line-height: 1.2; text-decoration: none; color: var(--ink); }
  .gt-name:hover { color: var(--accent); }
  .gt-add { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; background: var(--fill); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; }
  .gt-add:hover { background: var(--fill-hover); }
  .gt-add svg { width: 13px; height: 13px; display: block; }
  /* A save line under the paragraph that first names a title. One per title,
     quiet enough to read as part of the prose rather than an ad break. */
  .post-body .save-line { display: flex; flex-wrap: wrap; gap: 8px; margin: -10px 0 22px; }
  .save-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; border-radius: 999px; background: var(--paper); border: 1px solid var(--hair); color: var(--ink); font-size: 0.82rem; font-weight: 600; text-decoration: none; transition: background 0.2s; }
  .save-chip:hover { background: var(--fill); }
  .save-chip svg { width: 20px; height: 20px; padding: 4px; border-radius: 50%; background: var(--fill); display: block; box-sizing: border-box; }
  @media (max-width: 640px) {
    .gt-card { flex-direction: column; gap: 0; padding: 6px 16px; }
    .gt-col:first-child .gt-row:last-child { border-bottom: 1px solid rgba(41,41,36,0.1); }
    .gt-col:last-child .gt-row:last-child { border-bottom: none; }
  }
  /* The story module. Sits inside .post-body, so the margins are its own. */
  .storymod { display: flex; align-items: center; gap: 18px; margin: 0 0 30px; padding: 20px 22px; border-radius: 16px; background: var(--paper); }
  .storymod .sm-art { flex-shrink: 0; display: block; }
  .storymod .sm-art img { width: 76px; height: 114px; object-fit: cover; border-radius: 8px; display: block; }
  .storymod .sm-copy { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .storymod .sm-eyebrow { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mut); }
  .storymod .sm-title { font-family: var(--display); font-weight: 700; font-size: 1.35rem; letter-spacing: -0.02em; line-height: 1.1; margin-top: 5px; text-decoration: none; color: var(--ink); }
  .storymod .sm-title:hover { color: var(--accent); }
  .storymod .sm-facts { font-size: 0.84rem; color: var(--mut); margin-top: 3px; }
  .storymod .sm-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-top: 10px; }
  .storymod .sm-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mut); }
  .storymod .sm-logo { width: 24px; height: 24px; object-fit: contain; border-radius: 5px; display: block; }
  .storymod .sm-plain { font-size: 0.8rem; }
  .storymod .sm-chip { background: var(--sage); color: var(--ink); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 5px 11px; border-radius: 999px; }
  .storymod .sm-note { font-size: 0.84rem; color: var(--ink); margin-top: 9px; }
  .storymod .sm-row .sm-note { margin-top: 0; }
  .storymod .sm-save { flex-shrink: 0; display: inline-flex; align-items: center; min-height: 44px; padding: 0.7rem 1.05rem; border-radius: 999px; background: var(--fill); color: var(--ink); text-decoration: none; font-size: 0.82rem; font-weight: 600; white-space: nowrap; transition: background 0.2s var(--ease); }
  .storymod .sm-save:hover { background: var(--fill-hover); }
  @media (max-width: 640px) {
    .storymod { flex-wrap: wrap; gap: 14px; padding: 16px; }
    .storymod .sm-save { margin-left: auto; }
  }
  /* First Look article player. The video remains the visual lead, while the
     footer carries the same editorial hierarchy and save action as storymod. */
  .trailermod { margin: 0 0 30px; overflow: hidden; border-radius: 16px; background: var(--paper); }
  .tm-video { position: relative; width: 100%; aspect-ratio: 16/9; background: var(--ink); }
  .tm-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .tm-foot { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 20px 20px; }
  .tm-copy { min-width: 0; display: flex; flex-direction: column; }
  .tm-eyebrow { color: var(--mut); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
  .tm-title { margin-top: 4px; font-family: var(--display); font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
  .tm-sub { margin-top: 4px; color: var(--mut); font-size: 0.82rem; }
  .tm-actions { flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
  .tm-youtube, .tm-save { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 0.65rem 0.95rem; border-radius: 999px; text-decoration: none; font-size: 0.8rem; font-weight: 600; white-space: nowrap; transition: background 0.2s var(--ease), color 0.2s var(--ease); }
  .tm-youtube { border: 1px solid var(--hair); color: var(--ink); background: transparent; }
  .tm-youtube:hover { background: var(--bg); }
  .tm-save { color: var(--ink); background: var(--fill); }
  .tm-save:hover { background: var(--fill-hover); }
  @media (max-width: 640px) {
    .tm-foot { align-items: flex-start; flex-direction: column; padding: 16px; }
    .tm-actions { flex-wrap: wrap; }
  }
  .article-cta { display:flex; align-items:center; justify-content:space-between; gap:28px; margin-top:52px; padding:28px 32px; border-radius:20px; background:var(--paper); }
  .article-cta-copy { min-width:0; }
  .article-cta-title { display:block; font-family:var(--display); font-weight:700; font-size:1.5rem; line-height:1.05; letter-spacing:-0.03em; }
  .article-watch { margin-top:13px; }
  .article-watch-label { display:block; color:var(--mut); font-size:0.65rem; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:8px; }
  .article-providers { display:flex; flex-wrap:wrap; gap:8px; }
  .article-provider { display:inline-flex; align-items:center; gap:6px; min-height:28px; padding:4px 8px 4px 5px; border-radius:999px; background:var(--bg); font-size:0.75rem; white-space:nowrap; }
  .article-provider img { width:21px; height:21px; object-fit:contain; border-radius:5px; display:block; }
  .article-watch-empty { color:var(--mut); font-size:0.82rem; }
  .article-save { display:inline-flex; align-items:center; gap:0.5rem; min-height:44px; padding:0.8rem 1.2rem; border-radius:999px; background:var(--fill); color:var(--ink); text-decoration:none; font-size:0.85rem; font-weight:500; white-space:nowrap; transition:transform 0.2s var(--ease), background 0.2s var(--ease); }
  .article-save:hover { background:var(--fill-hover); transform:translateY(-1px); }
  .cta { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.85rem 1.6rem; min-height: 44px; border-radius: 9999px; background: var(--fill); color: var(--ink); text-decoration: none; font-weight: 500; font-size: 0.9rem; white-space: nowrap; transition: all 0.25s var(--ease); }
  .cta:hover { background: var(--fill-hover); transform: translateY(-1px); }
  .track-prompt { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 8px 0 32px; padding: 20px 22px; border-radius: 16px; background: var(--paper); border: 1px solid var(--hair); }
  .track-prompt p, .post-body .track-prompt p { margin: 0; font-size: 1rem; font-weight: 500; line-height: 1.45; color: var(--ink); }
  .track-prompt .cta { flex-shrink: 0; }
  @media (max-width: 640px) {
    .track-prompt { flex-direction: column; align-items: flex-start; }
  }
  .back { display: inline-block; margin-top: 40px; color: var(--mut); text-decoration: none; }
  .back:hover { color: var(--ink); }
  .post-foot { max-width: 680px; margin: 0 auto; }
  .more { max-width: 680px; margin: 80px auto 0; border-top: 1px solid var(--hair); padding-top: 24px; }
  .more .more-head { display: block; color: var(--ink); margin-bottom: 26px; }
  .more-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
  .mcard { display: block; text-decoration: none; color: inherit; }
  .mcard img { width: 100%; aspect-ratio: 3/2; object-fit: cover; display: block; border-radius: 14px; }
  .mcard .ph { display: block; width: 100%; aspect-ratio: 3/2; background: var(--paper); border-radius: 14px; }
  .mcard .kick { margin: 13px 0 6px; }
  .mcard .mc-t { display: block; font-family: var(--display); font-weight: 600; letter-spacing: -0.02em; font-size: 1.1rem; line-height: 1.2; transition: color 0.25s var(--ease); }
  .mcard:hover .mc-t { color: var(--mut); }

  /* Shared site footer — generated from website/_partials/footer.css. */
${FOOTER_CSS}
  .site-footer { margin-top: 90px; }

  @media (max-width: 900px) {
    .feed-grid { grid-template-columns: minmax(0, 1fr); gap: 20px; }
    .feature { grid-template-columns: minmax(0, 1fr); gap: 18px; padding: 18px; }
    .f-media img, .f-media .ph { width: 100%; height: auto; aspect-ratio: 16/10; }
  }
  @media (max-width: 760px) {
    .wrap { padding: 28px 16px 80px; }
    .post { padding-top: 40px; }
    .more-grid { grid-template-columns: 1fr; gap: 22px; }
    .mcard { display: grid; grid-template-columns: 96px 1fr; gap: 16px; align-items: center; }
    .mcard.text-led { display: block; }
    .mcard .kick { margin: 0 0 5px; }
    .mcard .mc-t { font-size: 1.05rem; }
    .endcta, .article-cta { flex-direction: column; align-items: flex-start; gap: 20px; padding: 22px; }
    .rail-row { padding: 14px 16px; gap: 14px; }
    .rail-thumb { width: 52px; height: 72px; }
    .rail-t { font-size: 1.05rem; }
    .rail-date { display: none; }
    .sec-card { padding: 18px 20px 20px; }
    .shelf { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .wide-grid { grid-template-columns: 1fr; }
    .group { grid-template-columns: 1fr; gap: 0; }
    .g-date { padding-top: 26px; display: flex; gap: 10px; align-items: baseline; }
    .g-num { margin-top: 0; }
    .row { gap: 18px; }
    .row img, .row .ph { width: 150px; }
    .row-t { font-size: 1.15rem; }
    .row-dek { display: none; }
    .dex { overflow-x: auto; scrollbar-width: none; }
    .dex::-webkit-scrollbar { display: none; }
    .dex-links { flex-wrap: nowrap; }
  }
</style>
</head>
<body>
${GTM_NOSCRIPT}
<nav class="topnav" id="topnav">
  <a href="${SITE}" class="nav-logo" aria-label="plot"><svg style="display:inline-block;height:.871em;width:1.568em;vertical-align:-.19em;overflow:visible" viewBox="52 -681 1568 871" aria-hidden="true" focusable="false" fill="currentColor"><path d="M52 190V-489H161L176 -440Q233 -501 323 -501Q389 -501 440.0 -468.5Q491 -436 519.5 -378.0Q548 -320 548 -244Q548 -169 519.0 -111.0Q490 -53 439.0 -20.5Q388 12 322 12Q249 12 198 -25V190ZM295 -125Q341 -125 370.0 -158.5Q399 -192 399 -244Q399 -297 370.0 -330.5Q341 -364 295 -364Q251 -364 221.0 -330.5Q191 -297 191 -245Q191 -192 221.0 -158.5Q251 -125 295 -125ZM715.0 5Q678.0 5 647.0 -9.5Q616.0 -24 597.0 -56.0Q578.0 -88 578.0 -141V-681H723.0V-193Q723 -132 768 -134Q796 -137 801 -175L880 -80L910 -18Q850 7 715 5ZM1032.0 12Q955.0 12 897.0 -20.5Q839.0 -53 807.0 -111.0Q775.0 -169 775.0 -244Q775.0 -320 807.0 -378.0Q839.0 -436 897.0 -468.5Q955.0 -501 1032.0 -501Q1108.0 -501 1166.0 -468.5Q1224.0 -436 1256.5 -378.0Q1289.0 -320 1289.0 -244Q1289.0 -169 1256.5 -111.0Q1224.0 -53 1166.0 -20.5Q1108.0 12 1032.0 12ZM1032.0 -130Q1080.0 -130 1110.5 -161.5Q1141.0 -193 1141.0 -245Q1141.0 -296 1110.5 -328.0Q1080.0 -360 1032.0 -360Q983.0 -360 953.0 -328.5Q923.0 -297 923.0 -245Q923.0 -193 953.0 -161.5Q983.0 -130 1032.0 -130ZM1539.0 8Q1457.0 8 1411.0 -32.0Q1365.0 -72 1365.0 -163V-355H1289.0V-489H1363.0L1393.0 -607H1511.0V-489H1620.0V-355H1511.0V-195Q1511.0 -161 1527.0 -146.5Q1543.0 -132 1569.0 -132Q1584.0 -132 1597.5 -134.5Q1611.0 -137 1620.0 -140V-3Q1602.0 2 1583.0 5.0Q1564.0 8 1539.0 8Z"/></svg></a>
  <ul class="nav-links" id="navLinks">
    <li><a href="${FEED_PATH}"${nav === 'whats-on' ? ' class="current"' : ''}>What's On</a></li>
    <li><a href="${APP}/login?src=whats_on_nav" data-cta="nav">Log in</a></li>
    <li><a href="${APP}/signup?src=whats_on_nav" data-cta="nav" class="nav-cta">Sign up</a></li>
  </ul>
  <button class="nav-hamburger" id="hamburger" aria-label="Menu" aria-expanded="false" aria-controls="navLinks">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="wrap">
${body}
</div>
${after}
${FOOTER_HTML}
<script defer src="${SITE}/js/whats-on.js?v=${WHATS_ON_JS_VERSION}"></script>
</body>
</html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': cacheControl,
      },
    },
  );

const entryRow = (p: FeedPost) => {
  const img = postImage(p);
  const dek = articleExcerpt(postBody(p));
  return `<a class="row${img ? '' : ' text-led'}" href="${FEED_PATH}/${esc(p.slug)}">
    <span class="row-main">${kicker(p)}
    <span class="row-t">${esc(postTitle(p))}</span>
    ${dek ? `<span class="row-dek">${esc(dek)}</span>` : ''}</span>
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
  </a>`;
};

const moreCard = (p: FeedPost) => {
  const img = postImage(p);
  return `<a class="mcard${img ? '' : ' text-led'}" href="${FEED_PATH}/${esc(p.slug)}">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
    ${kicker(p)}
    <span class="mc-t">${esc(postTitle(p))}</span>
  </a>`;
};

const featuredHero = (p: FeedPost) => {
  const img = postImage(p);
  const dek = articleExcerpt(postBody(p));
  return `<a class="feature card r3${img ? '' : ' text-led'}" href="${FEED_PATH}/${esc(p.slug)}">
    ${img ? `<div class="f-media"><img src="${esc(img)}" alt=""></div>` : ''}
    <div class="f-text">
      ${kicker(p, true)}
      <h2>${esc(postTitle(p))}</h2>
      ${dek ? `<p class="dek">${esc(dek)}</p>` : ''}
      <div class="f-foot"><span class="f-read">Read the story &rarr;</span><span class="f-date sc">${esc(fmtDate(p.scheduled_for))}</span></div>
    </div>
  </a>`;
};

const dailyWire = (posts: FeedPost[]) => {
  const today = new Date().toISOString().slice(0, 10);
  const groups: { day: string; iso: string; rows: string[] }[] = [];
  for (const p of posts) {
    const day = utcDay(p.scheduled_for);
    if (!groups.length || groups[groups.length - 1].day !== day) {
      groups.push({ day, iso: p.scheduled_for, rows: [] });
    }
    groups[groups.length - 1].rows.push(entryRow(p));
  }
  return groups.map((g) => `
    <section class="group r4">
      <div class="g-date">
        <span class="g-day sc${g.day === today ? ' today' : ''}">${g.day === today ? 'Today' : esc(fmtWeekday(g.iso))}</span>
        <span class="g-num">${esc(fmtMonthDay(g.iso))}</span>
      </div>
      <div class="g-list">${g.rows.join('')}</div>
    </section>`).join('');
};

// ── Trending chart page (theplot.tv/whats-on/chart) ──────────────
// A persistent page that re-renders from the latest weekly snapshot
// (marketing_trending_snapshots, written each Monday by the snapshot job)
// instead of minting a dated article. Movement is computed on read against
// the prior week. Mirrors marketing/lib/trending.mjs (Deno can't import it).
type ChartItem = {
  rank: number; tmdb_id: number; media_type: string; title: string;
  poster_path?: string | null; backdrop_path?: string | null;
};
type Movement = { dir: 'none' | 'new' | 'same' | 'up' | 'down'; delta?: number };

const tmdbImg = (path: string, size = 'w185') => `https://image.tmdb.org/t/p/${size}${path}`;

const chartMovement = (item: ChartItem, rank: number, prior: ChartItem[] | null): Movement => {
  if (!prior) return { dir: 'none' };
  const prev = prior.find((p) => p.tmdb_id === item.tmdb_id && p.media_type === item.media_type);
  if (!prev) return { dir: 'new' };
  if (prev.rank === rank) return { dir: 'same' };
  return prev.rank > rank
    ? { dir: 'up', delta: prev.rank - rank }
    : { dir: 'down', delta: rank - prev.rank };
};

const moveChip = (m: Movement) => {
  if (m.dir === 'new') return `<span class="ch-move mv-new">New this week</span>`;
  if (m.dir === 'up') return `<span class="ch-move mv-up" title="Up ${m.delta} this week">&#9650; ${m.delta}</span>`;
  if (m.dir === 'down') return `<span class="ch-move mv-down" title="Down ${m.delta} this week">&#9660; ${m.delta}</span>`;
  if (m.dir === 'same') return `<span class="ch-move mv-same" title="Holding steady">Holding</span>`;
  return '';
};

const CHART_CSS = `
  .chart-intro { color: var(--mut); font-weight: 300; font-size: 1.05rem; max-width: 52ch; margin-top: 16px; }
  ol.chart { list-style: none; margin: 38px 0 0; }
  .ch-row { display: grid; grid-template-columns: 52px 60px 1fr auto; gap: 22px; align-items: center; padding: 18px 0; border-top: 1px solid var(--hair); }
  ol.chart li:first-child .ch-row { border-top: none; }
  .ch-rank { font-family: var(--display); font-weight: 700; font-size: 2rem; line-height: 1; color: var(--ink); text-align: center; letter-spacing: -0.03em; }
  .ch-rank.top { color: var(--accent); }
  .ch-poster { width: 60px; aspect-ratio: 2/3; object-fit: cover; border-radius: 8px; background: var(--paper); display: block; }
  .ch-title { font-family: var(--display); font-weight: 600; font-size: 1.4rem; line-height: 1.1; letter-spacing: -0.025em; }
  .ch-kind { display: block; color: var(--faint); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 5px; }
  .ch-actions { display: flex; align-items: center; justify-content: flex-end; gap: 16px; }
  .ch-save {
    display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.5rem 1.05rem; min-height: 38px;
    border: 0; border-radius: 9999px; background: var(--paper); color: var(--ink);
    text-decoration: none; font-size: 0.78rem; font-weight: 500; white-space: nowrap;
    transition: background 0.2s var(--ease), transform 0.2s var(--ease);
  }
  .ch-save:hover { background: var(--fill); transform: translateY(-1px); }
  @media (max-width: 600px) {
    .ch-row { grid-template-columns: 34px 48px 1fr; gap: 14px 14px; }
    .ch-rank { font-size: 1.6rem; }
    .ch-title { font-size: 1.2rem; }
    .ch-actions { grid-column: 2 / -1; justify-content: flex-start; margin-top: 2px; }
  }
`;

// Shared by renderChart and the homepage's Trending section — both read the
// same latest weekly snapshot; movement is computed against the prior week.
const fetchTrendingSnapshots = async (supabase: Db) => {
  const { data: snaps } = await supabase
    .from('marketing_trending_snapshots')
    .select('snapshot_date, items')
    .order('snapshot_date', { ascending: false })
    .limit(2);
  return {
    latest: snaps?.[0] || null,
    prior: (snaps?.[1]?.items as ChartItem[] | undefined) || null,
  };
};

const CHART_TITLE = 'The chart: the top 20 films and shows this week · Plot';

const renderChart = async (supabase: Db) => {
  const { latest, prior } = await fetchTrendingSnapshots(supabase);
  const pageUrl = `${SITE}${FEED_PATH}/chart`;

  const head = `<style>${CHART_CSS}</style>
<meta name="description" content="The twenty film and TV titles the world is watching this week, ranked by Plot, with how far each one rose or fell since last week and what is new.">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:title" content="${CHART_TITLE}">
<meta property="og:description" content="The twenty titles the world is watching this week, ranked.">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${OG_FALLBACK}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_FALLBACK}">`;

  const cta = `<aside class="endcta" style="border-top:none;padding-top:0">
      <div class="ec-copy">
        <span class="ec-title">Watch more. Forget less.</span>
        <span class="ec-sub">Track what's trending and get reminded the day it drops.</span>
      </div>
      <a class="cta" href="https://app.theplot.tv/signup?src=whats_on_chart" data-cta="chart_signup">Sign up &rarr;</a>
    </aside>`;

  if (!latest) {
    return page(CHART_TITLE, head, `
      <div class="head r2"><div class="head-row">
        <h1 class="feed-title">The <em>chart</em></h1>
      </div></div>
      <p class="chart-intro r2">The first chart lands soon.</p>
      ${cta}
    `, 200, 'chart');
  }

  const items = (latest.items as ChartItem[]) || [];
  const rows = items.map((it) => {
    const m = chartMovement(it, it.rank, prior);
    // Link the poster + title through to the public title page (internal links
    // that feed crawl + give readers the full "where to watch" page).
    const tUrl = titleHref(it.media_type, it.tmdb_id, it.title);
    const img = it.poster_path
      ? `<a href="${esc(tUrl)}" style="display:contents"><img class="ch-poster" src="${esc(tmdbImg(it.poster_path))}" alt="${esc(it.title)}" loading="lazy"></a>`
      : '<span class="ch-poster"></span>';
    // One-click "Save to watchlist": logged-out users get routed through login
    // and the save completes on return (handled by the app's /save deep link).
    const saveHref = `${APP}/save?media_type=${esc(it.media_type)}&tmdb_id=${it.tmdb_id}&src=chart`;
    return `<li><div class="ch-row">
      <span class="ch-rank${it.rank <= 10 ? ' top' : ''}">${it.rank}</span>
      ${img}
      <span><a class="ch-title-link" href="${esc(tUrl)}" style="color:inherit;text-decoration:none"><span class="ch-title">${esc(it.title)}</span></a><span class="ch-kind">${it.media_type === 'tv' ? 'TV' : 'Film'}</span></span>
      <span class="ch-actions">${moveChip(m)}<a class="ch-save" href="${saveHref}" data-cta="chart_save">+ Save</a></span>
    </div></li>`;
  }).join('');

  return page(CHART_TITLE, head, `
    <div class="head r2">
      <div class="head-row">
        <h1 class="feed-title">The <em>chart</em></h1>
        <div class="dateline sc">Week of ${esc(fmtMonthDay(latest.snapshot_date))}</div>
      </div>
      <p class="chart-intro">The twenty most-watched titles this week. We track the rises, the falls, and the new arrivals.</p>
    </div>
    <ol class="chart r3">${rows}</ol>
    ${cta}
  `, 200, 'chart');
};

// ── Homepage sections (theplot.tv/whats-on, unfiltered first page only) ──
// The front page groups the most recent visible posts into named sections
// instead of one flat chronological list. Each section is shaped for what it
// holds — a browsable shelf, a ranked chart, a date-forward card, a wide
// trailer card — rather than repeating one row style under different labels.
// A filtered (?type=) or paged (?page=) view is a reader who already picked a
// category, so it keeps the plain dailyWire list further down in this file.
const HOME_BATCH = 60;
const HERO_RAIL_SIZE = 7;
const STREAMING_SIZE = 4;
const COUNTDOWN_SIZE = 2;
const TRAILER_SIZE = 2;
// Dedicated per-category queries fetch this many extra so a section can still
// fill up even if every hero slot happens to land in that same category.
const CATEGORY_BUFFER = HERO_RAIL_SIZE + 1;

const fmtBadge = (iso: string) => ({
  mon: new Date(iso).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
  day: new Date(iso).getUTCDate(),
});

const sectionHead = (label: string, viewAllHref?: string) => `<div class="sec-head">
    <span class="sec-dot"></span><span class="sec-label">${esc(label)}</span><span class="sec-rule"></span>
    ${viewAllHref ? `<a class="view-all" href="${esc(viewAllHref)}">View all &rarr;</a>` : ''}
  </div>`;
// A named section is one cream card: head + body. 'tight' trims the bottom
// padding for list bodies whose rows carry their own spacing.
const sectionCard = (label: string, viewAllHref: string | undefined, body: string, tight = false) =>
  `<section class="card sec-card${tight ? ' tight' : ''} r3">${sectionHead(label, viewAllHref)}${body}</section>`;

// One compact entry in the rail beside the lead image — mini thumbnail + a
// short headline, nothing else. Deliberately minimal: this is a scan list,
// not a set of secondary stories competing with the lead for attention.
// One story card in the feed column: thumb, kicker chip, headline, date.
const railRow = (p: FeedPost) => {
  const img = postImage(p);
  const d = new Date(p.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `<a class="rail-row r3${img ? '' : ' text-led'}" href="${FEED_PATH}/${esc(p.slug)}">
    ${img ? `<img class="rail-thumb" src="${esc(img)}" alt="" loading="lazy">` : ''}
    <span class="rail-body">${kicker(p)}<span class="rail-t">${esc(postTitle(p))}</span></span>
    <span class="rail-date sc">${esc(d)}</span>
  </a>`;
};

const streamingShelf = (posts: FeedPost[]) => `<div class="shelf">${posts.map((p) => {
  const img = postImage(p);
  return `<a class="shelf-item" href="${FEED_PATH}/${esc(p.slug)}">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
    ${kicker(p)}
    <span class="shelf-t">${esc(postTitle(p))}</span>
  </a>`;
}).join('')}</div>`;

// A compact teaser of the same chart shown in full on /whats-on/chart —
// reuses its rank/poster/movement pieces (chartMovement, moveChip, tmdbImg).
const trendingTeaser = (items: ChartItem[], prior: ChartItem[] | null) => `<ol class="trend-list">${items.map((it) => {
  const m = chartMovement(it, it.rank, prior);
  const tUrl = titleHref(it.media_type, it.tmdb_id, it.title);
  const img = it.poster_path
    ? `<img class="trend-poster" src="${esc(tmdbImg(it.poster_path))}" alt="${esc(it.title)}" loading="lazy">`
    : '<span class="trend-poster ph"></span>';
  return `<li><a class="trend-row" href="${esc(tUrl)}">
    <span class="trend-rank${it.rank <= 3 ? ' top' : ''}">${it.rank}</span>
    ${img}
    <span class="trend-t">${esc(it.title)}</span>
    ${moveChip(m)}
  </a></li>`;
}).join('')}</ol>`;

// The release date is the point of a countdown post, so it's a badge on the
// card rather than buried in a dek. Uses scheduled_for (when Plot posted the
// update) — the only date FeedPost actually carries; not a claim about the
// title's own release date, which this function has no source for.
const comingSoonCards = (posts: FeedPost[]) => `<div class="datecards">${posts.map((p) => {
  const img = postImage(p);
  const { mon, day } = fmtBadge(p.scheduled_for);
  return `<a class="datecard" href="${FEED_PATH}/${esc(p.slug)}">
    <span class="date-badge">${esc(mon)}<span class="dd">${day}</span></span>
    <div class="dc-media">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}</div>
    <span class="dc-t">${esc(postTitle(p))}</span>
  </a>`;
}).join('')}</div>`;

const firstLookCards = (posts: FeedPost[]) => `<div class="wide-grid">${posts.map((p) => {
  const img = postImage(p);
  return `<a class="wide-card" href="${FEED_PATH}/${esc(p.slug)}">
    <div class="wc-media">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span class="play-pill">&#9654; Trailer</span></div>
    <span class="wc-t">${esc(postTitle(p))}</span>
  </a>`;
}).join('')}</div>`;

const tailList = (posts: FeedPost[]) => sectionCard('More updates', undefined,
  `<div class="tail-list">${posts.map((p) => `<a href="${FEED_PATH}/${esc(p.slug)}"><span>${esc(postTitle(p))}</span><span class="meta">${esc(fmtDate(p.scheduled_for))}</span></a>`).join('')}</div>`, true);

// ── Newsletter signup ─────────────────────────────────────────────
// There is no archive: the digest goes out by email and lives only there,
// so this form is the whole of the newsletter on the site. It sits at the
// foot of What's On under #newsletter, where the /newsletter redirects land.
// Posts to theplot.tv/api/newsletter (the same proxy the homepage form uses),
// including the honeypot field that endpoint expects.
const subscribeForm = (placement: string) => `
<aside class="nlsub card r4" id="newsletter">
  <div class="nlsub-copy">
    <span class="nlsub-title">What to watch, sorted</span>
    <span class="nlsub-sub">The week's good stuff handpicked and delivered directly to your inbox.</span>
  </div>
  <form class="nlsub-form" id="nlForm" data-placement="${esc(placement)}">
    <input type="email" name="email" placeholder="your@email.com" required autocomplete="email" aria-label="Email address">
    <input type="text" name="website" class="nlsub-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit">Subscribe</button>
  </form>
  <div class="nlsub-msg" id="nlMsg" role="status"></div>
</aside>`;

// The closing banner at the foot of the What's On front page: signup first,
// the newsletter as the quiet fallback, over a wall of trending posters that
// /js/whats-on.js fills in (#wclWall). It carries #newsletter and the nlForm
// ids, so the /newsletter redirects and the form wiring land here.
const closerSection = (placement: string) => `
<section class="wcl" id="newsletter">
  <div class="wcl-wall" id="wclWall" aria-hidden="true"></div>
  <div class="wcl-inner">
    <h2 class="wcl-headline">Your next favorite <br class="wcl-br"><em>is out there.</em></h2>
    <p class="wcl-sub">Free forever. Premium when you want more.</p>
    <a class="wcl-cta" href="${APP}/signup?src=${esc(placement)}_closer" data-cta="${esc(placement)}_closer">Start tracking</a>
    <div class="wcl-mail">
      <span class="wcl-hint">Want more? Get movie and TV updates by email.</span>
      <form class="wcl-form" id="nlForm" data-placement="${esc(placement)}_closer">
        <input type="email" name="email" placeholder="your@email.com" required autocomplete="email" aria-label="Email address">
        <input type="text" name="website" class="nlsub-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit">Subscribe</button>
      </form>
      <div class="wcl-msg" id="nlMsg" role="status"></div>
    </div>
  </div>
</section>`;

// A short introduction to Plot with the two ways in. The full card sits above
// the newsletter card on every list and article page. `compact` is a single
// strip for tighter spots; nothing renders it yet. Actions are right-aligned
// with Log in to the left of Sign up.
const aboutCard = (placement: string, compact = false) => {
  const actions = `<div class="about-actions">
    <a class="about-login" href="${APP}/login?src=${esc(placement)}" data-cta="${esc(placement)}_about_login">Log in</a>
    <a class="cta" href="${APP}/signup?src=${esc(placement)}" data-cta="${esc(placement)}_about_signup">Sign up</a>
  </div>`;
  if (compact) {
    return `
<aside class="about about-compact card r4" aria-label="About Plot">
  <div class="about-compact-copy">
    <p class="about-title">New to <span class="about-wordmark"><svg style="display:inline-block;height:.871em;width:1.568em;vertical-align:-.19em;overflow:visible" viewBox="52 -681 1568 871" role="img" aria-label="plot" fill="currentColor"><path d="M52 190V-489H161L176 -440Q233 -501 323 -501Q389 -501 440.0 -468.5Q491 -436 519.5 -378.0Q548 -320 548 -244Q548 -169 519.0 -111.0Q490 -53 439.0 -20.5Q388 12 322 12Q249 12 198 -25V190ZM295 -125Q341 -125 370.0 -158.5Q399 -192 399 -244Q399 -297 370.0 -330.5Q341 -364 295 -364Q251 -364 221.0 -330.5Q191 -297 191 -245Q191 -192 221.0 -158.5Q251 -125 295 -125ZM715.0 5Q678.0 5 647.0 -9.5Q616.0 -24 597.0 -56.0Q578.0 -88 578.0 -141V-681H723.0V-193Q723 -132 768 -134Q796 -137 801 -175L880 -80L910 -18Q850 7 715 5ZM1032.0 12Q955.0 12 897.0 -20.5Q839.0 -53 807.0 -111.0Q775.0 -169 775.0 -244Q775.0 -320 807.0 -378.0Q839.0 -436 897.0 -468.5Q955.0 -501 1032.0 -501Q1108.0 -501 1166.0 -468.5Q1224.0 -436 1256.5 -378.0Q1289.0 -320 1289.0 -244Q1289.0 -169 1256.5 -111.0Q1224.0 -53 1166.0 -20.5Q1108.0 12 1032.0 12ZM1032.0 -130Q1080.0 -130 1110.5 -161.5Q1141.0 -193 1141.0 -245Q1141.0 -296 1110.5 -328.0Q1080.0 -360 1032.0 -360Q983.0 -360 953.0 -328.5Q923.0 -297 923.0 -245Q923.0 -193 953.0 -161.5Q983.0 -130 1032.0 -130ZM1539.0 8Q1457.0 8 1411.0 -32.0Q1365.0 -72 1365.0 -163V-355H1289.0V-489H1363.0L1393.0 -607H1511.0V-489H1620.0V-355H1511.0V-195Q1511.0 -161 1527.0 -146.5Q1543.0 -132 1569.0 -132Q1584.0 -132 1597.5 -134.5Q1611.0 -137 1620.0 -140V-3Q1602.0 2 1583.0 5.0Q1564.0 8 1539.0 8Z"/></svg></span>?</p>
    <p class="about-sub">Track what you watch and know what's coming next.</p>
  </div>
  ${actions}
</aside>`;
  }
  return `
<aside class="about card r4" aria-label="About Plot">
  <span class="about-logo" aria-hidden="true"><svg style="display:inline-block;height:.871em;width:1.568em;vertical-align:-.19em;overflow:visible" viewBox="52 -681 1568 871" aria-hidden="true" focusable="false" fill="currentColor"><path d="M52 190V-489H161L176 -440Q233 -501 323 -501Q389 -501 440.0 -468.5Q491 -436 519.5 -378.0Q548 -320 548 -244Q548 -169 519.0 -111.0Q490 -53 439.0 -20.5Q388 12 322 12Q249 12 198 -25V190ZM295 -125Q341 -125 370.0 -158.5Q399 -192 399 -244Q399 -297 370.0 -330.5Q341 -364 295 -364Q251 -364 221.0 -330.5Q191 -297 191 -245Q191 -192 221.0 -158.5Q251 -125 295 -125ZM715.0 5Q678.0 5 647.0 -9.5Q616.0 -24 597.0 -56.0Q578.0 -88 578.0 -141V-681H723.0V-193Q723 -132 768 -134Q796 -137 801 -175L880 -80L910 -18Q850 7 715 5ZM1032.0 12Q955.0 12 897.0 -20.5Q839.0 -53 807.0 -111.0Q775.0 -169 775.0 -244Q775.0 -320 807.0 -378.0Q839.0 -436 897.0 -468.5Q955.0 -501 1032.0 -501Q1108.0 -501 1166.0 -468.5Q1224.0 -436 1256.5 -378.0Q1289.0 -320 1289.0 -244Q1289.0 -169 1256.5 -111.0Q1224.0 -53 1166.0 -20.5Q1108.0 12 1032.0 12ZM1032.0 -130Q1080.0 -130 1110.5 -161.5Q1141.0 -193 1141.0 -245Q1141.0 -296 1110.5 -328.0Q1080.0 -360 1032.0 -360Q983.0 -360 953.0 -328.5Q923.0 -297 923.0 -245Q923.0 -193 953.0 -161.5Q983.0 -130 1032.0 -130ZM1539.0 8Q1457.0 8 1411.0 -32.0Q1365.0 -72 1365.0 -163V-355H1289.0V-489H1363.0L1393.0 -607H1511.0V-489H1620.0V-355H1511.0V-195Q1511.0 -161 1527.0 -146.5Q1543.0 -132 1569.0 -132Q1584.0 -132 1597.5 -134.5Q1611.0 -137 1620.0 -140V-3Q1602.0 2 1583.0 5.0Q1564.0 8 1539.0 8Z"/></svg></span>
  <p class="about-title">Everything you've watched. Everything you want to watch.</p>
  <p class="about-sub">Plot is your personal movie and TV companion. Track what you've seen, save what's next and know what's streaming, trending and landing soon, all in one place.</p>
  ${actions}
</aside>`;
};

const SUBSCRIBE_CSS = `
  /* Plot intro card: cream, one headline, two ways in. */
  /* Charcoal, so the intro leads and the newsletter card below reads as the cream one. */
  .about.card, .about { padding: 28px; background: var(--ink); color: var(--bg); }
  .about-logo { display: block; margin-bottom: 14px; font-family: var(--display); font-size: 1.5rem; font-weight: 700; letter-spacing: -0.1em; line-height: 1; }
  .about-title { font-family: var(--display); font-weight: 700; letter-spacing: -0.03em; font-size: 1.4rem; line-height: 1.1; margin: 0 0 8px; }
  .about-sub { color: rgba(248,242,234,0.7); font-size: 0.92rem; line-height: 1.55; margin: 0; max-width: 56ch; }
  .about-actions { display: flex; align-items: center; justify-content: flex-end; gap: 20px; margin-top: 20px; }
  .about-wordmark { font-weight: 700; letter-spacing: -0.1em; }
  .about-compact { display: flex; align-items: center; justify-content: space-between; gap: 16px 24px; flex-wrap: wrap; padding: 16px 20px; }
  .about-compact .about-title { font-size: 1.05rem; margin: 0; }
  .about-compact .about-sub { font-size: 0.82rem; }
  .about-compact .about-actions { margin-top: 0; margin-left: auto; }
  .about-login { color: var(--bg); font-size: 0.9rem; font-weight: 500; text-decoration: underline; text-underline-offset: 4px; text-decoration-color: rgba(248,242,234,0.35); padding: 12px 0; transition: text-decoration-color 0.2s; }
  .about-login:hover { text-decoration-color: var(--bg); }
  /* On an article the cards line up with the text column, not the page. */
  .post-cards { max-width: 680px; margin: 44px auto 0; display: grid; gap: 16px; }
  .post-cards > .nlsub, .post-cards > .about { margin-top: 0; }
  .wrap > .about, .post-foot > .about { margin-top: 44px; }

  /* Cream card. scroll-margin clears the fixed topnav: the /newsletter
     redirects land on #newsletter, and without it the heading lands under it. */
  /* .nlsub.card outranks the later .card rule in the main stylesheet. */
  .nlsub.card, .nlsub { background: var(--paper); color: var(--ink); padding: 24px 28px; scroll-margin-top: 88px; }
  .nlsub .nlsub-title, .nlsub .nlsub-copy { color: var(--ink); }
  .nlsub-copy { display: flex; flex-direction: column; gap: 6px; }
  .nlsub-title { font-family: var(--display); font-weight: 700; letter-spacing: -0.03em; font-size: 1.4rem; line-height: 1; }
  .nlsub-sub { color: var(--mut); font-size: 0.92rem; }
  .nlsub-form { display: flex; gap: 6px; margin-top: 16px; align-items: center; background: var(--bg); border-radius: 9999px; padding: 5px 5px 5px 16px; }
  .nlsub-form input[type=email] { flex: 1 1 120px; min-width: 0; padding: 8px 0; border: 0; font: inherit; font-size: 0.9rem; color: var(--ink); background: transparent; }
  .nlsub-form input[type=email]:focus { outline: none; }
  .nlsub-form button { padding: 9px 16px; border: 0; border-radius: 9999px; background: var(--fill); color: var(--ink); font: inherit; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
  .nlsub-form button:hover { background: var(--fill-hover); }
  .nlsub-form button:disabled { opacity: 0.5; cursor: default; }
  .nlsub-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  .nlsub-msg { margin-top: 10px; color: var(--mut); font-size: 0.86rem; min-height: 1.2em; }
  /* on list and article pages the card stands alone below the content */
  .wrap > .nlsub, .post-foot > .nlsub { margin-top: 44px; }

  /* Closing banner over a poster wall (What's On front page). */
  .wcl { position: relative; isolation: isolate; overflow: hidden; margin-top: -40px; padding: 9rem 24px 8rem; text-align: center; scroll-margin-top: 88px; }
  .wcl-wall { position: absolute; inset: 0; z-index: -1; display: grid; grid-template-columns: repeat(9, 1fr); grid-auto-rows: min-content; align-content: start; gap: 12px; opacity: 0.15;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 20%, #000 78%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0, #000 20%, #000 78%, transparent 100%);
    -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
  .wcl-tile { aspect-ratio: 2 / 3; border-radius: 8px; overflow: hidden; background: #e5e3db; }
  .wcl-tile img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity 0.6s var(--ease); }
  .wcl-tile img.loaded { opacity: 1; }
  .wcl-inner { max-width: 720px; margin: 0 auto; position: relative; display: flex; flex-direction: column; align-items: center; }
  .wcl-headline { font-family: var(--display); font-weight: 700; letter-spacing: -0.03em; font-size: clamp(2.5rem, 5.5vw, 4.5rem); line-height: 0.86; margin-bottom: 1.1rem; }
  .wcl-headline em { font-style: normal; }
  .wcl-sub { font-size: 1.05rem; font-weight: 300; color: var(--mut); max-width: 44ch; margin: 0 auto 1.6rem; line-height: 1.5; }
  .wcl-cta { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 28px; border-radius: 9999px; background: var(--fill); color: var(--ink); font-weight: 600; font-size: 1rem; text-decoration: none; transition: background 0.2s; }
  .wcl-cta:hover { background: var(--fill-hover); }
  .wcl-mail { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; margin-top: 2.2rem; width: 100%; }
  .wcl-hint { font-size: 0.8rem; font-weight: 300; color: var(--mut); }
  .wcl-form { display: flex; align-items: center; border: 1px solid var(--ink); border-radius: 9999px; padding: 6px; height: 56px; width: 360px; max-width: 100%; }
  .wcl-form input[type=email] { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 0.88rem; padding: 0 6px 0 16px; color: var(--ink); }
  .wcl-form input[type=email]::placeholder { color: var(--mut); }
  .wcl-form button { height: 40px; padding: 0 18px; border: 0; border-radius: 9999px; background: var(--fill); color: var(--ink); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background 0.2s; }
  .wcl-form button:hover:not(:disabled) { background: var(--fill-hover); }
  .wcl-form button:disabled { opacity: 0.6; cursor: default; }
  .wcl-msg { font-size: 0.78rem; color: var(--mut); min-height: 1.1em; }
  .wcl + .site-footer { margin-top: 0; border-top: 0; }
  @media (max-width: 820px) { .wcl-wall { grid-template-columns: repeat(6, 1fr); } }
  @media (max-width: 600px) { .wcl { padding: 6rem 16px 5rem; } }
  @media (pointer: coarse) { .wcl-form { height: 52px; } .wcl-form button, .wcl-form input[type=email] { min-height: 44px; } }
`;
const SUBSCRIBE_HEAD = `<style>${SUBSCRIBE_CSS}</style>`;

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey(),
  );

  // Path after the function name: '' for index, '<slug>' for an entry.
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const fnIndex = segments.indexOf('marketing-feed');
  const slug = segments.slice(fnIndex + 1).join('/') || null;

  const baseQuery = () => supabase
    .from('marketing_posts')
    .select('slug, copy, media, post_type, scheduled_for, status, tmdb_refs, payload')
    .not('slug', 'is', null)
    // The trending chart lives on its own page (/whats-on/chart), not as a
    // dated article — keep it out of every feed surface.
    .neq('post_type', 'trending')
    .in('status', VISIBLE_STATUSES)
    .lte('scheduled_for', new Date().toISOString());

  // Articles sitemap: every visible /whats-on entry (proxied to theplot.tv/
  // sitemap-articles.xml). Mirrors the title-page sitemap mode.
  if (url.searchParams.get('sitemap') === '1') {
    const { data: posts } = await baseQuery().order('scheduled_for', { ascending: false }).limit(5000);
    const urls = (posts || [])
      .map((p) => `${SITE}${FEED_PATH}/${p.slug}`)
      .map((loc) => `<url><loc>${esc(loc)}</loc><changefreq>weekly</changefreq></url>`)
      .join('\n');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
      { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  }

  // Reserved keyword: the persistent trending-chart page.
  if (slug === 'chart') return await renderChart(supabase);

  // Reserved keyword: the retired newsletter pages. There is no archive and no
  // /newsletter page — the signup is a section of What's On. theplot.tv/
  // newsletter[/*] is redirected at the Pages proxy (which doesn't forward a
  // 3xx Location from here); this covers a direct hit on the function.
  if (slug === 'newsletter' || slug?.startsWith('newsletter/')) {
    return Response.redirect(`${SITE}${FEED_PATH}#newsletter`, 301);
  }

  if (!slug) {
    const type = TYPE_META[url.searchParams.get('type') || ''] ? url.searchParams.get('type') : null;
    const pageNum = Math.min(Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1), 100);

    const rawQ = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const dexLinks = FILTERS.map((f) => {
      const active = f.key === type;
      const href = f.key ? `${FEED_PATH}?type=${f.key}` : FEED_PATH;
      return `<a class="sc${active ? ' active' : ''}" href="${href}">${esc(f.label)}</a>`;
    }).join('');

    const dateline = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

    const head = `${SUBSCRIBE_HEAD}
<meta name="description" content="What’s On is Plot’s guide to what’s coming, streaming and trending in film and TV, so you can spend less time searching and more time watching.">
<link rel="canonical" href="${SITE}${FEED_PATH}">
<meta property="og:type" content="website">
<meta property="og:title" content="${FEED_SEO_TITLE}">
<meta property="og:description" content="What’s On is Plot’s guide to what’s coming, streaming and trending in film and TV, so you can spend less time searching and more time watching.">
<meta property="og:url" content="${SITE}${FEED_PATH}">
<meta property="og:image" content="${OG_FALLBACK}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_FALLBACK}">`;

    const titleRow = `
      <div class="head r2">
        <div class="head-row">
          <h1 class="feed-title">What's <em>on</em></h1>
          <div class="dateline sc">${esc(dateline)}</div>
        </div>
      </div>
      <form class="wsearch r2" role="search" action="${FEED_PATH}" method="get">
        <input type="search" name="q" value="${esc(rawQ)}" placeholder="Search What's On" maxlength="80" aria-label="Search What's On articles" autocomplete="off">
        <button type="submit">Search</button>
      </form>
      <nav class="dex r2">
        <div class="dex-links">${dexLinks}</div>
      </nav>`;

    // Search: ?q= over article titles and bodies, every word required. Served
    // un-cached and noindex (the Pages proxy skips its cache for q), canonical
    // to the front page so a search never becomes a page of its own.
    const words = searchWords(rawQ);
    if (words.length) {
      let query = baseQuery();
      for (const w of words) {
        query = query.or(`copy->>page_title.ilike.%${w}%,copy->>page_body.ilike.%${w}%`);
      }
      const { data: found } = await query.order('scheduled_for', { ascending: false }).limit(SEARCH_LIMIT);
      const lower = words.map((w) => w.toLowerCase());
      const inTitle = (p: FeedPost) => {
        const t = postTitle(p).toLowerCase();
        return lower.every((w) => t.includes(w));
      };
      const results = ((found || []) as FeedPost[])
        .map((p, i) => ({ p, i, hit: inTitle(p) ? 0 : 1 }))
        .sort((a, b) => a.hit - b.hit || a.i - b.i)
        .map((r) => r.p);
      const n = results.length;
      const summary = n
        ? `${n >= SEARCH_LIMIT ? `The ${SEARCH_LIMIT} newest` : n} ${n === 1 ? 'article' : 'articles'} for &ldquo;${esc(rawQ)}&rdquo;. <a href="${FEED_PATH}">Clear search</a>`
        : `No articles match &ldquo;${esc(rawQ)}&rdquo;. Try fewer or different words, or <a href="${FEED_PATH}">browse What's On</a>.`;
      const searchHead = `${SUBSCRIBE_HEAD}
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${SITE}${FEED_PATH}">`;
      return page(`${rawQ} – Search What's On – Plot`, searchHead, `
        ${titleRow}
        <p class="search-sum r3">${summary}</p>
        ${results.length ? dailyWire(results) : ''}
      `, 200, 'whats-on', 'no-store', closerSection('whats_on'));
    }

    // Unfiltered first page: the sectioned front page. A ?type= filter or
    // page 2+ is a reader who already picked a category — that stays the
    // plain chronological list below, unchanged.
    if (!type && pageNum === 1) {
      const [
        { data: batchData },
        { data: streamingData },
        { data: countdownData },
        { data: trailerData },
        { latest: chartLatest, prior: chartPrior },
      ] = await Promise.all([
        baseQuery().order('scheduled_for', { ascending: false }).limit(HOME_BATCH),
        baseQuery().eq('post_type', 'now_streaming').order('scheduled_for', { ascending: false }).limit(STREAMING_SIZE + CATEGORY_BUFFER),
        baseQuery().eq('post_type', 'countdown').order('scheduled_for', { ascending: false }).limit(COUNTDOWN_SIZE + CATEGORY_BUFFER),
        baseQuery().eq('post_type', 'trailer').order('scheduled_for', { ascending: false }).limit(TRAILER_SIZE + CATEGORY_BUFFER),
        fetchTrendingSnapshots(supabase),
      ]);
      const batch = (batchData || []) as FeedPost[];

      if (!batch.length) {
        return page(FEED_SEO_TITLE, head, `${titleRow}<p style="margin-top:48px;color:var(--mut);font-weight:300;">First update lands soon.</p>${aboutCard('whats_on')}`, 200, 'whats-on', SHORT_CACHE, closerSection('whats_on'));
      }

      // The lead plus a scan-list rail come straight off the top of the same
      // chronological batch. A hidden gem is an evergreen rewatch pick, not
      // front-page news, so it's never the lead — skip to the next post that
      // isn't one (it's still eligible for the rail below, just not the hero).
      // The three category sections further down are each their own dedicated
      // query (not derived from this batch) so a section can still fill up
      // even on a day where its posts fell outside the batch's window — only
      // excluded here so nothing doubles up with the hero.
      const leadIdx = Math.max(batch.findIndex((p) => p.post_type !== 'hidden_gem'), 0);
      const lead = batch[leadIdx];
      const rest = [...batch.slice(0, leadIdx), ...batch.slice(leadIdx + 1)];
      const rail = rest.slice(0, HERO_RAIL_SIZE);
      const heroSlugs = new Set([lead.slug, ...rail.map((p) => p.slug)]);

      const streaming = ((streamingData || []) as FeedPost[]).filter((p) => !heroSlugs.has(p.slug)).slice(0, STREAMING_SIZE);
      const countdown = ((countdownData || []) as FeedPost[]).filter((p) => !heroSlugs.has(p.slug)).slice(0, COUNTDOWN_SIZE);
      const trailer = ((trailerData || []) as FeedPost[]).filter((p) => !heroSlugs.has(p.slug)).slice(0, TRAILER_SIZE);
      const used = new Set([...heroSlugs, ...streaming.map((p) => p.slug), ...countdown.map((p) => p.slug), ...trailer.map((p) => p.slug)]);
      const tail = rest.filter((p) => !used.has(p.slug)).slice(0, 6);
      const chartItems = ((chartLatest?.items as ChartItem[] | undefined) || []).slice(0, 5);

      // Feed column: lead, two stories, New at home, two more stories, First
      // look, the rest of the rail, More updates. Sidebar: Trending, Coming
      // soon, the newsletter. Everything is a cream card on the cream ground.
      const stories = rail.map(railRow);
      const main = [
        featuredHero(lead),
        ...stories.slice(0, 2),
        streaming.length ? sectionCard('New at home', `${FEED_PATH}?type=now_streaming`, streamingShelf(streaming)) : '',
        ...stories.slice(2, 4),
        trailer.length ? sectionCard('First look', `${FEED_PATH}?type=trailer`, firstLookCards(trailer)) : '',
        ...stories.slice(4),
        tail.length ? tailList(tail) : '',
      ].join('');
      const side = [
        chartItems.length ? sectionCard('Trending', `${FEED_PATH}/chart`, trendingTeaser(chartItems, chartPrior), true) : '',
        countdown.length ? sectionCard('Coming soon', `${FEED_PATH}?type=countdown`, comingSoonCards(countdown), true) : '',
        aboutCard('whats_on'),
      ].join('');

      // The front page shows the newest few dozen posts in sections; without
      // this nothing linked past them, so every older article was an orphan
      // reachable only from the sitemap.
      return page(FEED_SEO_TITLE, head, `
        ${titleRow}
        <div class="feed-grid">
          <div class="feed-main">${main}</div>
          <aside class="feed-side">${side}</aside>
        </div>
        <div class="older-row r4"><a class="older sc" href="${FEED_PATH}?page=2">Older updates &rarr;</a></div>
      `, 200, 'whats-on', SHORT_CACHE, closerSection('whats_on'));
    }

    const offset = (pageNum - 1) * PAGE_SIZE;
    let query = baseQuery()
      .order('scheduled_for', { ascending: false })
      .range(offset, offset + PAGE_SIZE); // one extra row to detect another page
    if (type) query = query.eq('post_type', type);
    const { data } = await query;

    const posts = ((data || []) as FeedPost[]);
    const hasMore = posts.length > PAGE_SIZE;
    const visible = posts.slice(0, PAGE_SIZE);

    const olderParams = new URLSearchParams();
    if (type) olderParams.set('type', type);
    olderParams.set('page', String(pageNum + 1));
    const older = hasMore
      ? `<div class="older-row r4"><a class="older sc" href="${FEED_PATH}?${olderParams.toString()}">Older updates &rarr;</a></div>`
      : '';

    const empty = visible.length === 0
      ? `<p style="margin-top:48px;color:var(--mut);font-weight:300;">No updates here yet.</p>`
      : '';

    return page(FEED_SEO_TITLE, head, `
      ${titleRow}
      ${dailyWire(visible)}
      ${empty}
      ${older}
      ${aboutCard('whats_on')}
    `, 200, 'whats-on', SHORT_CACHE, closerSection('whats_on'));
  }

  const { data: post } = await baseQuery().eq('slug', slug).maybeSingle();
  if (!post) {
    // Old per-week chart articles now live on the persistent chart page. Serve
    // it in place (canonical points at /whats-on/chart) so already-published
    // social links keep working — the proxy doesn't forward 3xx Location.
    const { data: legacyChart } = await supabase
      .from('marketing_posts')
      .select('post_type')
      .eq('slug', slug)
      .eq('post_type', 'trending')
      .maybeSingle();
    if (legacyChart) return await renderChart(supabase);
    return page('Not found · Plot', '', `
      <article class="post r2">
        <header class="post-head"><h1>Nothing here yet</h1></header>
        <div class="post-body"><p>This update does not exist or has not been published.</p></div>
        <a class="back sc" href="${FEED_PATH}">&larr; All updates</a>
      </article>`, 404);
  }

  const typed = post as FeedPost;
  const hero = postImage(typed);
  const shareImg = postShareImage(typed);
  const title = postTitle(typed);
  const body = postBody(typed);
  // The first paragraph alone is often one short sentence ("too short" in
  // audits), so keep adding paragraphs until there is enough to summarise.
  let summary = '';
  for (const block of body) {
    const prose = articleExcerpt([block]);
    if (prose) summary = summary ? `${summary} ${prose}` : prose;
    if (summary.length >= 110) break;
  }
  const description = clampDescription(summary) || `Film & TV updates from Plot.`;
  const pageUrl = entryUrl(typed);

  // The three posts published just before this one, so following "More from"
  // walks back through the whole archive and every article has at least one
  // link in. Showing the newest three instead linked only those, from every
  // page, and left the rest orphaned. The oldest posts fall back to the newest.
  const { data: older } = await baseQuery()
    .lt('scheduled_for', typed.scheduled_for)
    .order('scheduled_for', { ascending: false })
    .limit(3);
  const others = (older || []).length
    ? older
    : (await baseQuery().neq('slug', slug).order('scheduled_for', { ascending: false }).limit(3)).data;

  const more = (others || []).length
    ? `<div class="more r4">
        <span class="more-head sc">More from ${FEED_TITLE}</span>
        <div class="more-grid">${(others as FeedPost[]).map(moreCard).join('')}</div>
      </div>`
    : '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    datePublished: typed.scheduled_for,
    ...(hero ? { image: [hero] } : {}),
    url: pageUrl,
    publisher: { '@type': 'Organization', name: 'Plot', url: SITE },
  }).replace(/</g, '\\u003c');

  const head = `${SUBSCRIBE_HEAD}
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(shareImg)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(shareImg)}">
<script type="application/ld+json">${jsonLd}</script>`;

  // The poster grid belongs to long-form, multi-title guides. Ordinary article
  // pages use their single, combined title/save/watch module below instead.
  const refs = Array.isArray(typed.tmdb_refs) ? typed.tmdb_refs : [];
  // What the copy names, for the save chips and the closing card. Attached refs
  // when there are any; otherwise whatever the prose names that TMDB can place.
  // The story modules and ordering below keep working from `refs` alone.
  const mentioned = refs.length
    ? refs
    : await resolveMentionedTitles(body, Number(String(typed.scheduled_for || '').slice(0, 4)) || null);
  // The copy contract guarantees body[0] = intro, body[1..refs.length] = one
  // paragraph per ref in order, body[refs.length+1] = close — but only trust
  // that when the flag from validateGuide is set AND the length still matches,
  // since admin-review lets a human freely edit page_body afterward (splitting
  // or merging a paragraph would silently break the 1:1 alignment otherwise).
  const inlineTitles = typed.post_type === 'guide' && typed.copy?.inline_titles === true && body.length === refs.length + 2;

  const titleParagraph = (text: string, r: TmdbRef) => {
    if (isArticleTable(text)) return renderArticleBlock(text);
    const poster = r.poster_path ? `https://image.tmdb.org/t/p/w185${esc(r.poster_path)}` : null;
    return `<div style="display:flex;gap:16px;align-items:flex-start;margin:20px 0">
        <a href="${esc(titleHref(r.media_type, refId(r) ?? 0, r.title))}" style="flex-shrink:0;width:84px">${poster ? `<img src="${poster}" alt="${esc(r.title)}" loading="lazy" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:8px;border:1px solid var(--hair);display:block">` : '<span style="display:block;width:100%;aspect-ratio:2/3;border-radius:8px;background:var(--paper);border:1px solid var(--hair)"></span>'}</a>
        <p style="margin:0;flex:1">${esc(text)}</p>
      </div>`;
  };
  const bodyLede = body.length ? renderArticleBlock(body[0], { lede: true }) : '';

  // What the modules did not feature. Poster, name, and the same action — the
  // grid this replaces offered neither, so an eleven-title guide carried less
  // than a one-title article. No service is named here: where to watch is the
  // app's job, and naming one would cost a lookup per row.
  const shown = new Set<TmdbRef>();
  // Date and release kind for the week ahead, already in payload, so a row costs
  // no extra lookup. Keyed by tmdb_id because payload entries carry that name
  // even where tmdb_refs do not. A `trending` post never gets here — every one
  // of those slugs is served as the persistent chart page instead.
  const rowContext = (r: TmdbRef): { note?: string; chip?: string; poster?: string } => {
    const rid = refId(r);
    if (!rid) return {};
    if (typed.post_type === 'upcoming') {
      const item = (typed.payload?.titles || []).find((i) => i.tmdb_id === rid);
      const KIND: Record<string, string> = { cinema: 'In theaters', streaming: 'Streaming', tv: 'On TV' };
      return item
        ? { note: usDateLabel(item.when_label), chip: KIND[item.release_kind ?? ''] || '', poster: item.poster_path || '' }
        : {};
    }
    return {};
  };

  const restRows = (list: TmdbRef[]) => list.map((r) => {
    const rid = refId(r);
    const { note, chip, poster: fallback } = rowContext(r);
    const posterPath = r.poster_path || fallback || '';
    const poster = posterPath ? `https://image.tmdb.org/t/p/w185${esc(posterPath)}` : null;
    return `<div class="gt-row">
      <a href="${esc(titleHref(r.media_type, rid ?? 0, r.title))}" class="gt-art">${poster ? `<img src="${poster}" alt="" loading="lazy">` : '<span class="gt-ph"></span>'}</a>
      <span class="gt-text">
        <a href="${esc(titleHref(r.media_type, rid ?? 0, r.title))}" class="gt-name">${esc(r.title)}</a>
        ${note ? `<span class="gt-note">${esc(note)}</span>` : ''}
      </span>
      ${chip ? `<span class="gt-chip">${esc(chip)}</span>` : ''}
      ${rid ? `<a class="gt-add" href="${APP}/save?media_type=${r.media_type === 'tv' ? 'tv' : 'movie'}&tmdb_id=${rid}&src=whats_on_guide" data-cta="guide_save" aria-label="Save ${esc(r.title)} to your Plot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></a>` : ''}
    </div>`;
  }).join('');

  const k = kicker(typed);
  const region = (url.searchParams.get('r') || 'US').toUpperCase().slice(0, 2) || 'US';
  // A guide earns up to two modules: the title its copy opens with, and the
  // planner's top remaining pick placed where the copy first names it. The rest
  // become compact rows at the foot. Two TMDB lookups at most, whatever the
  // title count — the poster grid it replaces made none, but offered no action
  // and no link a reader could act on.
  const ranked = rankRefs(body, refs);
  const lead = ranked.length
    ? [...ranked].sort((a, b) =>
        Number(a.mention < 0) - Number(b.mention < 0) || a.mention - b.mention || a.order - b.order)[0]
    : null;
  const runnerUp = typed.post_type === 'guide' && lead
    ? ranked.filter((r) => r !== lead).sort((a, b) => a.order - b.order)[0]
    : undefined;
  // Only when the copy names it late enough to sit clear of the lede and still
  // inside the body, so the second module never doubles up or dangles.
  const runnerUpAt = runnerUp && runnerUp.mention >= 2 && runnerUp.mention <= body.length - 1
    ? runnerUp.mention
    : -1;

  const wantsModule = (typed.post_type === 'guide' && refs.length > 0) || refs.length === 1;
  const trailerHtml = lead ? await trailerModule(typed, lead.ref) : '';
  const storyHtml = trailerHtml || (wantsModule && lead && !inlineTitles ? await storyModule(typed, region, lead.ref) : '');
  const runnerUpHtml = storyHtml && runnerUpAt > 0 ? await storyModule(typed, region, runnerUp!.ref) : '';
  // ~220 wpm, rounded up — enough to set an expectation, not a precise claim.
  const words = body.join(' ').split(/\s+/).filter(Boolean).length;
  const readMins = Math.max(1, Math.round(words / 220));
  if (storyHtml && lead) shown.add(lead.ref);
  if (runnerUpHtml && runnerUp) shown.add(runnerUp.ref);
  const rest = refs.filter((r) => !shown.has(r));
  const TAIL_HEAD: Record<string, string> = {
    guide: 'Save from this guide',
    upcoming: 'Everything landing this week',
  };
  const tailHead = TAIL_HEAD[typed.post_type];
  // The closing summary card. A guide lists every title it names, including
  // the ones a module already featured, so the reader can save the lot in one
  // place; other post types keep to what the modules did not show.
  const summaryTitles = typed.post_type === 'guide' ? mentioned : rest;
  const titlesSection = tailHead && summaryTitles.length > 1
    ? `<section class="gt">
        <div class="gt-head">
          <h2>${esc(tailHead)}</h2>
          <span class="gt-count">${summaryTitles.length} titles</span>
        </div>
        <div class="gt-card">
          <div class="gt-col">${restRows(summaryTitles.slice(0, Math.ceil(summaryTitles.length / 2)))}</div>
          <div class="gt-col">${restRows(summaryTitles.slice(Math.ceil(summaryTitles.length / 2)))}</div>
        </div>
      </section>`
    : '';

  // One signup prompt per article, at the end. Nothing is inserted mid-body.
  const bodyChunks: { html: string; prose: boolean }[] = [];
  // A save chip follows the first paragraph that names a title, for titles no
  // module already carries a save button for. Each title is offered once.
  const chipped = new Set<TmdbRef>();
  const saveLine = (text: string) => {
    const lower = text.toLowerCase();
    const hits = mentioned.filter((r) => {
      const t = String(r.title || '').toLowerCase().trim();
      return refId(r) && t && !shown.has(r) && !chipped.has(r) && lower.includes(t);
    }).slice(0, 3);
    hits.forEach((r) => chipped.add(r));
    if (!hits.length) return '';
    return `<p class="save-line">${hits.map((r) => `<a class="save-chip" href="${APP}/save?media_type=${r.media_type === 'tv' ? 'tv' : 'movie'}&amp;tmdb_id=${refId(r)}&amp;src=whats_on_article" data-cta="article_save" aria-label="Save ${esc(r.title)} to your Plot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>Save ${esc(r.title)}</a>`).join('')}</p>`;
  };
  const pushProse = (text: string, html: string) => {
    if (!text) return;
    const prose = !isArticleTable(text);
    bodyChunks.push({ html: prose ? html + saveLine(text) : html, prose });
  };
  if (body[0]) pushProse(body[0], bodyLede);
  if (storyHtml) bodyChunks.push({ html: storyHtml, prose: false });
  if (inlineTitles) {
    refs.forEach((r, i) => {
      const text = body[i + 1] || '';
      pushProse(text, titleParagraph(text, r));
    });
    pushProse(body[refs.length + 1] || '', renderArticleBlock(body[refs.length + 1] || ''));
  } else if (runnerUpHtml) {
    body.slice(1, runnerUpAt + 1).forEach((text) => pushProse(text, renderArticleBlock(text)));
    bodyChunks.push({ html: runnerUpHtml, prose: false });
    body.slice(runnerUpAt + 1).forEach((text) => pushProse(text, renderArticleBlock(text)));
  } else {
    body.slice(1).forEach((text) => pushProse(text, renderArticleBlock(text)));
  }
  const endPrompt = articleSignupPromptHtml({
    app: APP,
    slug: typed.slug,
    placement: 'whats_on_article_end',
  });
  const bodyHtml = bodyChunks.map((chunk) => chunk.html).join('');

  const docTitle = fitTitle([`${title} · Plot`, title]);
  return page(docTitle, head, `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="${SITE}">Home</a><span class="sep2">/</span><a href="${FEED_PATH}">What's On</a>${k ? `<span class="sep2">/</span><span>${esc(TYPE_META[typed.post_type]?.label ?? 'Update')}</span>` : ''}
    </nav>
    <article class="post r2${hero ? '' : ' text-led'}">
      <header class="post-head">
        <div class="a-meta"><span class="d sc">${esc(fmtDate(typed.scheduled_for))}</span><span class="sep"></span><span class="d sc">${readMins} min read</span></div>
        <h1>${esc(title)}</h1>
      </header>
      ${hero ? `<figure class="hero"><img src="${esc(hero)}" alt=""></figure>` : ''}
      <div class="post-body">
        ${bodyHtml}
      </div>
      ${titlesSection}
      ${endPrompt}
    </article>
    <div class="post-cards">
      ${aboutCard('whats_on_article')}
    </div>
    ${more}
    <div class="post-foot"><a class="back sc" href="${FEED_PATH}">&larr; All updates</a></div>
    <div class="post-cards">
      ${subscribeForm('whats_on_article')}
    </div>
  `, 200, 'whats-on', ARTICLE_CACHE);
});
