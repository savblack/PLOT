// Words whose trailing full stop does not end a sentence ("Mr. Smith", "St. Louis").
const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|No|Inc|Ltd|Co)\.$/i;

/**
 * Split text into sentences. A stop only ends a sentence when it is followed by
 * whitespace and then something that looks like a new sentence, and it is not an
 * abbreviation, a single initial ("J. K."), or part of an ellipsis.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  const clean = (text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  const out = [];
  let start = 0;
  const re = /[.!?]+["')\]”’]*\s+(?=["'(“‘]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(clean))) {
    const end = m.index + m[0].trimEnd().length;
    const piece = clean.slice(start, end);
    if (/\.\.\.$|…$/.test(piece) || ABBREVIATIONS.test(piece) || /(?:^|\s)[A-Z]\.$/.test(piece)) continue;
    out.push(piece);
    start = m.index + m[0].length;
  }
  if (start < clean.length) out.push(clean.slice(start));
  return out;
}

/**
 * Shorten text to at most `maxChars` without ever stopping mid-sentence: whole
 * sentences are kept while they fit. If even the first sentence is longer than
 * the budget it is returned whole rather than cut, so the result always ends at
 * a sentence boundary (callers must let that line wrap, not clip it).
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
export function clampToSentences(text, maxChars) {
  const sentences = splitSentences(text);
  if (!sentences.length) return '';
  let result = sentences[0];
  for (let i = 1; i < sentences.length; i++) {
    const next = `${result} ${sentences[i]}`;
    if (next.length > maxChars) break;
    result = next;
  }
  return result;
}
