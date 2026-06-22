// The copy contract — the single source of truth for what an AI worker must
// produce for each post, and the validation boundary every worker's output
// must pass before it touches the database.
//
// This is deliberately model-agnostic. Claude Code, Codex, or any other agent
// produces the same JSON shape; save.mjs validates it here identically, so a
// weaker model can never corrupt the pipeline. Swapping the worker changes who
// fills these fields, never what "valid copy" means.

export const CTA_VARIANTS = ['track_it', 'whats_on_tonight', 'journal_it', 'none'];

// Field-by-field spec, rendered into every brief so the worker sees the exact
// contract it must satisfy. Keep this in lockstep with validateCopy below.
export const COPY_FIELDS = [
  ['x', 'string', 'X post text. <=280 characters. NO URLs. No hashtags.'],
  ['instagram', 'string', 'Instagram caption, 1-3 short paragraphs. Do NOT put the hashtags here — they go in the hashtags array.'],
  ['threads', 'string', 'Threads post text, one conversational thought. NO URLs (the system appends the article link). No hashtags.'],
  ['hashtags', 'string[]', '3-5 niche hashtags for Instagram only, WITHOUT the # prefix, no spaces (e.g. "A24", "mikeflanagan").'],
  ['alt_text', 'string', 'One-sentence literal description of the image for accessibility.'],
  ['cta_variant', `enum: ${CTA_VARIANTS.join(' | ')}`, 'Which approved CTA this post uses (or "none").'],
  ['page_title', 'string', 'Headline for the theplot.tv article. Plain, specific, sentence case, no clickbait, no dashes.'],
  ['page_body', 'string[]', '4-8 short paragraphs forming a short-to-medium blog post for theplot.tv/whats-on. Same voice. Draw on the research pack in this brief AND your own web research; always paraphrase in PLOT\'s voice, never quote reviews or copy Wikipedia sentences. No spoilers, no links, no hashtags, no dashes of any kind.'],
  ['sources', 'array of {title, url}', 'The sources you actually used or consulted (the TMDB/Wikipedia/IMDb links in the brief, plus anything you browsed). Stored for our review only, never shown publicly. Use [] if you used none.'],
];

// Per-post-type guidance. Moved here (was inline in the old Claude client) so
// the brief generator and any future tooling share one definition.
export const POST_TYPE_BRIEFS = {
  upcoming:
    'An "Upcoming this week" roundup. Instagram and Threads get a carousel with one card per title ' +
    '(most popular first), so their captions can tease the 2-3 most exciting titles. X gets ONLY the ' +
    'top title\'s image — the X text must carry the rest: lead with the top title, then name the other ' +
    'titles compactly (e.g. "Also this week: A, B, and C"). Fit 280 characters; drop titles before truncating mid-name.',
  countdown: 'A countdown post. The payload says how many days remain until the release. Lead with the anticipation; the big number is on the image.',
  now_streaming: 'This title is available to stream at home starting today. ALWAYS name the platform it\'s on — lead with the US provider from the payload\'s `streaming` object (US default), adding UK/AU only if they differ. Never guess a platform that isn\'t in the data.',
  trending:
    'The weekly top-10 trending chart. Comment on the most interesting movement (a new entry, a big climb, a stubborn #1). ' +
    'X gets the full top-10 chart as its single image. ' +
    'Instagram and Threads get a carousel: chart 1-5, chart 6-10, then detail cards for the top 3.',
  trailer: 'A new official trailer just dropped for this title. React to the trailer existing; never describe scenes you haven\'t been given.',
  on_this_day: 'A release anniversary. The payload says how many years. Invite reflection or a rewatch; no spoilers.',
  watch_tonight: 'A "what to watch tonight" pick — a title streaming right now. Make a quick, genuine case for tonight, and ALWAYS name the platform it\'s on (US default from the payload\'s `streaming` object).',
  hidden_gem: 'A "hidden gem" — an older film (1980s onwards) worth resurfacing, streamable now. Briefly say why it holds up; ALWAYS name the platform it\'s on (US default). No spoilers.',
};

// ── Guides: web-only long-form SEO articles (post_type 'guide') ──
// No social copy — only the article fields. The worker writes a longer
// page_body (one short paragraph per pick) and a search-shaped page_title.
export const GUIDE_FIELDS = [
  ['page_title', 'string', 'Article headline, search-shaped and plain (e.g. "The best sci-fi on Max right now" or "If you loved Severance, watch these next"). Sentence case, no clickbait, no dashes.'],
  ['page_body', 'string[]', '6-16 short paragraphs: an intro that frames the list, then ONE short paragraph per title (name the title, say why it earns its spot, name where it streams when known), then a one-line close. PLOT\'s voice; paraphrase, never quote reviews or copy synopses; no spoilers, no links, no hashtags, no dashes.'],
  ['sources', 'array of {title, url}', 'Sources you actually consulted. Stored for review only, never shown. Use [] if none.'],
];

export const GUIDE_ARCHETYPE_BRIEFS = {
  best_of: 'A "best of" guide for a genre on a streaming platform. Open with why this genre is worth seeking out on this platform right now, then cover each title in the list (most worth watching first). Only discuss titles in the provided list — they are confirmed streaming on that platform.',
  similar: 'A "if you liked X, watch these next" guide. Open by naming the anchor title and what makes it special, then make the case for each recommendation and how it scratches the same itch.',
  where_to_watch: 'A "where to watch X" guide. Open with the title and a quick sense of why people are searching for it, then cover how/where to watch and a couple of similar picks from the list.',
};

const hasUrl = (s) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|tv|net|org|io|co)\b/i.test(s);

/**
 * Validate and normalize a worker's copy output.
 * Returns { valid, errors: string[], copy } — `copy` is the normalized object
 * (safe to persist) when valid. Hard failures reject the post; normalization
 * silently fixes mechanical issues (trailing whitespace, # prefixes, over-length X).
 */
export const validateCopy = (raw) => {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['copy is not an object'], copy: null };
  }

  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const copy = {
    x: str(raw.x),
    instagram: str(raw.instagram),
    threads: str(raw.threads),
    hashtags: Array.isArray(raw.hashtags)
      ? raw.hashtags.map(h => String(h).trim().replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean)
      : [],
    alt_text: str(raw.alt_text),
    cta_variant: str(raw.cta_variant),
    page_title: str(raw.page_title),
    page_body: Array.isArray(raw.page_body)
      ? raw.page_body.map(str).filter(Boolean)
      : (str(raw.page_body) ? [str(raw.page_body)] : []),
    // Optional, internal-only: the sources the worker used. Kept off the public
    // page; surfaced in the veto digest for attribution review.
    sources: Array.isArray(raw.sources)
      ? raw.sources
          .map(s => ({ title: str(s?.title) || str(s?.url), url: str(s?.url) }))
          .filter(s => /^https?:\/\//i.test(s.url))
      : [],
  };

  // Required, non-empty.
  for (const field of ['x', 'instagram', 'threads', 'alt_text', 'page_title']) {
    if (!copy[field]) errors.push(`${field} is empty`);
  }
  // The article must read like a short-to-medium blog post, not a caption.
  if (copy.page_body.length < 3) {
    errors.push(`page_body needs at least 3 paragraphs (got ${copy.page_body.length})`);
  }

  // Hard platform guarantees — the same ones the API path enforced.
  if (hasUrl(copy.x)) errors.push('x contains a URL (never allowed on X)');
  if (hasUrl(copy.threads)) errors.push('threads contains a URL (system appends the link)');
  if (/#\w/.test(copy.x)) errors.push('x contains a hashtag (not allowed on X)');
  if (/#\w/.test(copy.threads)) errors.push('threads contains a hashtag (not allowed on Threads)');

  if (copy.hashtags.length < 3 || copy.hashtags.length > 5) {
    errors.push(`hashtags must be 3-5 items (got ${copy.hashtags.length})`);
  }
  if (!CTA_VARIANTS.includes(copy.cta_variant)) {
    errors.push(`cta_variant must be one of ${CTA_VARIANTS.join(', ')} (got "${copy.cta_variant}")`);
  }

  // Normalization that can't fail: keep X within the hard limit.
  if (copy.x.length > 280) copy.x = `${copy.x.slice(0, 279)}…`;

  return { valid: errors.length === 0, errors, copy };
};

// Guide posts are web-only long-form articles: no social copy, just a headline
// and a multi-paragraph body (+ optional sources). page_body runs longer than a
// normal entry (a listicle of 8-12 picks). Stored with empty social fields so
// the render + visibility paths are unchanged; generate.mjs never queues a guide
// to social.
export const validateGuide = (raw) => {
  const errors = [];
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const page_title = str(raw?.page_title);
  const page_body = Array.isArray(raw?.page_body)
    ? raw.page_body.map(str).filter(Boolean)
    : (str(raw?.page_body) ? [str(raw.page_body)] : []);
  const sources = Array.isArray(raw?.sources)
    ? raw.sources.map(s => ({ title: str(s?.title) || str(s?.url), url: str(s?.url) }))
        .filter(s => /^https?:\/\//i.test(s.url))
    : [];

  if (!page_title) errors.push('page_title is empty');
  if (page_body.length < 5) errors.push(`page_body needs at least 5 paragraphs (got ${page_body.length})`);
  if (page_body.length > 16) errors.push(`page_body is too long (${page_body.length} paragraphs; max 16)`);
  if (page_body.some(p => hasUrl(p))) errors.push('page_body contains a URL (links are added at render from tmdb_refs)');

  return {
    valid: errors.length === 0,
    errors,
    copy: { page_title, page_body, sources, cta_variant: 'none', x: '', instagram: '', threads: '', hashtags: [], alt_text: null },
  };
};

// Conversation posts are text-only (Threads + X): a single genuine question, no
// image, no article, no hashtags. The worker returns { question }. We store it
// as x + threads so the publish path is unchanged.
export const validateConversation = (raw) => {
  const errors = [];
  const question = String(raw?.question ?? raw?.x ?? '').trim();
  if (!question) errors.push('question is empty');
  if (hasUrl(question)) errors.push('question contains a URL (not allowed)');
  if (/#\w/.test(question)) errors.push('question contains a hashtag (not allowed)');

  const q = question.length > 280 ? `${question.slice(0, 279)}…` : question;
  return {
    valid: errors.length === 0,
    errors,
    copy: { x: q, threads: q, cta_variant: 'none', hashtags: [], alt_text: null },
  };
};
