// The email Plot sends before a Premium free trial ends. Stripe fires
// customer.subscription.trial_will_end (by default 3 days before trial_end) and
// stripe-webhook/index.ts turns it into this message. It is a billing notice,
// not marketing: the Terms promise a reminder before the first charge, and card
// network rules expect one, so it goes out regardless of alert preferences and
// carries no unsubscribe link.
//
// Pure, so it is tested with node --test (apps/web/tests/unit/trialReminderEmail.test.js)
// without Deno, Stripe or Resend. The date and amount come from Stripe and the
// manage link from operator configuration, so each is checked, never trusted.
import { APP_ORIGIN, REGISTERED_ADDRESS, escapeHtml } from './alertEmail.js';

/** Same verified Resend domain as the alerts. Replies go to support. */
export const TRIAL_REMINDER_FROM = 'Plot <billing@theplot.tv>';
export const TRIAL_REMINDER_REPLY_TO = 'support@theplot.tv';
/** Real route in apps/web/src/router.jsx; the operator can point it at staging via STRIPE_SETTINGS_URL. */
export const DEFAULT_MANAGE_URL = `${APP_ORIGIN}/settings`;

export const TRIAL_REMINDER_TEXT = Object.freeze({
  kicker: 'Your Premium trial',
  /** @param {string} date */
  subject: (date) => `Your plot Premium trial ends on ${date}`,
  /** @param {string} date */
  heading: (date) => `Your free trial ends on ${date}.`,
  /** @param {string} amount e.g. "US$3 a month" */
  charge: (amount) => `After that, your payment method will be charged ${amount}, taxes included, and Premium will renew automatically until you cancel.`,
  keep: 'Nothing to do if you want to keep Premium.',
  cancel: 'To cancel, open Manage subscription in Settings before the trial ends and you will not be charged.',
  button: 'Manage subscription',
  reason: 'You are getting this because you started a plot Premium free trial. It is a billing notice, so it is sent even if other emails are off.',
  help: 'Questions? Reply to this email or write to support@theplot.tv.',
});

/** Plan amount as a person would say it. @param {'monthly' | 'yearly'} plan */
export function planAmount(plan) {
  if (plan === 'monthly') return 'US$3 a month';
  if (plan === 'yearly') return 'US$24 a year';
  throw new Error('plan must be monthly or yearly');
}

/**
 * Plot plan from a Stripe price. Anything that is not one of the two Premium
 * prices is refused rather than described wrongly in a billing email.
 * @param {{ currency?: string | null, unit_amount?: number | null, recurring?: { interval?: string | null } | null } | null | undefined} price
 * @returns {'monthly' | 'yearly' | null}
 */
export function planFromPrice(price) {
  if (!price || price.currency !== 'usd') return null;
  if (price.unit_amount === 300 && price.recurring?.interval === 'month') return 'monthly';
  if (price.unit_amount === 2400 && price.recurring?.interval === 'year') return 'yearly';
  return null;
}

/**
 * The day the trial ends, written out. Stripe gives a UTC instant; people are
 * anywhere, so the email says UTC rather than guessing a time zone.
 * @param {number} trialEndSeconds Stripe trial_end (unix seconds)
 */
export function trialEndLabel(trialEndSeconds) {
  if (!Number.isInteger(trialEndSeconds) || trialEndSeconds <= 0) throw new Error('trialEnd must be a unix timestamp');
  const d = new Date(trialEndSeconds * 1000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} (UTC)`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** @param {string} url */
function checkedUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('manageUrl is not a valid URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('manageUrl must be http(s)');
  return parsed.toString();
}

// Palette and type mirror alertEmail.js, so the two read as one sender.
const PAPER = '#F8F2EA', CARD = '#FFFCF7', INK = '#292924', FAINT = '#6B655D', HAIR = '#e6dfd3';
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const DISPLAY = "'Gabarito', 'DM Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Gabarito:wght@600;700&display=swap';

/**
 * @param {{ trialEnd: number, plan: 'monthly' | 'yearly', manageUrl?: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildTrialReminderEmail({ trialEnd, plan, manageUrl = DEFAULT_MANAGE_URL }) {
  const date = trialEndLabel(trialEnd);
  const amount = planAmount(plan);
  const manage = checkedUrl(manageUrl);
  const T = TRIAL_REMINDER_TEXT;
  const subject = T.subject(date);

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<link href="${FONT_LINK}" rel="stylesheet">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:30px 12px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:520px;background:${CARD};border:1px solid ${HAIR};border-radius:16px;">
      <tr><td style="padding:30px 30px 8px;">
        <img src="${APP_ORIGIN}/logo-email.png" width="56" height="31" alt="plot" style="display:block;width:56px;height:31px;border:0;font-family:${DISPLAY};font-size:30px;font-weight:700;line-height:1;color:${INK};">
        <div style="font-family:${SANS};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};margin-top:10px;">${escapeHtml(T.kicker)}</div>
      </td></tr>
      <tr><td style="padding:6px 30px 0;">
        <div style="font-family:${SANS};font-size:20px;line-height:1.35;color:${INK};font-weight:700;">${escapeHtml(T.heading(date))}</div>
        <div style="font-family:${SANS};font-size:15px;line-height:1.55;color:${INK};margin-top:14px;">${escapeHtml(T.charge(amount))}</div>
        <div style="font-family:${SANS};font-size:15px;line-height:1.55;color:${INK};margin-top:14px;">${escapeHtml(T.keep)} ${escapeHtml(T.cancel)}</div>
      </td></tr>
      <tr><td style="padding:22px 30px 30px;">
        <a href="${escapeHtml(manage)}" style="display:inline-block;color:${INK};border:1px solid ${INK};text-decoration:none;font-family:${SANS};font-size:14px;font-weight:600;padding:11px 24px;border-radius:999px;">${escapeHtml(T.button)}</a>
      </td></tr>
      <tr><td style="padding:20px 30px 24px;border-top:1px solid ${HAIR};background:#fafafa;border-radius:0 0 16px 16px;">
        <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${FAINT};">
          ${escapeHtml(T.reason)}<br>
          ${escapeHtml(T.help)}<br>
          ${escapeHtml(REGISTERED_ADDRESS)}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    T.kicker,
    '',
    T.heading(date),
    T.charge(amount),
    `${T.keep} ${T.cancel}`,
    '',
    `${T.button}: ${manage}`,
    '',
    T.reason,
    T.help,
    REGISTERED_ADDRESS,
  ].join('\n');

  return { subject, html, text };
}
