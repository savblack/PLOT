// /newsletter — retired. The newsletter has no archive and no page of its own;
// the signup is a section at the foot of What's On. Redirect here rather than
// upstream: the marketing-feed proxy doesn't forward a 3xx Location.
//
// Built from the request's own origin, not a hardcoded theplot.tv: on a Pages
// preview deploy an absolute production URL would bounce the reader out of the
// preview and onto the live site, which makes the redirect untestable there.
export function onRequest({ request }) {
  const { origin } = new URL(request.url);
  return Response.redirect(`${origin}/whats-on#newsletter`, 301);
}
