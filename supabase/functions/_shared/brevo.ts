// Thin Brevo wrapper for contact upserts (Deno edge functions).
const API_URL = 'https://api.brevo.com/v3/contacts'

export async function upsertBrevoContact({
  apiKey,
  email,
  attributes,
  listIds,
}: {
  apiKey: string
  email: string
  attributes?: Record<string, unknown>
  listIds?: number[]
}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, attributes, listIds, updateEnabled: true }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Brevo ${res.status}: ${err}`)
  }

  // Brevo returns 201 + {id} for a brand-new contact, 204 (no body) when
  // updateEnabled resolved to an update of an existing one.
  if (res.status === 204) return null
  return res.json().catch(() => null)
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
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ emails: [email] }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Brevo ${res.status}: ${err}`)
  }

  return res.json().catch(() => null)
}

export async function deleteBrevoContact({ apiKey, email }: { apiKey: string; email: string }) {
  const res = await fetch(`${API_URL}/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: { 'api-key': apiKey },
  })

  // A 404 means there's nothing to delete — the end state we actually care
  // about (no PII left in Brevo) already holds, so treat it as success too.
  if (!res.ok && res.status !== 404) {
    const err = await res.text()
    throw new Error(`Brevo ${res.status}: ${err}`)
  }
}
