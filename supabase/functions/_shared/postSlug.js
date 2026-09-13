// The article slug ends in the day the post was scheduled for when the copy was
// generated (see marketing/lib/feed.mjs postSlug). Rescheduling used to leave
// that suffix alone on purpose, so the URL never moved. The catalogue showed
// the cost: eleven live articles whose displayed date disagreed with their URL
// by up to sixteen days, with body copy ("now available", "earlier this
// month") written for the old day.
//
// The URL only matters once it is public. Before a post has published, moving
// the suffix to the new day is free; after, social posts already link to it
// and it must stay.

const DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;

export const PUBLIC_STATUSES = new Set(['published', 'partially_published']);

/**
 * The slug a post should carry after being rescheduled to `date` (YYYY-MM-DD).
 * Returns the slug unchanged when the post has already published, has no slug,
 * or the slug does not end in a date.
 */
export const rescheduledSlug = (slug, status, date) => {
  if (!slug || PUBLIC_STATUSES.has(status) || !DATE_SUFFIX_RE.test(slug)) return slug ?? null;
  return slug.replace(DATE_SUFFIX_RE, `-${date}`);
};
