// Builds a self-contained brief for one post: everything an AI worker needs to
// write the copy, with no access to this repo's internals required. The brief
// is plain markdown so any model or agent (Claude Code, Codex, a human) can
// read it and produce the JSON the contract expects.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY_FIELDS, POST_TYPE_BRIEFS, GUIDE_FIELDS, GUIDE_ARCHETYPE_BRIEFS } from './schema.mjs';

const VOICE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'VOICE.md');

let voiceCache = null;
const voice = async () => (voiceCache ??= await readFile(VOICE_PATH, 'utf8'));

const fieldTable = COPY_FIELDS
  .map(([name, type, desc]) => `- \`${name}\` (${type}): ${desc}`)
  .join('\n');

const sourceList = (research) => {
  const urls = research.flatMap(r => r.sources || []);
  if (!urls.length) return '(none resolved — search the web yourself)';
  return urls.map(s => `- ${s.title}: ${s.url}`).join('\n');
};

// Question posts get their own short brief: one tight question, no card, no
// article. Text-only for Threads + X.
//
// The planner anchors every question to a real title (payload.title +
// tmdb_refs), so the brief names it and points the worker at the web for that
// title's recent news. Rows planned before questions went topical carry
// `{topic: {mode: 'generic'}}` and no title — they still get a valid brief via
// the generic fallback below, so a part-planned week doesn't break.
const QUESTION_HOOKS = {
  out_today: () => 'It came out today.',
  just_out: (when) => (when ? `It came out on ${when}.` : 'It came out recently.'),
  airing: (when) => (when ? `Its latest episode aired on ${when}.` : "It's airing right now."),
};
const DEFAULT_HOOK = () => "It's out now.";

export const buildConversationBrief = async (post) => {
  const topic = post.payload?.topic || {};
  const subject = post.payload?.title || (Array.isArray(post.tmdb_refs) ? post.tmdb_refs[0] : null);
  const name = subject?.title || null;
  const mediaType = subject?.media_type || null;
  const tmdbId = subject?.tmdb_id ?? subject?.id ?? null;

  let prompt;
  let sources = '';
  if (name) {
    const isTv = mediaType === 'tv';
    const kind = isTv ? 'TV show' : 'film';
    const angles = isTv
      ? 'how the latest episode landed, reviews, a renewal or cancellation, where the season is heading, a casting or cast-exit story'
      : 'reviews and the critical split, box office, audience reaction, an awards push, a sequel or franchise story';
    const hookLine = (QUESTION_HOOKS[topic.hook] || DEFAULT_HOOK)(topic.when_label);
    prompt = `One genuine question about **${name}** (${kind}). ${hookLine}

It's out, so join the conversation that's already happening rather than
speculating: whether people have got to it yet, what they made of it, how it
sits against expectations or against the rest of ${isTv ? "the show" : "the genre"}.
Name ${name} in the question so the hook is obvious.

**Research it first.** Search the web for what's actually being said about
${name}: ${angles}. Use only what you can verify from a page you actually
loaded. If nothing turns up, ask about the release plainly — never invent a plot
point, a date, a cast member, a number or a review.`;
    if (tmdbId && mediaType) {
      sources = `
## Starting point
- TMDB — ${name}: https://www.themoviedb.org/${mediaType}/${tmdbId}

Search beyond this for anything recent. Don't cite TMDB scores or vote counts.
`;
    }
  } else {
    // Legacy generic row (planned before questions became topical).
    prompt = `One genuine, GENERIC question that sparks replies — the kind any film/TV lover
can answer (a comfort watch, a hot take, an underrated pick, a guilty pleasure).
It must be evergreen: NEVER tied to a specific film/show, a new release, or
whatever is trending right now. No title names at all.`;
  }

  return `# Copy job: question (text-only, Threads + X)

Post id: \`${post.id}\`
Write your answer to: \`marketing/copy/jobs/${post.id}.copy.json\`

## What to write
${prompt}

Keep it TIGHT: a sharp question, then at most one short line. **End on the
question mark** — that's the default and almost always the strongest ending.
Never add an explanatory trailer like "…just genuinely curious what everyone
thinks", and do NOT close with "No wrong answers" — it's retired for being used
on nearly every question. A closing line is optional; if one genuinely earns its
place, write a fresh one. No hashtags, no links, no emoji strings. Must fit 280
characters.

**No spoilers**, and the question has to land for someone who hasn't seen it —
never assume the reader already watched.
${sources}
## Output — a single JSON object
- \`question\` (string): the post text, used verbatim on both Threads and X.

Write ONLY the JSON object to the output file. No markdown fences, no commentary.

## Voice guide (follow exactly — see the "Question posts" section)
${await voice()}
`;
};

// Guide posts: a web-only long-form SEO article. The titles to cover are in
// tmdb_refs; the worker writes a listicle-style page_body about them. No social
// copy. The picks' links to title pages are added at render time, not by the
// worker — so the worker just names the titles in prose.
const guideFieldTable = GUIDE_FIELDS
  .map(([name, type, desc]) => `- \`${name}\` (${type}): ${desc}`)
  .join('\n');

export const buildGuideBrief = async (post) => {
  const archetype = post.payload?.archetype || 'best_of';
  const guidance = GUIDE_ARCHETYPE_BRIEFS[archetype] || GUIDE_ARCHETYPE_BRIEFS.best_of;
  const refs = Array.isArray(post.tmdb_refs) ? post.tmdb_refs : [];
  const titleList = refs.length
    ? refs.map((r, i) => `${i + 1}. ${r.title} (${r.media_type === 'tv' ? 'TV' : 'film'})`).join('\n')
    : '(none — skip and leave this post for the next run)';
  return `# Copy job: guide (web-only long-form article for theplot.tv/whats-on)

Post id: \`${post.id}\`
Write your answer to: \`marketing/copy/jobs/${post.id}.copy.json\`

## What this guide is
${guidance}

## Context (facts — do not invent platforms, genres, or titles not listed here)
\`\`\`json
${JSON.stringify(post.payload, null, 2)}
\`\`\`

## Titles to cover, in this exact order — do not reorder, skip, add, or merge any
${titleList}

## How to write it
- A finished editorial guide in PLOT's voice — never narrate your sources or research.
- \`page_body\` MUST have exactly ${refs.length + 2} paragraphs, in this exact
  shape: [1] an intro that frames the list, then [2..${refs.length + 1}] ONE
  paragraph per title above, in the SAME order, one-to-one — never combine two
  titles into one paragraph and never split one title across two — each naming
  the title, making the case, and naming where it streams when you know it, then
  [${refs.length + 2}] a one-line close. This exact count and order is required:
  the site places each title's image next to its own paragraph using this
  alignment, so a miscount or reorder breaks the page.
- Do your own light web research for current reception/context, but only feature
  the titles listed above. Paraphrase always; never quote reviews or copy synopses.
- No spoilers, no links (we add the title-page links), no hashtags, no dashes.
- Put every source you consulted into \`sources\` (review-only, never shown).

## Output — a single JSON object with exactly these fields
${guideFieldTable}

Write ONLY the JSON object to the output file. No markdown fences, no commentary.

## Voice guide (follow exactly)
${await voice()}
`;
};

/**
 * @returns {string} markdown brief for a single planned post.
 * @param {object} post  a marketing_posts row (needs id, post_type, payload)
 * @param {Array}  research  research pack from enrichPost() (may be empty)
 */
export const buildBrief = async (post, research = []) => {
  const brief = POST_TYPE_BRIEFS[post.post_type] || '';
  const outFile = `${post.id}.copy.json`;
  const hasResearch = research.length > 0;
  return `# Copy job: ${post.post_type}

Post id: \`${post.id}\`
Write your answer to: \`marketing/copy/jobs/${outFile}\`

## What this post is
${brief}

## Social facts (for x / instagram / threads: state ONLY what is here — never add dates, cast, or platforms not present)
\`\`\`json
${JSON.stringify(post.payload, null, 2)}
\`\`\`

## Research pack for the article (extended TMDB + Wikipedia — free, pre-fetched)
${hasResearch
    ? `\`\`\`json\n${JSON.stringify(research.map(r => ({ title: r.title, ratings: r.ratings, tmdb: r.tmdb, wikipedia: r.wikipedia })), null, 2)}\n\`\`\``
    : '(no structured research resolved for this post — rely on web research)'}

## Mandatory title baseline
- TMDB: use it to verify the title ID, basic credits, poster paths and initial metadata.
- OMDb: use its pre-fetched IMDb, Rotten Tomatoes and Metacritic fields when present.
- These are research inputs, never reader-facing provenance or a substitute for reporting and criticism.

### Starting sources to consult / browse further
${sourceList(research)}

## How to write the article (page_body)
Write a short-to-medium blog post (4-8 short paragraphs) for theplot.tv/whats-on.
- Write a FINISHED editorial article in PLOT's own voice — NEVER narrate your
  sources or research. Banned phrasings (do not write these or anything like
  them): "the research pack", "pre-fetched ratings", "the ratings block", "in
  wider reporting", "recent coverage", "sources say", "reports suggest",
  "according to", "it's been reported", "the data shows". State facts directly as
  PLOT's own knowledge and weave them in naturally — e.g. write "Obsession holds a
  95% on Rotten Tomatoes and an 8.2 on IMDb" NOT "the pre-fetched ratings are
  strong: 95% on Rotten Tomatoes". The reader must never sense a research pack
  existed. Make it a confident editorial take, not a recap of what the sources say.
- Use the research pack above, AND do your own light web research for current
  critical reception, cast/production context, and recent news.
- Give the article one distinct, sourced angle that changes how a reader sees
  the title: a production choice, collaboration, source-material change,
  festival response, craft decision, release-history wrinkle or interview detail.
  Weave it into the writing; never label it a "fun fact" or a trivia aside.
- Ratings: cite ONLY the pre-fetched \`ratings\` block above (IMDb, Rotten
  Tomatoes, Metacritic) — it is reliable, so do not scrape or web-search for
  scores. If a rating is null, omit it; only include ratings when they add value.
  Never cite TMDB scores or vote counts (tmdb.vote_average / vote_count are an
  internal signal only), and never describe how many people voted.
- Always paraphrase in PLOT's voice. Never quote reviews verbatim, never copy
  Wikipedia sentences, never reproduce a synopsis word-for-word. No spoilers.
- Put every source you actually used or browsed into the \`sources\` array
  (the links above plus anything you found). It is stored for our review only,
  not shown on the page.
- The social copy (x/instagram/threads) stays tight and caption-length — the
  article is the long-form piece, not the captions.

## Output — a single JSON object with exactly these fields
${fieldTable}

Write ONLY the JSON object to the output file. No markdown fences, no commentary.

## Voice guide (follow exactly)
${await voice()}
`;
};
