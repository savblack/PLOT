// /newsletter/<week-start> — retired along with the archive. Old issue links
// (and anything already indexed) land on the signup instead of a 404.
export function onRequest() {
  return Response.redirect('https://theplot.tv/whats-on#newsletter', 301);
}
