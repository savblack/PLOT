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

/**
 * @returns {string} markdown brief for a single planned post.
 * @param {object} post  a marketing_posts row (needs id, post_type, payload)
 * @param {string} outPath  where the worker must write its JSON answer
 */
export const buildBrief = async (post) => {
  const brief = POST_TYPE_BRIEFS[post.post_type] || '';
  const outFile = `${post.id}.copy.json`;
  return `# Copy job: ${post.post_type}

Post id: \`${post.id}\`
Write your answer to: \`marketing/copy/jobs/${outFile}\`

## What this post is
${brief}

## The facts (this is ALL you may state as true — never add dates, cast, or platforms not present here)
\`\`\`json
${JSON.stringify(post.payload, null, 2)}
\`\`\`

## Output — a single JSON object with exactly these fields
${fieldTable}

Write ONLY the JSON object to the output file. No markdown fences, no commentary.

## Voice guide (follow exactly)
${await voice()}
`;
};
