/**
 * notify-feedback
 *
 * Triggered by a Supabase Database Webhook on INSERT to public.feedback.
 * Sends an email to the PLOT admin via Resend.
 *
 * Required secret (set via Supabase dashboard → Project Settings → Edge Functions → Secrets):
 *   RESEND_API_KEY   — from resend.com
 *
 * Required env vars (auto-provided by Supabase):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const TO_EMAIL       = 'feedback@theplot.tv';
const FROM_EMAIL     = 'PLOT Feedback <feedback@plotapp.tv>'; // ← update to your verified Resend domain

const TYPE_LABELS: Record<string, string> = {
  bug:     '🐛 Bug Report',
  feature: '💡 Feature Request',
  general: '💬 General Feedback',
};

Deno.serve(async (req) => {
  // Supabase webhooks are POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.error('RESEND_API_KEY secret not set');
    return new Response('Server misconfiguration', { status: 500 });
  }

  let body: { record?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const record = body?.record;
  if (!record) {
    return new Response('No record in payload', { status: 400 });
  }

  const type       = String(record.type    ?? 'general');
  const message    = String(record.message ?? '');
  const userEmail  = record.user_email ? String(record.user_email) : 'Anonymous';
  const createdAt  = record.created_at  ? new Date(String(record.created_at)).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'unknown';
  const typeLabel  = TYPE_LABELS[type] ?? type;

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; color: #1a1a1a;">
      <h2 style="margin: 0 0 4px; font-size: 1.1rem;">${typeLabel}</h2>
      <p style="margin: 0 0 20px; font-size: 0.8rem; color: #888;">${createdAt} · ${userEmail}</p>
      <div style="background: #f5f4f2; border-radius: 8px; padding: 16px; font-size: 0.92rem; line-height: 1.6; white-space: pre-wrap;">${message}</div>
    </div>
  `;

  const res = await fetch(RESEND_API_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [TO_EMAIL],
      subject: `PLOT feedback: ${typeLabel} from ${userEmail}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return new Response('Failed to send email', { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
