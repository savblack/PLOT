// Monday anchor: "coming this week" carousel of the next 7 days' notable releases.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate, addDays, formatWeekRange, formatWeekdayDayMonth } from '../../lib/dates.mjs';

const slimTitle = (item, whenLabel, where) => ({
  tmdb_id: item.id,
  media_type: item.media_type,
  title: item.title || item.name,
  release_kind: item.release_kind,
  when_label: whenLabel,
  where: where || null,
  overview: item.overview || null,
  poster_path: item.poster_path,
  backdrop_path: item.backdrop_path || null,
  popularity: item.popularity,
});

export const evaluate = async (ctx) => {
  if (ctx.weekday !== 'Monday') return null;

  const from = isoDate(ctx.publishAt);

  // This is the one post that reliably tells the site what is coming, so it
  // should not quietly disappear in a quiet release week. It used to: a 7-day
  // window yielding fewer than 3 titles returned null and let the fill ladder
  // run instead. Widen the window before giving up — a 10-day view still reads
  // as "what's next" — rather than lowering the 3-title bar, which is what
  // keeps the slate from looking threadbare.
  const SPANS = [6, 9];
  let to = addDays(from, SPANS[0]);
  let pool = [];

  for (const span of SPANS) {
    to = addDays(from, span);
    const { theatrical, digital, tv } = await tmdb.getReleasesInWindow(from, to);
    const seen = new Set();
    // Only titles actually releasing in this window — the source query can
    // over-return already-released titles, which would put a stale past date on
    // an "Upcoming this week" card (e.g. a film streaming for months).
    const inWindow = (item) => {
      const d = item.media_type === 'tv' ? item.first_air_date : item.release_date;
      return d && d >= from && d <= to;
    };
    pool = [...theatrical, ...digital, ...tv]
      .filter(item => item.poster_path)
      .filter(inWindow)
      .filter(item => (seen.has(`${item.media_type}:${item.id}`) ? false : seen.add(`${item.media_type}:${item.id}`)))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 6);
    if (pool.length >= 3) break;
  }

  // Ten days with fewer than three notable releases is a genuinely empty slate.
  // Let the ladder run rather than pad it out.
  if (pool.length < 3) return null;

  const titles = await Promise.all(pool.map(async (item) => {
    const dateStr = item.media_type === 'tv' ? item.first_air_date : item.release_date;
    // when_label is the date only ("Friday 19 June") — the card renders the
    // release kind as its own colored label. `where` stays in the payload for
    // the post copy; it is never rendered on the image.
    const whenLabel = dateStr ? formatWeekdayDayMonth(dateStr) : null;
    let where = null;
    if (item.release_kind !== 'cinema') {
      const providers = await tmdb.getWatchProviders(item.media_type, item.id).catch(() => []);
      if (providers.length) where = providers.slice(0, 2).map(p => p.provider_name).join(', ');
    }
    return slimTitle(item, whenLabel, where);
  }));

  return {
    post_type: 'upcoming',
    topic_key: `weekly_slate:${from}`,
    tmdb_refs: titles.map(t => ({ media_type: t.media_type, id: t.tmdb_id, title: t.title })),
    payload: { week_label: formatWeekRange(from, to), titles },
  };
};
