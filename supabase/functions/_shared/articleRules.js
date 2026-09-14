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

// House style writes film and show titles bare, but a writer quoting one is
// making a style slip, not passing off a review as PLOT's own words, and the
// two need different advice. A title carries no sentence punctuation and is
// capitalised like a title ("Blades of the Guardians: Wind Rises in the
// Desert"); a lifted sentence has commas or a full stop, or reads as prose.
const looksLikeTitle = (span) => {
  if (/[,.;!?]/.test(span)) return false;
  const major = span.split(/\s+/).filter(w => w.length >= 4);
  return major.length > 0 && major.every(w => /^[A-Z0-9]/.test(w));
};

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

// The reader must never be shown the seams of the pipeline. Two published
// articles told them outright that PLOT had failed to check something.
const EXPOSED_RESEARCH = [
  /\b(?:could not|couldn't|cannot|can't|unable to|failed to)\s+(?:verify|confirm|find|resolve)\b/i,
  /\b(?:our|database|internal)\s+records\b/i,
  /\bno reliable (?:source|information|data)\b/i,
];

// Only the brief's pre-fetched block (IMDb, Rotten Tomatoes, Metacritic) may be
// cited. An audience score is neither reliable nor ours to quote.
const AUDIENCE_SCORE = /\baudience (?:score|rating)\b|\bpopcornmeter\b|\bverified hot\b/i;

// The post type is a label the site renders; repeating it in Title Case at the
// front of the headline is both duplication and a house-style break. "On This
// Day: Die Hard turns 38" shipped exactly this way.
const TITLE_CASE_LABEL = /^(?:On This Day|First Look|Trailer Drop|Watch Tonight|Hidden Gem|Now Streaming|Now At Home|Coming Soon|The Week Ahead|New This Week)\b/;

// PLOT defaults to US framing and US spelling. These are the forms that reach
// an article; words spelled the same either side of the Atlantic need no entry.
const UK_SPELLINGS = [
  [/\btheatres?\b/i, 'theater/theaters'],
  [/\bcentres?\b/i, 'center/centers'],
  [/\bcolours?\b/i, 'color/colors'],
  [/\bfavourites?\b/i, 'favorite/favorites'],
  [/\borganis(?:e|ed|ing|ation)\b/i, 'organize/organization'],
  [/\brealis(?:e|ed|ing)\b/i, 'realize'],
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
    if (quoted && looksLikeTitle(quoted[1])) {
      errors.push(`${field} puts a title in quotation marks ("${quoted[1].slice(0, 40)}…"); house style writes titles bare`);
    } else if (quoted) {
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
    for (const re of EXPOSED_RESEARCH) {
      const hit = re.exec(text);
      if (hit) {
        errors.push(`${field} shows the reader the research seams ("${hit[0]}"); cut the claim or write a shorter article`);
        break;
      }
    }
    const audience = AUDIENCE_SCORE.exec(text);
    if (audience) errors.push(`${field} cites an audience score ("${audience[0]}"); only the brief's IMDb, Rotten Tomatoes and Metacritic figures may be used`);
    for (const [re, better] of UK_SPELLINGS) {
      const hit = re.exec(text);
      if (hit) {
        errors.push(`${field} uses UK spelling ("${hit[0]}"); PLOT defaults to US spelling (${better})`);
        break;
      }
    }
    if (TMDB_RE.test(text)) errors.push(`${field} names TMDB; reference data never appears on the page`);
  }

  const label = TITLE_CASE_LABEL.exec(page_title);
  if (label) {
    errors.push(`page_title opens with the post type in Title Case ("${label[0]}"); the site renders that label itself, and headlines are sentence case`);
  }

  if (!guide && page_body.length) {
    const mentions = page_body.reduce((n, p) => n + (p.match(RATING_RE) || []).length, 0);
    if (mentions > MAX_RATING_MENTIONS) {
      errors.push(`page_body cites a rating ${mentions} times; one standout score is enough (max ${MAX_RATING_MENTIONS})`);
    }
    // The rule is about what the article LEAVES the reader with, so it looks at
    // the closing sentence, not the whole closing paragraph. A score cited
    // mid-paragraph on the way to a critical point is exactly the use the
    // guidelines want; only a score as the last word is the template.
    const last = page_body[page_body.length - 1];
    const sentences = last.split(/(?<=[.!?])\s+/).filter(Boolean);
    const closing = sentences[sentences.length - 1] || '';
    RATING_RE.lastIndex = 0;
    if (page_body.length > 1 && RATING_RE.test(closing)) {
      errors.push('page_body closes on a ratings sentence; end on the critical point, not the scores');
    }
    RATING_RE.lastIndex = 0;
  }

  return errors;
};

const SOCIAL_FIELDS = ['x', 'instagram', 'threads'];

// A rental is not "streaming". Two published posts said "X is now streaming"
// in their social copy for a film that had only reached the rent-or-buy
// stores, which is the one thing the voice guide is unambiguous about.
const CLAIMS_STREAMING = /\b(?:now streaming|streaming now|is streaming|are streaming|start(?:s|ed)? streaming|streaming on|hits? streaming|hit streaming|landed on streaming)\b/i;

/**
 * The same house rules, applied to the social captions. Shorter copy, so only
 * the checks that are about wording rather than article structure.
 *
 * @param {{x?: string, instagram?: string, threads?: string}} copy
 * @param {{home_kind?: string|null}} [opts]  'rental' forbids calling it streaming.
 */
export const socialErrors = (copy = {}, { home_kind } = {}) => {
  const errors = [];
  for (const field of SOCIAL_FIELDS) {
    const text = typeof copy[field] === 'string' ? copy[field] : '';
    if (!text) continue;
    if (DASH_RE.test(text)) {
      errors.push(`${field} contains an em or en dash; use a comma, colon or full stop`);
    }
    for (const re of NARRATED_RESEARCH.slice(0, 6)) {
      const hit = re.exec(text);
      if (hit) { errors.push(`${field} narrates research ("${hit[0]}"); state it as PLOT's own`); break; }
    }
    const audience = AUDIENCE_SCORE.exec(text);
    if (audience) errors.push(`${field} cites an audience score ("${audience[0]}")`);
    for (const [re, better] of UK_SPELLINGS) {
      const hit = re.exec(text);
      if (hit) { errors.push(`${field} uses UK spelling ("${hit[0]}"); PLOT defaults to US spelling (${better})`); break; }
    }
    if (home_kind === 'rental') {
      const hit = CLAIMS_STREAMING.exec(text);
      if (hit) errors.push(`${field} says "${hit[0]}" for a rental release; it is available to rent or buy, not streaming`);
    }
  }
  return errors;
};
