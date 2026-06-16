// The "What's On" feed: every marketing post is originally published as an
// entry on theplot.tv, and social posts link back to it.
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

export const entryUrl = (slug, utmSource = null) => {
  const base = `${SITE_URL}/${FEED_PATH}/${slug}`;
  return utmSource ? `${base}?utm_source=${utmSource}&utm_medium=organic_social` : base;
};

// The persistent trending-chart page (theplot.tv/whats-on/chart). Unlike a
// dated entry, the chart isn't a per-week article — it's one URL that updates
// weekly, so trending_chart social posts link here instead of an entryUrl.
export const chartUrl = (utmSource = null) => {
  const base = `${SITE_URL}/${FEED_PATH}/chart`;
  return utmSource ? `${base}?utm_source=${utmSource}&utm_medium=organic_social` : base;
};
