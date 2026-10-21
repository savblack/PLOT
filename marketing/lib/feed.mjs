// The "What's On" feed: marketing posts are originally published as entries
// on theplot.tv. The publisher currently links only Threads trending posts.
export const SITE_URL = 'https://theplot.tv';
export const FEED_PATH = 'whats-on';

export const slugify = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');

// One post per day, so a date suffix guarantees slug uniqueness.
export const postSlug = (title, scheduledFor) =>
  `${slugify(title)}-${String(scheduledFor).slice(0, 10)}`;

// String callers keep their original organic_social URLs. New callers pass the
// post's source, type, and ID so each social link has complete attribution.
const withUtm = (base, tracking) => {
  if (!tracking) return base;
  if (typeof tracking === 'string') {
    return `${base}?utm_source=${tracking}&utm_medium=organic_social`;
  }

  const { source, campaign, content } = tracking;
  if (!source || !campaign || content === undefined || content === null || content === '') {
    throw new Error('Social links require source, campaign, and content');
  }
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: 'social',
    utm_campaign: campaign,
    utm_content: String(content),
  });
  return `${base}?${params}`;
};

export const entryUrl = (slug, tracking = null) =>
  withUtm(`${SITE_URL}/${FEED_PATH}/${slug}`, tracking);

// The persistent trending-chart page (theplot.tv/whats-on/chart). Unlike a
// dated entry, the chart isn't a per-week article — it's one URL that updates
// weekly, so trending social posts link here instead of an entryUrl.
export const chartUrl = (tracking = null) =>
  withUtm(`${SITE_URL}/${FEED_PATH}/chart`, tracking);
