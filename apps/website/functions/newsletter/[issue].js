// /newsletter/<week-start> — retired along with the archive. Old issue links
// (and anything already indexed) land on the signup instead of a 404. Same
// origin-relative reasoning as ../newsletter.js.
export function onRequest({ request }) {
  const { origin } = new URL(request.url);
  return Response.redirect(`${origin}/whats-on#newsletter`, 301);
}
