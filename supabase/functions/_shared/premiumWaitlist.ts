// Premium waitlist upsert against Resend.
// WAITLIST_EMAIL_RE must match packages/core/premiumWaitlist.js. The function
// directory cannot import @plot/core (deploy uploads this folder only).

export const WAITLIST_SEGMENT_NAME = 'Premium waitlist';
export const WAITLIST_PROPERTY = 'premium_interest';
export const WAITLIST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const WAITLIST_GATES = ['themes', 'smart_lists'] as const;

export type WaitlistGate = typeof WAITLIST_GATES[number];

const RESEND = 'https://api.resend.com';

export function normaliseWaitlistEmail(value: unknown): string | null {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || email.length > 254 || !WAITLIST_EMAIL_RE.test(email)) return null;
  return email;
}

export function isWaitlistGate(value: unknown): value is WaitlistGate {
  return value === 'themes' || value === 'smart_lists';
}

export type WaitlistDecision =
  | { action: 'pretend' }
  | { action: 'reject'; error: 'invalid_gate' | 'invalid_email'; status: 400 }
  | { action: 'join'; email: string; gate: WaitlistGate };

/**
 * A filled honeypot pretends the join worked. A signed-in account email wins
 * over anything in the body. Signed-out joins need a valid body email.
 */
export function decideWaitlistJoin(input: {
  website?: unknown;
  gate?: unknown;
  email?: unknown;
  accountEmail?: string | null;
}): WaitlistDecision {
  if (typeof input.website === 'string' && input.website.trim() !== '') return { action: 'pretend' };
  if (!isWaitlistGate(input.gate)) return { action: 'reject', error: 'invalid_gate', status: 400 };
  // A present account email is the only address used, even when it is not valid.
  if (input.accountEmail != null) {
    const email = normaliseWaitlistEmail(input.accountEmail);
    if (!email) return { action: 'reject', error: 'invalid_email', status: 400 };
    return { action: 'join', email, gate: input.gate };
  }
  const email = normaliseWaitlistEmail(input.email);
  if (!email) return { action: 'reject', error: 'invalid_email', status: 400 };
  return { action: 'join', email, gate: input.gate };
}

type Hit = { count: number; first: number };

/** In-memory and per isolate. A burst that stays on one isolate is what it catches. */
export function rateLimitHit(store: Map<string, Hit>, ip: string, now: number, windowMs: number, max: number): boolean {
  const rec = store.get(ip);
  if (!rec || now - rec.first > windowMs) {
    store.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

export async function findWaitlistSegmentId(fetchImpl: FetchLike, apiKey: string, name = WAITLIST_SEGMENT_NAME): Promise<string | null> {
  let after = '';
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${RESEND}/segments`);
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const res = await fetchImpl(url.toString(), { headers: authHeaders(apiKey) });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null) as { data?: Array<{ id?: string; name?: string }>; has_more?: boolean } | null;
    const rows = body?.data ?? [];
    const match = rows.find((row) => row.name === name && row.id);
    if (match?.id) return match.id;
    const last = rows[rows.length - 1]?.id;
    if (!body?.has_more || !last) return null;
    after = last;
  }
  return null;
}

export async function upsertPremiumWaitlistContact(args: {
  fetchImpl: FetchLike;
  apiKey: string;
  email: string;
  gate: WaitlistGate;
  segmentId: string;
}): Promise<{ ok: true; already: boolean } | { ok: false; error: 'unavailable' }> {
  const { fetchImpl, apiKey, email, gate, segmentId } = args;
  const headers = authHeaders(apiKey);
  const contactUrl = `${RESEND}/contacts/${encodeURIComponent(email)}`;
  const existing = await fetchImpl(contactUrl, { headers });

  if (existing.status === 404) {
    const created = await fetchImpl(`${RESEND}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        unsubscribed: false,
        properties: { [WAITLIST_PROPERTY]: gate },
        segments: [{ id: segmentId }],
      }),
    });
    if (!created.ok) return { ok: false, error: 'unavailable' };
    return { ok: true, already: false };
  }

  if (!existing.ok) return { ok: false, error: 'unavailable' };
  const contact = await existing.json().catch(() => null) as { properties?: Record<string, unknown> } | null;
  // Retrieve returns { value, type }. Create and update take the bare value.
  const raw = contact?.properties?.[WAITLIST_PROPERTY];
  const current = raw && typeof raw === 'object' && 'value' in raw ? (raw as { value: unknown }).value : raw;
  const sameGate = current === gate;

  const membership = await fetchImpl(`${contactUrl}/segments`, { headers });
  if (!membership.ok) return { ok: false, error: 'unavailable' };
  const listed = await membership.json().catch(() => null) as { data?: Array<{ id?: string }> } | null;
  const inSegment = (listed?.data ?? []).some((row) => row.id === segmentId);

  if (!inSegment) {
    const added = await fetchImpl(`${contactUrl}/segments/${segmentId}`, { method: 'POST', headers });
    if (!added.ok && added.status !== 409) return { ok: false, error: 'unavailable' };
  }

  if (!sameGate) {
    const patched = await fetchImpl(contactUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties: { [WAITLIST_PROPERTY]: gate } }),
    });
    if (!patched.ok) return { ok: false, error: 'unavailable' };
  }

  return { ok: true, already: sameGate && inSegment };
}
