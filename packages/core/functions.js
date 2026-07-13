import { getConfig } from './config.js';

export function edgeFunctionUrl(name, query = {}) {
  const SUPABASE_URL = getConfig().supabaseUrl;
  if (!SUPABASE_URL || !name) return null;

  const url = new URL(
    `/functions/v1/${name}`,
    `${SUPABASE_URL.replace(/\/+$/, '')}/`,
  );

  Object.entries(query).forEach(([key, value]) => {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  });

  return url.toString();
}

export async function callAuthenticatedFunction(name, session, body = {}) {
  const url = edgeFunctionUrl(name);
  if (!session || !url) return null;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || 'Unknown error';
    // Edge functions answer errors as {"error": "..."} — surface the message,
    // not the JSON envelope.
    try { message = JSON.parse(text)?.error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }

  return res.json();
}
