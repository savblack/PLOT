// Length rules for the <title> and meta description of the public pages
// (title-page, marketing-feed). Search engines cut a title near 60 characters
// and a description near 160, and site audits flag anything past those as
// "too long" and a description under about 110 as "too short". Titles that run
// long were also being rewritten in results ("page and SERP titles do not
// match"), so the page picks the longest variant that still fits instead.

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

/**
 * The first candidate that fits within `max`, or the last one when none do.
 * Pass the most descriptive variant first and the barest last.
 */
export const fitTitle = (candidates: string[], max = TITLE_MAX) => {
  const list = candidates.filter(Boolean);
  return list.find((t) => t.length <= max) ?? list[list.length - 1] ?? '';
};

/**
 * Collapse whitespace and cut at the last word boundary under `max`, closing
 * with an ellipsis rather than mid-word. Text that already fits is untouched.
 */
export const clampDescription = (text: string, max = DESCRIPTION_MAX) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const head = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–(]+$/, '');
  return `${head}…`;
};
