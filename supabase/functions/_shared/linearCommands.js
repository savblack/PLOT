// Parser for the slash commands you type into a Linear issue comment to drive
// the marketing review — the Linear equivalent of the buttons and the copy
// editor on the web desk (supabase/functions/admin-review/index.ts).
//
// Pure and runtime-agnostic on purpose: the edge function that receives Linear
// webhooks imports it, and marketing/tests/linear-commands.test.mjs exercises it
// under `node --test`. It only ever turns text into an intent — no network, no
// database, no decisions about what an intent is allowed to do.
//
// A comment is a command only if its first non-blank line starts with `/`.
// That single rule is also the loop guard: every comment this system posts back
// starts with the BOT_MARKER below, never a slash, so the webhook it triggers
// parses to null and stops there. (The Linear key authenticates as the operator
// rather than a bot user, so replies are indistinguishable by author — the
// shape of the text is what has to carry it.)

export const BOT_MARKER = '🤖 **PLOT**';

// Copy fields an operator can set from a comment, mapped to their column key in
// marketing_posts.copy. Aliases exist because nobody wants to type `page_title`
// on a phone. `sources` is deliberately absent: it records what the copy worker
// actually consulted, so a human overwriting it would be recording a fiction.
const FIELD_ALIASES = {
  x: 'x',
  twitter: 'x',
  instagram: 'instagram',
  ig: 'instagram',
  threads: 'threads',
  hashtags: 'hashtags',
  tags: 'hashtags',
  alt: 'alt_text',
  alt_text: 'alt_text',
  cta: 'cta_variant',
  cta_variant: 'cta_variant',
  title: 'page_title',
  page_title: 'page_title',
  body: 'page_body',
  page_body: 'page_body',
};

// Commands that take no argument, mapped to the action name used in
// marketing_review_events (matching the web desk's vocabulary exactly).
const SIMPLE_COMMANDS = {
  approve: 'approve',
  generate: 'generate',
  reject: 'reject',
  unapprove: 'unapprove',
  regenerate: 'regenerate',
  retry: 'retry',
  'publish-now': 'publish_now',
  publish_now: 'publish_now',
  pause: 'pause',
  resume: 'resume',
  help: 'help',
};

const EDIT_COMMANDS = new Set(['copy', 'edit']);

// Linear renders markdown, and a comment typed on mobile often arrives wrapped
// in formatting the operator never meant as content. Strip the wrappers that
// carry no meaning here, so `**x:** new text` is the same command as `x: text`.
const unwrap = (line) =>
  line
    .replace(/^\s*[-*+]\s+/, '')       // list bullet
    .replace(/^\s*>\s?/, '')           // block quote
    .replace(/\*\*/g, '')              // bold
    .replace(/^\s*`+|`+\s*$/g, '')     // inline code fences
    .trimEnd();

/**
 * Strip a code fence wrapping the whole comment.
 *
 * The help text shows the /copy example inside a fenced block, because that is
 * how you render a multi-line template legibly. Copy-paste it — the obvious
 * thing to do — and the fence comes with it, so the first line is ``` rather
 * than /copy, and the comment parsed as not-a-command: ignored in silence, no
 * reply, no edit. The bot's own help was teaching an input the bot rejected.
 *
 * So a fence around the whole thing is stripped rather than treated as content.
 * A fence INSIDE the comment is left alone, since that is legitimately part of
 * the text someone might be pasting.
 */
const unwrapCodeFence = (text) => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return text;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return text;
  const last = lines[lines.length - 1].trim();
  if (last !== '```') return text;
  return lines.slice(1, -1).join('\n');
};

const isFieldLine = (line) => {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(unwrap(line));
  if (!m) return null;
  const key = FIELD_ALIASES[m[1].toLowerCase()];
  return key ? { key, rest: m[2] } : null;
};

// Hashtags arrive however they were typed: "#A24, folk horror" or "a24 folkhorror".
// Normalize the same way validateCopy does, so what you see is what it stores.
const parseHashtags = (value) =>
  value
    .split(/[,\n]/)
    .flatMap((part) => part.trim().split(/\s+/))
    .map((tag) => tag.replace(/^#/, '').replace(/\s+/g, ''))
    .filter(Boolean);

// Paragraphs, blank-line separated — the same split the web desk's textarea uses
// (mergeCopyFromForm in admin-review), so both editors produce the same array.
const parseParagraphs = (value) =>
  value.split(/\n\s*\n/).map((p) => p.trim().replace(/\n+/g, ' ')).filter(Boolean);

/**
 * Commands that act on the whole week rather than on one post, so they do not
 * need the issue they are typed on to be a mirrored post at all.
 *
 * Without this distinction every command had to resolve to a row first, which
 * meant /pause — a global kill switch — only worked if you happened to be
 * looking at a mirrored card, and /generate could not work at all: it exists
 * precisely for when there is nothing on the board yet.
 */
export const WEEK_SCOPED = new Set(['pause', 'resume', 'generate', 'help']);

/**
 * Parse one Linear comment body into an intent.
 *
 * @param {string} body raw comment markdown
 * @returns {null | {
 *   command: string,          // the action name for marketing_review_events
 *   fields?: Record<string, unknown>, // for 'edit': the copy patch (changed keys only)
 *   date?: string,            // for 'reschedule': YYYY-MM-DD
 *   errors?: string[],        // malformed input the caller should report back
 * }} null when the comment is not addressed to us at all.
 */
export const parseCommand = (body) => {
  const text = unwrapCodeFence(String(body ?? ''));
  if (text.trimStart().startsWith(BOT_MARKER)) return null; // our own reply

  const lines = text.split(/\r?\n/);
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx === -1) return null;

  const head = unwrap(lines[firstIdx]).trim();
  if (!head.startsWith('/')) return null;

  const [rawName, ...argParts] = head.slice(1).split(/\s+/);
  const name = rawName.toLowerCase();
  const arg = argParts.join(' ').trim();
  const rest = lines.slice(firstIdx + 1);

  if (SIMPLE_COMMANDS[name]) return { command: SIMPLE_COMMANDS[name] };

  if (name === 'reschedule') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      return { command: 'reschedule', errors: [`"${arg || '(nothing)'}" is not a date — use /reschedule YYYY-MM-DD`] };
    }
    return { command: 'reschedule', date: arg };
  }

  if (!EDIT_COMMANDS.has(name)) {
    return { command: 'unknown', errors: [`Unknown command "/${name}".`] };
  }

  // Everything after the command line is field blocks. A line starts a new field
  // only when its key is one we know, so a colon inside prose ("Going in blind:
  // here's why") stays part of the value it belongs to.
  const blocks = new Map();
  let current = null;
  // `/copy x: text` — the argument on the command line itself is a field too.
  const headField = arg ? isFieldLine(arg) : null;
  if (headField) {
    current = headField.key;
    blocks.set(current, [headField.rest]);
  }

  for (const line of rest) {
    const field = isFieldLine(line);
    if (field) {
      current = field.key;
      blocks.set(current, field.rest ? [field.rest] : []);
    } else if (current) {
      blocks.get(current).push(unwrap(line));
    }
  }

  const errors = [];
  const fields = {};
  for (const [key, collected] of blocks) {
    const value = collected.join('\n').trim();
    if (!value) {
      errors.push(`${key} was given with no value — omit the line to leave it unchanged.`);
      continue;
    }
    if (key === 'hashtags') fields[key] = parseHashtags(value);
    else if (key === 'page_body') fields[key] = parseParagraphs(value);
    else fields[key] = value.replace(/\n+/g, ' ').trim();
  }

  if (!Object.keys(fields).length && !errors.length) {
    errors.push('No fields to change. Use `x:`, `instagram:`, `threads:`, `hashtags:`, `alt:`, `cta:`, `title:` or `body:`.');
  }

  return { command: 'edit', fields, ...(errors.length ? { errors } : {}) };
};

/**
 * Does this comment look like someone TRYING to run a command that did not parse?
 *
 * parseCommand returns null for anything not addressed to us, and silence is
 * right for ordinary conversation. It is wrong for a near miss: a /copy that
 * arrived fenced produced no reply at all, so the edit looked applied, the post
 * was approved on top of it, and it went to Scheduled carrying the old text.
 * Silence and success were indistinguishable at exactly the moment they differed.
 *
 * Narrow on purpose — a known command word on a line of its own, which is what a
 * misplaced attempt looks like. Mentioning `/approve` mid-sentence in prose does
 * not match, so talking about the commands stays possible.
 */
export const looksLikeAttempt = (body) => {
  const known = [...Object.keys(SIMPLE_COMMANDS), ...EDIT_COMMANDS, 'reschedule'].join('|');
  const pattern = new RegExp(`^\\s*/(${known})\\b`, 'im');
  return pattern.test(unwrapCodeFence(String(body ?? '')));
};

// The help text the bot replies with, kept next to the parser so the two can
// never disagree about what is actually accepted.
export const HELP_TEXT = [
  '`/approve` · `/reject` · `/unapprove` — the publish gate. Only approved posts are sent.',
  '`/reschedule 2026-09-18` — move it to another day.',
  '`/publish-now` — approve and send within minutes. `/retry` — re-queue failed platforms.',
  '`/regenerate` — throw the copy away and have the worker rewrite it.',
  '`/pause` · `/resume` — the global publishing switch (affects every post).',
  '`/generate` — build the coming week now, instead of waiting for Sunday.',
  '',
  // Named, not counted. This line used to say "the last three", which was true
  // until /generate was added above it and quietly made it point at /regenerate
  // — a post-scoped command it then told you to run on any card. A positional
  // reference into a list is wrong the moment the list changes; the test below
  // asserts these names against WEEK_SCOPED so the two cannot drift apart.
  '`/pause`, `/resume`, `/generate` and `/help` act on the whole week, so you can comment them on any card here.',
  '',
  'To edit copy, comment `/copy` and then only the lines you want to change.',
  'Delete the rest — anything you leave out keeps its current text.',
  '```',
  '/copy',
  'x: <new X text>',
  'threads: <new Threads text>',
  'hashtags: <tag, tag, tag>',
  'title: <new article headline>',
  'body:',
  '<first paragraph>',
  '',
  '<second paragraph>',
  '```',
  '',
  'Angle brackets are placeholders, not syntax. Pasting a line unedited writes',
  'the placeholder, so delete what you are not changing.',
].join('\n');
