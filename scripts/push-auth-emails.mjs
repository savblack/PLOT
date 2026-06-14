// Brand the Supabase auth emails (confirmation, recovery, magic link, etc.)
// and push them to the hosted project via the Management API.
//
//   node scripts/push-auth-emails.mjs            # render + push
//   node scripts/push-auth-emails.mjs --render   # render to supabase/templates/ only
//
// Auth: SUPABASE_ACCESS_TOKEN env var, or the Supabase CLI keychain entry.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = 'mkegtssedjyqldysvzga';
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'templates');
const SITE_URL = 'https://theplot.tv';

// ── Design tokens (mirrors src/styles/tokens.css, light mode) ──
const t = {
  bg: '#F4F4F5',
  surface: '#FFFFFF',
  surfaceTint: '#FFF5F7',
  textPrimary: '#09090B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  border: '#E4E4E7',
  accent: '#E05578',
  accentSoft: '#F7C7D3',
  serif: "'Instrument Serif', Georgia, 'Times New Roman', serif",
  siteSans: "'DM Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  sans: "'Manrope', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
};

const button = (href, label) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
  <tr>
    <td style="border-radius: 9999px; background-color: transparent; border: 1px solid ${t.textPrimary};">
      <a href="${href}" target="_blank" style="display: inline-block; padding: 13px 30px; font-family: ${t.siteSans}; font-size: 14px; font-weight: 300; color: ${t.textPrimary}; text-decoration: none; border-radius: 9999px; line-height: 1.2;">${label}</a>
    </td>
  </tr>
</table>`;

const fallbackLink = (href) => `
<p style="margin: 28px 0 0; font-family: ${t.sans}; font-size: 12px; line-height: 1.6; color: ${t.textMuted}; text-align: center;">
  Prefer to paste the link manually?<br>
  <a href="${href}" target="_blank" style="color: ${t.textMuted}; text-decoration: underline; word-break: break-all;">${href}</a>
</p>`;

const noteBlock = (note) => note ? `
<div style="margin-top: 22px; padding: 14px 16px; border-radius: 12px; background-color: ${t.surfaceTint}; border: 1px solid ${t.accentSoft}; text-align: center;">
  <p style="margin: 0; font-family: ${t.sans}; font-size: 12px; line-height: 1.65; color: ${t.textSecondary};">${note}</p>
</div>` : '';

const wordmark = () => `
<a href="${SITE_URL}" target="_blank" style="display: inline-block; text-decoration: none; font-family: ${t.serif}; font-size: 46px; font-weight: 400; letter-spacing: -0.05em; line-height: 1; color: ${t.textPrimary}; white-space: nowrap;">
  PLOT
</a>`;

const layout = ({ preheader, eyebrow, heading, intro, content, note, safety }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>PLOT</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Instrument+Serif&family=Manrope:wght@400;600&display=swap" rel="stylesheet">
  <!--<![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${t.bg};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${t.bg};">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px;">

          <tr>
            <td align="center" style="padding: 0 0 28px;">
              ${wordmark()}
            </td>
          </tr>

          <tr>
            <td style="background-color: ${t.surface}; border: 1px solid ${t.border}; border-radius: 16px; padding: 40px 36px; text-align: center;">
              <div style="display: inline-block; margin: 0 0 16px; padding: 6px 10px; border-radius: 9999px; background-color: ${t.surfaceTint}; border: 1px solid ${t.accentSoft}; font-family: ${t.sans}; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${t.accent};">${eyebrow}</div>
              <h1 style="margin: 0 0 14px; font-family: ${t.serif}; font-weight: 400; font-size: 27px; line-height: 1.25; color: ${t.textPrimary};">${heading}</h1>
              <p style="margin: 0 0 28px; font-family: ${t.sans}; font-size: 15px; line-height: 1.65; color: ${t.textSecondary};">${intro}</p>
              ${content}
              ${noteBlock(note)}
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 28px 24px 0;">
              <p style="margin: 0 0 6px; font-family: ${t.sans}; font-size: 12px; line-height: 1.6; color: ${t.textMuted};">${safety}</p>
              <p style="margin: 0; font-family: ${t.sans}; font-size: 12px; line-height: 1.6; color: ${t.textMuted};">
                <a href="${SITE_URL}" target="_blank" style="color: ${t.textMuted}; text-decoration: underline;">PLOT</a>
                &middot; Your film and TV companion.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ── The six auth emails. {{ .X }} placeholders are Supabase Go-template vars. ──
const URL = '{{ .ConfirmationURL }}';

const emails = {
  confirmation: {
    subject: 'Confirm your email for PLOT',
    file: 'confirmation.html',
    html: layout({
      preheader: 'One click and your film & TV journal is ready.',
      eyebrow: 'New account',
      heading: 'Welcome to PLOT',
      intro: "Confirm your email to start logging, rating, and lining up what to watch next.",
      content: button(URL, 'Confirm email') + fallbackLink(URL),
      note: 'This is the email most new PLOT members see first, so we kept it simple: one step in, then straight to your watch journal.',
      safety: "Didn't sign up for PLOT? You can safely ignore this email.",
    }),
  },
  recovery: {
    subject: 'Reset your PLOT password',
    file: 'recovery.html',
    html: layout({
      preheader: 'Set a new password for your PLOT account.',
      eyebrow: 'Account security',
      heading: 'Reset your password',
      intro: 'We received a request to reset your PLOT password. If that was you, set a new one below.',
      content: button(URL, 'Set a new password') + fallbackLink(URL),
      note: 'For security, only use the latest reset email you requested.',
      safety: "Didn't request this? You can safely ignore this email, your password won't change.",
    }),
  },
  magic_link: {
    subject: 'Your PLOT sign-in link',
    file: 'magic-link.html',
    html: layout({
      preheader: 'Your one-time sign-in link for PLOT.',
      eyebrow: 'Sign in',
      heading: 'Sign in to PLOT',
      intro: "Here's your one-time sign-in link. It only works once and expires in an hour.",
      content: button(URL, 'Sign in') + fallbackLink(URL),
      note: 'If you requested multiple sign-in links, use the newest one.',
      safety: "Didn't try to sign in? You can safely ignore this email.",
    }),
  },
  email_change: {
    subject: 'Confirm your new PLOT email',
    file: 'email-change.html',
    html: layout({
      preheader: 'Confirm the new email address for your PLOT account.',
      eyebrow: 'Account change',
      heading: 'Confirm your new email',
      intro: 'Follow the link below to update the email on your PLOT account from {{ .Email }} to {{ .NewEmail }}.',
      content: button(URL, 'Confirm change') + fallbackLink(URL),
      note: 'Nothing changes until you confirm this new address.',
      safety: "Didn't request this change? You can safely ignore this email.",
    }),
  },
  invite: {
    subject: "You're invited to PLOT",
    file: 'invite.html',
    html: layout({
      preheader: 'A journal for everything you watch.',
      eyebrow: 'Invite',
      heading: "You're invited",
      intro: "You’ve been invited to join PLOT, where you’ll always know what to watch next.",
      content: button(URL, 'Accept invite') + fallbackLink(URL),
      note: 'Open the invite, set up your account, and start building your watch history.',
      safety: "Not expecting this invite? You can safely ignore this email.",
    }),
  },
  reauthentication: {
    subject: 'Your PLOT confirmation code',
    file: 'reauthentication.html',
    html: layout({
      preheader: 'Your one-time confirmation code.',
      eyebrow: 'Security check',
      heading: "Confirm it's you",
      intro: 'Enter this code in PLOT to confirm your identity before finishing this action. It expires in an hour.',
      content: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="background-color: ${t.bg}; border-radius: 12px; padding: 18px 12px;">
      <span style="font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 26px; letter-spacing: 8px; color: ${t.textPrimary};">{{ .Token }}</span>
    </td>
  </tr>
</table>`,
      note: 'Use this code to finish signing in or confirming your action in PLOT.',
      safety: "Didn't request a code? You can safely ignore this email.",
    }),
  },
};

// ── Render to supabase/templates/ for review ──
mkdirSync(TEMPLATES_DIR, { recursive: true });
for (const { file, html } of Object.values(emails)) {
  writeFileSync(join(TEMPLATES_DIR, file), html);
}
console.log(`Rendered ${Object.keys(emails).length} templates to supabase/templates/`);

if (process.argv.includes('--render')) process.exit(0);

// ── Push to the hosted project ──
const keychainToken = () => {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], {
    encoding: 'utf8',
  }).trim();
  return raw.startsWith('go-keyring-base64:')
    ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString()
    : raw;
};
const token = process.env.SUPABASE_ACCESS_TOKEN || keychainToken();

const body = {};
for (const [key, { subject, html }] of Object.entries(emails)) {
  body[`mailer_subjects_${key}`] = subject;
  body[`mailer_templates_${key}_content`] = html;
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`);
console.log('Pushed auth email templates to project', PROJECT_REF);
