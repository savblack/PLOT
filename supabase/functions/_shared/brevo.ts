// Thin Brevo wrapper for contact upserts and lifecycle events (Deno edge functions).
const API_URL = 'https://api.brevo.com/v3/contacts'
const EVENTS_URL = 'https://api.brevo.com/v3/events'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function brevoError(status: number, body: string) {
  const hint = status === 401 ? ' BREVO_API_KEY is not a live Brevo key.' : ''
  return new Error(`Brevo ${status}: ${body}${hint}`)
}

function brevoHeaders(apiKey: string) {
  return {
    'api-key': apiKey.trim(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export type BrevoContact = {
  email?: string
  emailBlacklisted?: boolean
}

/** 404 is "no contact", not an error. Anything else throws. */
export async function getBrevoContact({
  apiKey,
  email,
}: {
  apiKey: string
  email: string
}): Promise<BrevoContact | null> {
  const res = await fetch(`${API_URL}/${encodeURIComponent(email)}`, {
    headers: brevoHeaders(apiKey),
  })
  if (res.status === 404) return null
  if (!res.ok) throw brevoError(res.status, await res.text())
  return res.json()
}

export async function upsertBrevoContact({
  apiKey,
  email,
  attributes,
  listIds,
  skipBlacklistCheck = false,
}: {
  apiKey: string
  email: string
  attributes?: Record<string, unknown>
  listIds?: number[]
  /** Set when the caller already dropped list ids for a blacklisted contact. */
  skipBlacklistCheck?: boolean
}) {
  let lists = listIds
  if (lists?.length && !skipBlacklistCheck) {
    const existing = await getBrevoContact({ apiKey, email })
    // Adding list ids puts the address back on the list. A blacklist must stay put.
    if (existing?.emailBlacklisted) lists = undefined
  }

  const body: Record<string, unknown> = { email, updateEnabled: true }
  if (attributes) body.attributes = attributes
  if (lists?.length) body.listIds = lists

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: brevoHeaders(apiKey),
    body: JSON.stringify(body),
  })

  if (!res.ok) throw brevoError(res.status, await res.text())

  // Brevo returns 201 + {id} for a brand-new contact, 204 (no body) when
  // updateEnabled resolved to an update of an existing one.
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

/**
 * Custom event. Same API key as the contact calls.
 * https://developers.brevo.com/reference/create-event
 */
export async function trackBrevoEvent({
  apiKey,
  email,
  event,
  eventProperties,
  contactProperties,
}: {
  apiKey: string
  email: string
  event: string
  eventProperties?: Record<string, unknown>
  contactProperties?: Record<string, unknown>
}) {
  const res = await fetch(EVENTS_URL, {
    method: 'POST',
    headers: brevoHeaders(apiKey),
    body: JSON.stringify({
      event_name: event,
      identifiers: { email_id: email },
      event_properties: eventProperties,
      contact_properties: contactProperties,
    }),
  })
  if (!res.ok) throw brevoError(res.status, await res.text())
}

export async function removeContactFromList({
  apiKey,
  listId,
  email,
}: {
  apiKey: string
  listId: number
  email: string
}) {
  const res = await fetch(`${API_URL}/lists/${listId}/contacts/remove`, {
    method: 'POST',
    headers: brevoHeaders(apiKey),
    body: JSON.stringify({ emails: [email] }),
  })

  if (!res.ok) throw brevoError(res.status, await res.text())

  return res.json().catch(() => null)
}

export async function deleteBrevoContact({ apiKey, email }: { apiKey: string; email: string }) {
  const res = await fetch(`${API_URL}/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: { 'api-key': apiKey.trim() },
  })

  // A 404 means there's nothing to delete — the end state we actually care
  // about (no PII left in Brevo) already holds, so treat it as success too.
  if (!res.ok && res.status !== 404) throw brevoError(res.status, await res.text())
}

/** POST /v3/events. The account email identifies the contact. */
export async function sendBrevoEvent({
  apiKey,
  eventName,
  email,
  eventProperties,
  fetchImpl = fetch,
}: {
  apiKey: string
  eventName: string
  email: string
  eventProperties?: Record<string, string | number | boolean>
  fetchImpl?: FetchLike
}) {
  const res = await fetchImpl(EVENTS_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_name: eventName,
      identifiers: { email_id: email },
      event_properties: eventProperties ?? {},
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Brevo ${res.status}: ${err}`)
  }
}
