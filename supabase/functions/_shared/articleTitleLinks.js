const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[c]));

// Link the first prose mention of each verified title. Work on raw text before
// escaping so a title containing '&' cannot accidentally match HTML entities.
export function linkArticleTitles(text, refs, linked = new Set()) {
  const source = String(text);
  const lower = source.toLocaleLowerCase('en-US');
  let cursor = 0;
  let html = '';
  const boundary = (ch) => !ch || !/[\p{L}\p{N}]/u.test(ch);
  while (cursor < source.length) {
    let best = null;
    for (const ref of refs) {
      if (!ref?.href || !ref?.title || linked.has(ref.href)) continue;
      const needle = String(ref.title).toLocaleLowerCase('en-US');
      let at = lower.indexOf(needle, cursor);
      while (at >= 0 && (!boundary(source[at - 1]) || !boundary(source[at + needle.length]))) {
        at = lower.indexOf(needle, at + 1);
      }
      if (at >= 0 && (!best || at < best.at || (at === best.at && needle.length > best.length))) {
        best = { ref, at, length: needle.length };
      }
    }
    if (!best) break;
    html += esc(source.slice(cursor, best.at));
    html += `<a href="${esc(best.ref.href)}">${esc(source.slice(best.at, best.at + best.length))}</a>`;
    linked.add(best.ref.href);
    cursor = best.at + best.length;
  }
  return html + esc(source.slice(cursor));
}
