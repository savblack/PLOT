// Thin Resend wrapper for marketing emails (digest, reports, newsletter).
const API_URL = 'https://api.resend.com/emails';

const apiKey = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return key;
};

export const FROM_MARKETING = 'Plot <hello@theplot.tv>';
export const ADMIN_EMAIL = process.env.MARKETING_ADMIN_EMAIL || 'feedback@theplot.tv';

// GitHub's RESEND_API_KEY copy can be stale after a rotation. The project
// secret is the one signup and billing mail already use. marketing-notify
// sends with that key. Only a 401 falls through, so a real Resend refusal
// (bad address, unverified domain) still surfaces.
const relayEmail = async ({ to, subject, html, from }) => {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return null;
  const res = await fetch(`${base.replace(/\/$/, '')}/functions/v1/marketing-notify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: Array.isArray(to) ? to[0] : to, subject, html, from }),
  });
  if (!res.ok) throw new Error(`Notify relay ${res.status}: ${await res.text()}`);
  return res.json();
};

export const sendEmail = async ({ to, subject, html, from = FROM_MARKETING, headers = undefined }) => {
  let directError = null;
  if (process.env.RESEND_API_KEY) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, headers }),
    });
    if (res.ok) return res.json();
    directError = new Error(`Resend ${res.status}: ${await res.text()}`);
    if (res.status !== 401) throw directError;
  }
  const relayed = await relayEmail({ to, subject, html, from });
  if (relayed) return relayed;
  if (directError) throw directError;
  throw new Error('RESEND_API_KEY is not set');
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
