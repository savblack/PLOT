// Thin Resend wrapper for marketing emails (digest, reports, newsletter).
const API_URL = 'https://api.resend.com/emails';

const apiKey = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return key;
};

export const FROM_MARKETING = 'Plot <hello@theplot.tv>';
export const ADMIN_EMAIL = process.env.MARKETING_ADMIN_EMAIL || 'feedback@theplot.tv';

// GitHub's RESEND_API_KEY copy can be stale after a rotation. When the
// Supabase URL and service role are set, send through marketing-notify, which
// uses the project key. The direct Resend call remains for a machine that
// only has RESEND_API_KEY.
const relayTarget = () => {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ''), key };
};

const relayEmail = async ({ to, subject, html }) => {
  const target = relayTarget();
  if (!target) return null;
  const res = await fetch(`${target.base}/functions/v1/marketing-notify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${target.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: Array.isArray(to) ? to[0] : to, subject, html }),
  });
  if (!res.ok) throw new Error(`Notify relay ${res.status}: ${await res.text()}`);
  return res.json();
};

const sendDirect = async ({ to, subject, html, from, headers }) => {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, headers }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
};

export const sendEmail = async ({ to, subject, html, from = FROM_MARKETING, headers = undefined }) => {
  let relayError = null;
  if (relayTarget()) {
    try {
      return await relayEmail({ to, subject, html });
    } catch (err) {
      relayError = err;
      if (!process.env.RESEND_API_KEY) throw err;
    }
  }
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  try {
    return await sendDirect({ to, subject, html, from, headers });
  } catch (err) {
    if (relayError) throw relayError;
    throw err;
  }
};

// Resend batch endpoint accepts up to 100 messages per call.
export const sendBatch = async (messages) => {
  const res = await fetch(`${API_URL.replace(/\/emails$/, '')}/emails/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`Resend batch ${res.status}: ${await res.text()}`);
  return res.json();
};
