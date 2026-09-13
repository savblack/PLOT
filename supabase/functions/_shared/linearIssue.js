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

import { reason, platformsFor, articleLink, evidenceFor } from './postSummary.js';
import { HELP_TEXT } from './linearCommands.js';

const MEDIA_BUCKET = 'marketing';

const mediaUrl = (supabaseUrl, path) =>
  `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;

const aestDate = (iso, opts) =>
  new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', ...opts });

/**
 * The issue's due date, as the AEST calendar day the post actually runs on.
 *
 * NOT `scheduled_for.slice(0, 10)`. The planner schedules at 23:30 UTC, which is
 * already the next morning in Sydney, so slicing the UTC string gives the day
 * before the one the title and body both name — every post, not an edge case.
 * en-CA is the terse way to get YYYY-MM-DD out of toLocaleDateString, the same
 * trick the web desk uses for its day keys.
 */
export const dueDateFor = (post) =>
  new Date(post.scheduled_for).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

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

  // The claim, then the numbers behind it. A pick that does not fit its own
  // description should be arguable from the card alone.
  const evidence = evidenceFor(post);
  const parts = [
    `**${aestDate(post.scheduled_for, { weekday: 'long', day: 'numeric', month: 'long' })}** · ${reason(post)}`,
    ...(evidence.length ? ['', `*${evidence.join(' · ')}*`] : []),
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
  // A post can reach here with no copy at all — a row vetoed before the worker
  // ran, say. Say so, rather than rendering an issue that looks like the copy
  // went missing.
  if (!copy.x && !copy.instagram && !copy.threads && !copy.page_title) {
    parts.push('*No copy written yet.*', '');
  }
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

// ── Pull-request cards ───────────────────────────────────────────────────────
// The weekly timeline refresh (timeline-refresh.yml) opens a PR rather than
// committing, because a newly appended title lands with an empty note and the
// notes are title-specific jokes a human writes. That PR is a review job like
// any other, so it gets a card on the same board.

// Branch prefix and author of the PRs this board may act on.
//
// BOTH are checked before a merge, not just the prefix. The automerge job this
// replaced said why: "the branch prefix is guessable, so confirm the PR was
// opened by the bot rather than by a person pushing a branch that happens to
// match." That reasoning is stronger here than it was there. The PR a card
// points at comes from a Linear attachment, and attachments are editable by
// anyone who can edit the issue — so without these checks, commenting /approve
// on a card you had re-pointed would merge an arbitrary pull request into main.
// A comment box is not an authorization boundary.
export const PR_BRANCH_PREFIX = 'timeline-refresh/';
const PR_AUTHORS = ['github-actions[bot]', 'app/github-actions'];

/**
 * Is this a pull request the board is allowed to merge or close?
 * @returns null when allowed, otherwise the reason to refuse.
 */
export const prScopeRefusal = (pr) => {
  const branch = String(pr?.head?.ref ?? '');
  if (!branch.startsWith(PR_BRANCH_PREFIX)) {
    return `its branch is \`${branch || '(unknown)'}\`, not a \`${PR_BRANCH_PREFIX}\` refresh`;
  }
  const author = String(pr?.user?.login ?? '');
  if (!PR_AUTHORS.includes(author)) {
    return `it was opened by \`${author || '(unknown)'}\`, not the refresh bot`;
  }
  return null;
};

/** Issue title for a mirrored pull request. */
export const buildPrTitle = (pr) => `Website · ${pr.title}`;

/**
 * Issue body for a mirrored pull request.
 *
 * The PR's own body already explains the run and lists the entries needing a
 * note, so it is reproduced rather than summarised — the point of the card is to
 * let the decision happen without leaving Linear.
 */
export const buildPrDescription = (pr) => {
  const parts = [
    `**[${pr.title}](${pr.url})** · \`${pr.headRefName}\``,
    '',
    pr.body?.trim() || '_The pull request has no description._',
    '',
    '---',
    '',
    '<details><summary>How to review this from here</summary>',
    '',
    '`/approve` — merge the pull request (squash) once its checks are green.',
    '`/reject` — close it without merging. The next weekly run opens a fresh one.',
    '',
    'Checks are verified at the moment you approve, not when this card was made,',
    'so a refresh that went red stays open however long the card has been sitting.',
    '',
    '</details>',
  ];
  return parts.join('\n');
};

/** The PR number a mirrored card points at, from its Linear attachments. */
export const prNumberFromAttachments = (attachments, repo) => {
  const pattern = new RegExp(`^https://github\\.com/${repo}/pull/(\\d+)`, 'i');
  for (const a of attachments ?? []) {
    const hit = pattern.exec(String(a?.url ?? ''));
    if (hit) return Number(hit[1]);
  }
  return null;
};
