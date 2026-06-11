// Thin Resend wrapper for marketing emails (digest, reports, newsletter).
const API_URL = 'https://api.resend.com/emails';

const apiKey = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return key;
};

export const FROM_MARKETING = 'PLOT <hello@theplot.tv>';
export const ADMIN_EMAIL = process.env.MARKETING_ADMIN_EMAIL || 'feedback@theplot.tv';

export const sendEmail = async ({ to, subject, html, from = FROM_MARKETING, headers = undefined }) => {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, headers }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
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
