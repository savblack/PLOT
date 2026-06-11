// Copy generation via the Claude API. One call per post returns per-platform
// copy variants as strict JSON (enforced with a forced tool call).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.MARKETING_COPY_MODEL || 'claude-sonnet-4-6';
const VOICE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'VOICE.md');

const COPY_TOOL = {
  name: 'submit_copy',
  description: 'Submit the final social copy for this post.',
  input_schema: {
    type: 'object',
    properties: {
      x: { type: 'string', description: 'X post text, <=280 chars, NO URLs, no hashtags' },
      instagram: { type: 'string', description: 'Instagram caption, hashtags on their own final line' },
      threads: { type: 'string', description: 'Threads post text. NO URLs — the system appends the article link.' },
      hashtags: { type: 'array', items: { type: 'string' }, description: '3-5 niche hashtags (no # prefix), Instagram only' },
      alt_text: { type: 'string', description: 'One-sentence literal description of the image' },
      cta_variant: { type: 'string', enum: ['track_it', 'whats_on_tonight', 'journal_it', 'none'] },
      page_title: { type: 'string', description: 'Headline for the theplot.tv article version of this post. Plain, specific, no clickbait, no dashes.' },
      page_body: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 short paragraphs for the article. Same voice, facts only from the payload, no links, no hashtags, no dashes of any kind.',
      },
    },
    required: ['x', 'instagram', 'threads', 'hashtags', 'alt_text', 'cta_variant', 'page_title', 'page_body'],
  },
};

const POST_TYPE_BRIEFS = {
  weekly_slate:
    'A "coming this week" roundup. Instagram and Threads get a carousel with one card per title ' +
    '(most popular first), so their captions can tease the 2-3 most exciting titles. X gets ONLY the ' +
    'top title\'s image — the X text must carry the rest: lead with the top title, then name the other ' +
    'titles compactly (e.g. "Also this week: A, B, and C"). Fit 280 characters; drop titles before truncating mid-name.',
  countdown: 'A countdown post. The payload says how many days remain until the release. Lead with the anticipation; the big number is on the image.',
  now_streaming: 'This title is available to stream at home starting today. Say where it\'s streaming if the payload includes providers.',
  trending_chart:
    'The weekly top-10 trending chart. Comment on the most interesting movement (a new entry, a big climb, a stubborn #1). ' +
    'X gets the full top-10 chart as its single image. ' +
    'Instagram and Threads get a carousel: chart 1-5, chart 6-10, then detail cards for the top 3.',
  trailer_drop: 'A new official trailer just dropped for this title. React to the trailer existing; never describe scenes you haven\'t been given.',
  on_this_day: 'A release anniversary. The payload says how many years. Invite reflection or a rewatch; no spoilers.',
};

export const generateCopy = async (post) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const voice = await readFile(VOICE_PATH, 'utf8');
  const brief = POST_TYPE_BRIEFS[post.post_type] || '';

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: `You write social media copy for PLOT. Follow this voice guide exactly:\n\n${voice}`,
      tools: [COPY_TOOL],
      tool_choice: { type: 'tool', name: 'submit_copy' },
      messages: [{
        role: 'user',
        content:
          `Post type: ${post.post_type}\n${brief}\n\n` +
          `Post data (everything you may claim as fact):\n${JSON.stringify(post.payload, null, 2)}\n\n` +
          'Write the copy for X, Instagram, and Threads, plus the theplot.tv article version ' +
          '(page_title + page_body). The article is the canonical home of this post; the social ' +
          'posts link to it.',
      }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const toolUse = data.content?.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('Claude returned no tool_use block');

  const copy = toolUse.input;
  // Hard guarantees regardless of what the model produced.
  if (/https?:\/\/|www\./i.test(copy.x)) throw new Error('Generated X copy contains a URL');
  if (copy.x.length > 280) copy.x = `${copy.x.slice(0, 277)}…`;
  return copy;
};
