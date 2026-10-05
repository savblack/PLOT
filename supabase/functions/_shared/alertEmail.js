// The email for streaming alerts: one message per person per run, covering
// every film on their watchlist that has new streaming news.
//
// Pure, so it is tested with node --test (apps/web/tests/unit/alertEmail.test.js)
// without Deno or Resend. Edge Functions do not import from packages/core (the
// bundler only sees supabase/functions), so the wording of each line mirrors
// packages/core/copy/notifications.js (titleBadge / titlePhrase). The test pins
// the two together, so they cannot drift apart.
//
// Everything that reaches the HTML is escaped, subjects cannot carry a line
// break, and every link is checked, because titles and provider names come from
// TMDB and the person's own data.

/** The address mail is sent from (a verified Resend domain). */
export const ALERT_EMAIL_FROM = 'Plot <alerts@theplot.tv>';
/** Verified in packages/core/sharing.js (SHARE_ORIGIN). */
export const APP_ORIGIN = 'https://app.theplot.tv';
/** Real routes in apps/web/src/router.jsx. */
export const NOTIFICATIONS_URL = `${APP_ORIGIN}/notifications`;
export const MANAGE_URL = `${APP_ORIGIN}/settings?section=viewing`;
/** Same sender identity as the digest footer (marketing/newsletter/send-digest.mjs). */
export const REGISTERED_ADDRESS = 'SUSUMU HOUSE, Level 1, 63-73 Ann Street, Surry Hills, NSW 2010';

// The words. No em dashes (AGENTS.md); middots in the footer, as the digest has.
export const ALERT_EMAIL_TEXT = Object.freeze({
  untitled: 'A film on your watchlist',
  kicker: 'On your watchlist',
  badgeStreaming: 'Now streaming',
  badgeFree: 'Now free',
  button: 'Open plot',
  reason: 'You are getting this because you turned on email alerts for your watchlist in plot Settings.',
  unsubscribe: 'Unsubscribe',
  manage: 'Change this in Settings',
  tmdb: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
  /** @param {number} n */
  subjectMany: (n) => `${n} films on your watchlist have new streaming news`,
  /** @param {string | null | undefined} provider */
  streaming: (provider) => (provider ? `is on ${provider} now` : 'is streaming now'),
  /** @param {string | null | undefined} provider */
  free: (provider) => (provider ? `is free to watch on ${provider} now` : 'is free to watch now'),
});

/** @typedef {{ media_title?: string | null, media_poster_path?: string | null, release_kind?: string | null, provider_name?: string | null, tmdb_id?: number | null }} AlertItem */

// Palette mirrors the digest (packages/core/tokens.js, light).
const PAPER = '#F8F2EA', CARD = '#FFFCF7', INK = '#292924', FAINT = '#6B655D', PINK = '#B83558', HAIR = '#e6dfd3';
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** One line, no control characters: a subject cannot be used to inject headers. @param {string} s */
const oneLine = (s) => Array.from(s, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/\s+/g, ' ').trim();

/** @param {AlertItem} item */
const titleOf = (item) => oneLine(item.media_title || '') || ALERT_EMAIL_TEXT.untitled;
/** @param {AlertItem} item */
const isFree = (item) => item.release_kind === 'free';

/** Everything after the title, with no leading space. Mirrors titlePhrase. @param {AlertItem} item */
export function itemPhrase(item) {
  const provider = oneLine(item.provider_name || '') || null;
  return isFree(item) ? ALERT_EMAIL_TEXT.free(provider) : ALERT_EMAIL_TEXT.streaming(provider);
}

/** The small label. Mirrors titleBadge. @param {AlertItem} item */
export const itemBadge = (item) => (isFree(item) ? ALERT_EMAIL_TEXT.badgeFree : ALERT_EMAIL_TEXT.badgeStreaming);

/** @param {AlertItem[]} items */
export function emailSubject(items) {
  if (items.length === 1) return oneLine(`${titleOf(items[0])} ${itemPhrase(items[0])}`);
  return ALERT_EMAIL_TEXT.subjectMany(items.length);
}

/** A TMDB poster path is `/` plus a file name. Anything else is dropped, not interpolated. @param {string | null | undefined} path */
const posterSrc = (path) => (path && /^\/[A-Za-z0-9_.-]+$/.test(path) ? `https://image.tmdb.org/t/p/w154${path}` : null);

/** @param {string} url @param {string} name */
function checkedUrl(url, name) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`${name} is not a valid URL`); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(`${name} must be http(s)`);
  return parsed.toString();
}

/**
 * @param {AlertItem[]} items at least one
 * @param {{ unsubscribeUrl: string, manageUrl?: string, appUrl?: string }} links
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildAlertEmail(items, { unsubscribeUrl, manageUrl = MANAGE_URL, appUrl = NOTIFICATIONS_URL }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('an alert email needs at least one item');
  const unsub = checkedUrl(unsubscribeUrl, 'unsubscribeUrl');
  const manage = checkedUrl(manageUrl, 'manageUrl');
  const open = checkedUrl(appUrl, 'appUrl');
  const T = ALERT_EMAIL_TEXT;

  const rows = items.map((item) => {
    const poster = posterSrc(item.media_poster_path);
    const img = poster
      ? `<td width="64" valign="top" style="padding:0 14px 0 0;"><img src="${poster}" width="64" alt="" style="display:block;width:64px;border-radius:8px;border:0;"></td>`
      : '';
    return `<tr><td style="padding:14px 0;border-top:1px solid ${HAIR};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${img}
        <td valign="top">
          <div style="font-family:${SANS};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PINK};font-weight:700;">${escapeHtml(itemBadge(item))}</div>
          <div style="font-family:${SANS};font-size:17px;line-height:1.35;color:${INK};margin-top:4px;"><strong>${escapeHtml(titleOf(item))}</strong> ${escapeHtml(itemPhrase(item))}</div>
        </td>
      </tr></table>
    </td></tr>`;
  }).join('');

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(emailSubject(items))}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:30px 12px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:520px;background:${CARD};border:1px solid ${HAIR};border-radius:16px;">
      <tr><td style="padding:30px 30px 8px;">
        <div style="font-family:${SANS};font-size:30px;font-weight:700;letter-spacing:-0.04em;color:${INK};">plot</div>
        <div style="font-family:${SANS};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};margin-top:10px;">${escapeHtml(T.kicker)}</div>
      </td></tr>
      <tr><td style="padding:6px 30px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr>
      <tr><td style="padding:22px 30px 30px;">
        <a href="${escapeHtml(open)}" style="display:inline-block;color:${INK};border:1px solid ${INK};text-decoration:none;font-family:${SANS};font-size:14px;font-weight:600;padding:11px 24px;border-radius:999px;">${escapeHtml(T.button)}</a>
      </td></tr>
      <tr><td style="padding:20px 30px 24px;border-top:1px solid ${HAIR};background:#fafafa;border-radius:0 0 16px 16px;">
        <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${FAINT};">
          ${escapeHtml(T.reason)}<br>
          <a href="${escapeHtml(unsub)}" style="color:${FAINT};text-decoration:underline;">${escapeHtml(T.unsubscribe)}</a> &middot;
          <a href="${escapeHtml(manage)}" style="color:${FAINT};text-decoration:underline;">${escapeHtml(T.manage)}</a><br>
          ${escapeHtml(REGISTERED_ADDRESS)}<br>
          ${escapeHtml(T.tmdb)}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    T.kicker,
    '',
    ...items.map((item) => `${itemBadge(item)}: ${titleOf(item)} ${itemPhrase(item)}`),
    '',
    `${T.button}: ${open}`,
    '',
    T.reason,
    `${T.unsubscribe}: ${unsub}`,
    `${T.manage}: ${manage}`,
    REGISTERED_ADDRESS,
    T.tmdb,
  ].join('\n');

  return { subject: emailSubject(items), html, text };
}
