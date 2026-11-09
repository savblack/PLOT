// Eastern Time date and title for an article review page.
export const dueDateFor = (post) =>
  new Date(post.scheduled_for).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export const buildTitle = (post) => {
  const day = new Date(post.scheduled_for).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
  });
  const label = String(post.post_type).replace(/_/g, ' ');
  const subject = post.copy?.page_title || post.tmdb_refs?.[0]?.title || post.payload?.title || '';
  return subject ? `${day} · ${label} · ${subject}` : `${day} · ${label}`;
};
