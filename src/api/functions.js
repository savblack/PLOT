const SUPABASE_URL = (import.meta.env ?? {}).VITE_SUPABASE_URL;

export function edgeFunctionUrl(name, query = {}) {
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
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(err);
  }

  return res.json();
}
