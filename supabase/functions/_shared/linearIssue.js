// How a marketing post renders as a Linear issue.
//
// Split out from the mirror itself so the body is a pure function of a row:
// same input, same markdown, no network. That is what lets the mirror re-render
// an issue whenever the post changes and compare cheaply, and it is what makes
// this testable under `node --test` without a Linear account.
//
// The issue is a VIEW of the row, never a second copy of it. It is rewritten
// from the database on every sync, which is also why edits arrive as comments
// rather than description edits — the description is ours to overwrite, and an
// operator's words typed into it would be lost the next time the post changed.

import { reason, platformsFor, articleLink } from './postSummary.js';
import { HELP_TEXT } from './linearCommands.js';

const MEDIA_BUCKET = 'marketing';

const mediaUrl = (supabaseUrl, path) =>
  `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;

const aestDate = (iso, opts) =>
  new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', ...opts });

const fence = (label, text) => (text ? `**${label}**\n\n\`\`\`\n${text}\n\`\`\`\n` : '');

/** The issue title: enough to recognise the post in a list, nothing more. */
export const buildTitle = (post) => {
  const day = aestDate(post.scheduled_for, { weekday: 'short', day: 'numeric', month: 'short' });
  const label = String(post.post_type).replace(/_/g, ' ');
  const subject = post.copy?.page_title || post.tmdb_refs?.[0]?.title || post.payload?.title || '';
  return subject ? `${day} · ${label} · ${subject}` : `${day} · ${label}`;
};

/**
 * The issue body: everything needed to decide whether this post should go out.
 * @param {object} post   a marketing_posts row (with its publication rows joined)
 * @param {string} supabaseUrl  project URL, for the public card images
 */
export const buildDescription = (post, supabaseUrl) => {
  const copy = post.copy || {};
  const platforms = platformsFor(post);
  const link = articleLink(post);
  const media = post.media || [];

  const parts = [
    `**${aestDate(post.scheduled_for, { weekday: 'long', day: 'numeric', month: 'long' })}** · ${reason(post)}`,
    '',
    platforms.length ? `Publishes to **${platforms.join(', ')}**.` : 'Web article only — never sent to social.',
    link ? `[Read the article ↗](${link})` : '',
    '',
  ];

  if (media.length) {
    parts.push('---', '');
    // Landscape only: Linear scales images to the column width, and the portrait
    // crop of the same card adds height without adding information.
    for (const [i, card] of media.entries()) {
      parts.push(`![card ${i + 1}](${mediaUrl(supabaseUrl, card.landscape_path)})`);
    }
    parts.push('');
  }

  parts.push('---', '');
  if (copy.x) parts.push(fence(`X · ${copy.x.length}/280`, copy.x));
  if (copy.instagram) parts.push(fence('Instagram', copy.instagram));
  if (copy.hashtags?.length) parts.push(`*${copy.hashtags.map((h) => `#${h}`).join(' ')}*`, '');
  if (copy.threads) parts.push(fence('Threads', copy.threads));
  if (copy.alt_text) parts.push(`*Alt text: ${copy.alt_text}*`, '');

  if (copy.page_title || copy.page_body?.length) {
    parts.push('---', '', `### ${copy.page_title || 'Article'}`, '');
    for (const para of copy.page_body || []) parts.push(para, '');
  }

  if (copy.sources?.length) {
    parts.push('<details><summary>Sources the writer used</summary>', '');
    for (const s of copy.sources) parts.push(`- [${s.title}](${s.url})`);
    parts.push('', '</details>', '');
  }

  parts.push('---', '', '<details><summary>How to review this from here</summary>', '', HELP_TEXT, '', '</details>');

  return parts.join('\n');
};
