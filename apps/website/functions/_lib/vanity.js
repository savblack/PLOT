// Short social bio links: /ig, /x, /th → the homepage, UTM-tagged.
//
// Acquisition attribution only works if the link carries utm_* (Instagram's
// in-app browser mangles the referrer, so an untagged visit is indistinguishable
// from someone typing the domain). But Instagram and X render a profile link as
// its raw URL, and a visible "?utm_source=instagram&utm_medium=bio" looks like
// tracking junk in the bio. Tagging server-side keeps the bio clean and the
// attribution intact: apps/web reads these params back as first-touch source.
const BIO_SOURCES = Object.freeze({
  '/ig': 'instagram',
  '/x': 'x',
  '/th': 'threads',
});

/**
 * The homepage URL a vanity bio path should redirect to, or null if the path
 * isn't one. `m=story` lets a story-sticker link separate an active push on one
 * post from passive profile traffic, and `c` names the campaign.
 */
export function vanityTarget(url) {
  const source = BIO_SOURCES[url.pathname.replace(/\/+$/, '') || '/'];
  if (!source) return null;

  const target = new URL('/', url);
  target.searchParams.set('utm_source', source);
  target.searchParams.set('utm_medium', url.searchParams.get('m') === 'story' ? 'story' : 'bio');
  const campaign = url.searchParams.get('c');
  if (campaign) target.searchParams.set('utm_campaign', campaign.slice(0, 100));
  return target;
}
