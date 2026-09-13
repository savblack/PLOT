// Mechanical checks on the theplot.tv article (page_title + page_body) that a
// brief alone kept failing to enforce. Shared by the Node pipeline (save.mjs via
// copySchema.js) and the Deno edge function that applies /copy edits, so a
// weaker model, or a tired human, cannot reintroduce them.
//
// Written after a full read of the live What's On catalogue on 13 September
// 2026 found the same defects across dozens of published articles: em dashes
// the field spec already banned, PLOT's own paraphrase wrapped in quotation
// marks so it read as an uncredited review quote, "critics kept coming back
// to" reception narration, a three-score ratings sentence bolted on as the
// closing paragraph of nearly every piece, and "an interesting detail:" trivia
// asides. Each of those is a regex, so each is checked here.
//
// Everything here is a hard error, not normalisation: the fix is editorial and
// belongs to whoever wrote the copy, not to a script guessing at prose.

// Em and en dashes only. Hyphens in compounds ("co-writer", "low-budget") and
// names ("Young-White") are correct English and are NOT dashes for this rule;
// stripping them produced "well built based on a true story dramas" and a
// misspelt surname.
const DASH_RE = /[–—]/;

// A quoted passage long enough to be a lifted sentence rather than a title or a
// two-word coinage. Reviews and interviews are paraphrased, never quoted.
const QUOTED_PASSAGE_RE = /["“]([^"”]{40,})["”]/;

// The reader must never sense a research pack or a review roundup behind the
// article. These are the phrasings the catalogue actually shipped.
const NARRATED_RESEARCH = [
  /\baccording to\b/i,
  /\breportedly\b/i,
  /\bit has been reported\b/i,
  /\bit's been reported\b/i,
  /\bsources say\b/i,
  /\breports (?:suggest|say|indicate)\b/i,
  /\bthe research pack\b/i,
  /\bpre-?fetched\b/i,
  /\bin wider reporting\b/i,
  /\brecent coverage\b/i,
  /\bthe data shows\b/i,
  /\bcritics (?:have|had|kept|generally|largely|mostly|widely|praised|called|described|identified|noted|agreed|were|are)\b/i,
  /\breviews? (?:have|has|landed|were|are|out of|described|praised|called)\b/i,
  /\bwhat critics\b/i,
  /\bcritical (?:reception|consensus) (?:proved|was|has been|is)\b/i,
];

// Trivia framing and the content-free closers the guidelines ban by name.
const FILLER = [
  /\bfun fact\b/i,
  /\bdid you know\b/i,
  /\bworth noting\b/i,
  /\ban interesting detail\b/i,
  /\binterestingly\b/i,
  /\bthe shape of an invitation\b/i,
  /\bwill earn the time\b/i,
  /\bwhat the watchlist is for\b/i,
  /\bnot background noise\b/i,
  /\bwhichever mood wins out\b/i,
  /\bworth adding to your (?:list|watchlist)\b/i,
];

// Reference data is an input, never on the page.
const TMDB_RE = /\bTMDB\b/;

const RATING_RE = /\b(?:IMDb|Rotten Tomatoes|Metacritic)\b/g;
// A standout score is worth a line; stacking all three is a template.
const MAX_RATING_MENTIONS = 2;

const paraLabel = (i) => `page_body[${i}]`;

/**
 * Article prose checks. Returns an array of human-readable errors (empty when
 * the article passes).
 *
 * @param {{page_title?: string, page_body?: string[]}} copy
 * @param {{guide?: boolean}} [opts]  guides are long lists with one paragraph
 *   per title, so the single-title ratings rules do not apply to them.
 */
export const articleErrors = ({ page_title = '', page_body = [] } = {}, { guide = false } = {}) => {
  const errors = [];
  const fields = [['page_title', page_title], ...page_body.map((p, i) => [paraLabel(i), p])];

  for (const [field, text] of fields) {
    if (!text) continue;
    if (DASH_RE.test(text)) {
      errors.push(`${field} contains an em or en dash; use a comma, colon or full stop (hyphens in compound words are fine)`);
    }
    const quoted = QUOTED_PASSAGE_RE.exec(text);
    if (quoted) {
      errors.push(`${field} quotes a passage ("${quoted[1].slice(0, 40)}…"); paraphrase in PLOT's voice instead of quoting`);
    }
    for (const re of NARRATED_RESEARCH) {
      const hit = re.exec(text);
      if (hit) {
        errors.push(`${field} narrates research or reception ("${hit[0]}"); state PLOT's own view directly`);
        break;
      }
    }
    for (const re of FILLER) {
      const hit = re.exec(text);
      if (hit) {
        errors.push(`${field} uses banned filler ("${hit[0]}")`);
        break;
      }
    }
    if (TMDB_RE.test(text)) errors.push(`${field} names TMDB; reference data never appears on the page`);
  }

  if (!guide && page_body.length) {
    const mentions = page_body.reduce((n, p) => n + (p.match(RATING_RE) || []).length, 0);
    if (mentions > MAX_RATING_MENTIONS) {
      errors.push(`page_body cites a rating ${mentions} times; one standout score is enough (max ${MAX_RATING_MENTIONS})`);
    }
    const last = page_body[page_body.length - 1];
    if (page_body.length > 1 && RATING_RE.test(last)) {
      RATING_RE.lastIndex = 0;
      errors.push('page_body ends on a ratings sentence; close on the critical point, not the scores');
    }
    RATING_RE.lastIndex = 0;
  }

  return errors;
};
