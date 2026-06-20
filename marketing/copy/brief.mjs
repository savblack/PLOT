// Builds a self-contained brief for one post: everything an AI worker needs to
// write the copy, with no access to this repo's internals required. The brief
// is plain markdown so any model or agent (Claude Code, Codex, a human) can
// read it and produce the JSON the contract expects.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY_FIELDS, POST_TYPE_BRIEFS } from './schema.mjs';

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

// Conversation posts get their own short brief: one tight question, no card,
// no article. Text-only for Threads + X.
export const buildConversationBrief = async (post) => {
  return `# Copy job: question (text-only, Threads + X)

Post id: \`${post.id}\`
Write your answer to: \`marketing/copy/jobs/${post.id}.copy.json\`

## What to write
One genuine, GENERIC question that sparks replies — the kind any film/TV lover
can answer (a comfort watch, a hot take, an underrated pick, a guilty pleasure).
It must be evergreen: NEVER tied to a specific film/show, a new release, or
whatever is trending right now. No title names at all.

Keep it TIGHT: a sharp question, then at most one short line. End on the question
or a brief closer ("No wrong answers."); never an explanatory trailer like
"…just genuinely curious what everyone thinks". No hashtags, no links, no emoji
strings. Must fit 280 characters.

## Output — a single JSON object
- \`question\` (string): the post text, used verbatim on both Threads and X.

Write ONLY the JSON object to the output file. No markdown fences, no commentary.

## Voice guide (follow exactly — see the "Conversation posts" section)
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
