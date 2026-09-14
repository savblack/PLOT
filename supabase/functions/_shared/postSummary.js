// How a marketing post describes itself: the one-line "why it was planned", the
// platforms it targets, and its article link.
//
// Shared because there are now two review surfaces reading the same rows — the
// web desk (admin-review/index.ts) and the Linear mirror (marketing/lib/linear.mjs).
// When these lived only in the desk, the mirror would have had to restate them,
// and the day someone added a post type the two surfaces would have started
// describing the same post differently. The "why" is the thing an operator
// actually reads before approving, so it is exactly the wrong thing to fork.
//
// Plain JS, no types and no imports, so Deno and Node can both take it as-is.

export const SITE_URL = 'https://theplot.tv';

/** One line explaining why this post exists, derived from its plan data. */
export const reason = (p) => {
  const title = p.tmdb_refs?.[0]?.title || p.payload?.title || p.payload?.topic?.title || '';
  switch (p.post_type) {
    case 'upcoming': return 'Monday slate — the week’s most-anticipated titles';
    case 'trending': return 'Friday chart — this week’s trending top 10';
    case 'watch_tonight': return title ? `Trending & streamable now: ${title}` : 'What to watch tonight';
    case 'hidden_gem': return title ? `Highly-rated, lesser-seen: ${title}` : 'Hidden gem of the week';
    case 'on_this_day': return title ? `Anniversary: ${title}` : 'On this day in film/TV';
    case 'now_streaming': {
      const rental = p.payload?.home_kind === 'rental';
      if (rental) return title ? `Now at home (rent or buy): ${title}` : 'New to rent or buy today';
      return title ? `Hits streaming today: ${title}` : 'New on streaming today';
    }
    case 'countdown': {
      const m = String(p.topic_key || '').match(/:t(\d+):/);
      const n = m ? m[1] : (p.payload?.days ?? '');
      return title ? `T-${n} countdown to ${title}` : `Countdown (T-${n})`;
    }
    case 'trailer': return title ? `New trailer dropped: ${title}` : 'New trailer';
    case 'question': return title ? `Audience question about: ${title}` : 'Audience question';
    case 'guide': return p.copy?.page_title ? `Long-form guide: ${p.copy.page_title}` : 'Long-form SEO guide';
    default: return String(p.post_type).replace(/_/g, ' ');
  }
};

/**
 * Which platforms this post targets (from its publication rows, else the default
 * fan-out — conversations are text-only on X + Threads; guides are web-only
 * articles and never get publication rows at all).
 */
export const platformsFor = (p) => {
  const pubs = p.marketing_post_publications || [];
  if (pubs.length) return [...new Set(pubs.map((x) => x.platform))];
  if (p.post_type === 'guide') return [];
  return p.post_type === 'question' ? ['x', 'threads'] : ['x', 'instagram', 'threads'];
};

/**
 * The facts behind the claim `reason()` makes, for the review card to show.
 *
 * reason() asserts things — "highly-rated, lesser-seen", "trending & streamable
 * now" — and an assertion with no evidence cannot be argued with. A hidden gem
 * went out that was Star Wars, and the card had said only "Highly-rated,
 * lesser-seen: Star Wars", which is unfalsifiable unless you already know the
 * film. Shown as "7.2 · 22,843 votes · 1977" it takes a second and no expertise.
 *
 * Deliberately only what the planner actually recorded. A missing field is
 * omitted rather than guessed at, because a number invented here would be worse
 * than no number at all — it would look like evidence.
 */
export const evidenceFor = (p) => {
  const bits = [];
  const payload = p.payload || {};

  if (typeof payload.rating === 'number') bits.push(`${payload.rating.toFixed(1)} rating`);
  if (typeof payload.votes === 'number') bits.push(`${payload.votes.toLocaleString('en-AU')} votes`);
  if (payload.year) bits.push(String(payload.year));
  if (typeof payload.days_until === 'number') bits.push(`${payload.days_until} days away`);

  // Where it can actually be watched, US first — the same default the copy uses.
  const streaming = payload.streaming || {};
  const providers = streaming.US || streaming.UK || streaming.AU || [];
  const names = providers.map((x) => x?.provider_name || x?.name || x).filter((x) => typeof x === 'string');
  if (names.length) bits.push(names.slice(0, 3).join(', '));

  return bits;
};

/** The public article this post points at, if it has one. */
export const articleLink = (p) => {
  if (p.post_type === 'trending') return `${SITE_URL}/whats-on/chart`;
  return p.slug ? `${SITE_URL}/whats-on/${p.slug}` : null;
};
