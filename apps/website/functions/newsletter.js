// /newsletter — retired. The newsletter has no archive and no page of its own;
// the signup is a section at the foot of What's On. Redirect here rather than
// upstream: the marketing-feed proxy doesn't forward a 3xx Location.
export function onRequest() {
  return Response.redirect('https://theplot.tv/whats-on#newsletter', 301);
}
