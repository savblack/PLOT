// "Now on streaming": a tracked theatrical title's digital release is today.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate, formatDayMonth } from '../../lib/dates.mjs';

export const evaluate = async (ctx) => {
  const today = isoDate(ctx.publishAt);

  const candidates = ctx.tracked
    .filter(t => t.media_type === 'movie' && t.digital_date === today && !t.announced?.now_streaming)
    .filter(t => t.release_date && t.release_date < t.digital_date) // it actually moved cinema -> home
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (!candidates.length) return null;

  // Take the first candidate TMDB can actually place in a home: a subscription
  // service or a rent/buy store in at least one audience region. A digital_date
  // alone is a plan, not availability, and a post that says "now available at
  // home" with no platform to name (Toy Story 5, Mutiny, Minions & Monsters
  // all shipped that way) is the one thing the voice guide forbids outright.
  for (const pick of candidates) {
    const [details, home] = await Promise.all([
      tmdb.getDetails('movie', pick.tmdb_id),
      tmdb.getHomeRegions('movie', pick.tmdb_id).catch(() => null),
    ]);
    if (!home || !hasHomeProvider(home)) {
      console.log(`now_streaming: ${pick.title} has no home provider yet — skipping.`);
      continue;
    }
    return candidate(pick, details, home);
  }
  return null;
};

const REGIONS = ['US', 'UK', 'AU'];
const has = (lists, r) => (lists?.[r]?.length || 0) > 0;

export const hasHomeProvider = (home) =>
  REGIONS.some(r => has(home.streaming, r) || has(home.digital, r));

// How the title is arriving at home, US first: on a subscription service
// ('streaming') or as a digital rental/purchase ('rental'). A cinema release
// usually reaches the stores weeks before any service, and that is the moment
// most people can actually watch it, so it gets its own word everywhere the
// post is labelled (card kicker, feed kicker, copy brief) rather than being
// called "streaming".
export const homeKind = (home) => {
  for (const r of REGIONS) {
    if (has(home.streaming, r)) return 'streaming';
    if (has(home.digital, r)) return 'rental';
  }
  return null;
};

const candidate = (pick, details, home) => {
  return {
    post_type: 'now_streaming',
    topic_key: `now_streaming:movie:${pick.tmdb_id}`,
    tmdb_refs: [{ media_type: 'movie', id: pick.tmdb_id, title: pick.title }],
    announce: { tracked_id: pick.id, key: 'now_streaming' },
    payload: {
      home_kind: homeKind(home), // 'streaming' | 'rental' — drives every label on the post
      streaming: home.streaming, // subscription: { US:[…], UK:[…], AU:[…] } — name it in the copy (US default)
      digital: home.digital,     // rent/buy stores per region, for a rental arrival ("to rent on Prime Video")
      from_label: pick.release_date ? `In cinemas since ${formatDayMonth(pick.release_date)}` : null,
      title: {
        tmdb_id: pick.tmdb_id,
        media_type: 'movie',
        title: pick.title,
        poster_path: details?.poster_path,
        backdrop_path: details?.backdrop_path,
      },
    },
  };
};
