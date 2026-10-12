// Premium waitlist upsert against Brevo.
// WAITLIST_EMAIL_RE must match packages/core/premiumWaitlist.js. The function
// directory cannot import @plot/core (deploy uploads this folder only).
//
// The list named "Premium waitlist" is addressed by its numeric id in
// BREVO_PREMIUM_WAITLIST_LIST_ID. PREMIUM_INTEREST has to exist as a text
// attribute in Brevo. Unrecognised attribute keys are dropped, not rejected.

import { getBrevoContact, upsertBrevoContact } from './brevo.ts';

export const WAITLIST_ATTRIBUTE = 'PREMIUM_INTEREST';
export const WAITLIST_LIST_ENV = 'BREVO_PREMIUM_WAITLIST_LIST_ID';
export const WAITLIST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const WAITLIST_GATES = ['themes', 'smart_lists'] as const;

export type WaitlistGate = typeof WAITLIST_GATES[number];

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

function onList(listIds: number[] | undefined, listId: number): boolean {
  return (listIds ?? []).some((id) => Number(id) === listId);
}

export async function upsertPremiumWaitlistContact(args: {
  fetchImpl: FetchLike;
  apiKey: string;
  email: string;
  gate: WaitlistGate;
  listId: number;
}): Promise<{ ok: true; already: boolean } | { ok: false; error: 'unavailable' }> {
  const { fetchImpl, apiKey, email, gate, listId } = args;
  let contact: { attributes: Record<string, unknown>; listIds: number[] } | null;
  try {
    contact = await getBrevoContact({ apiKey, email, fetchImpl });
  } catch {
    return { ok: false, error: 'unavailable' };
  }

  const sameGate = contact?.attributes?.[WAITLIST_ATTRIBUTE] === gate;
  const listed = onList(contact?.listIds, listId);
  if (contact && sameGate && listed) return { ok: true, already: true };

  try {
    await upsertBrevoContact({
      apiKey,
      email,
      attributes: { [WAITLIST_ATTRIBUTE]: gate },
      listIds: [listId],
      fetchImpl,
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
  return { ok: true, already: false };
}
