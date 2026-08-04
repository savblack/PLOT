/**
 * profiles-changed
 *
 * Triggered by a Supabase Database Webhook on INSERT/UPDATE to public.profiles.
 * Best-effort keeps a Brevo contact's USERNAME/FIRSTNAME/IS_PREMIUM in sync —
 * these don't exist at signup time (see notify-signup), only once onboarding
 * creates the profiles row, and username/is_premium can keep changing after.
 *
 * Wired via the Supabase dashboard (Database -> Webhooks): public.profiles,
 * INSERT + UPDATE, HTTP request to this function, with its service-role auth
 * option checked. Unlike auth.users, this is a plain public-schema table so
 * the dashboard can target it directly - no Vault/SQL-trigger workaround
 * needed (contrast supabase/notify-signup-trigger.sql).
 *
 * marketing_emails is handled separately from the other fields: it is consent,
 * so it also has to move the contact on and off the marketable list, not just
 * set an attribute.
 *
 * Required secrets:
 *   BREVO_API_KEY            - Brevo API key; unset skips the sync entirely
 *   BREVO_LIST_ID            - Brevo "PLOT App Users" list id
 *   BREVO_MARKETING_LIST_ID  - Brevo "PLOT Marketing Subscribers" list id;
 *                              unset skips only the opt-in half of the sync
 */
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts'
import { captureSentryError } from '../_shared/sentry.ts'
import { upsertBrevoContact, removeContactFromList } from '../_shared/brevo.ts'
import { adminClient } from '../_shared/supabaseAdmin.ts'

const TRACKED_FIELDS = ['username', 'first_name', 'is_premium'] as const
const BREVO_ATTRIBUTE_NAME: Record<(typeof TRACKED_FIELDS)[number], string> = {
  username: 'USERNAME',
  first_name: 'FIRSTNAME',
  is_premium: 'IS_PREMIUM',
}

// Only the fields we actually mirror to Brevo, and only when they're present
// and (for an UPDATE) actually changed — region/timezone/genre/bio edits etc.
// shouldn't trigger a call.
function relevantChanges(
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null | undefined,
) {
  const attributes: Record<string, unknown> = {}
  for (const field of TRACKED_FIELDS) {
    const value = record[field]
    if (value === undefined || value === null) continue
    if (!oldRecord || oldRecord[field] !== value) attributes[BREVO_ATTRIBUTE_NAME[field]] = value
  }
  return attributes
}

// Consent changed in either direction? Null when it didn't, so an unrelated
// profile edit never touches the marketable list.
function marketingConsentChange(
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null | undefined,
): boolean | null {
  const value = record.marketing_emails
  if (typeof value !== 'boolean') return null
  // An INSERT (no old_record) only counts when it arrives already opted in;
  // the column defaults to false, so the common case is a no-op.
  if (!oldRecord) return value ? true : null
  return oldRecord.marketing_emails === value ? null : value
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!hasServiceRoleBearer(req)) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: { record?: Record<string, unknown>; old_record?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const record = body?.record
  if (!record) {
    return new Response('No record in payload', { status: 400 })
  }

  const userId = record.id ? String(record.id) : ''
  if (!userId) {
    return new Response('Profile record is missing an id', { status: 400 })
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const brevoListId = Deno.env.get('BREVO_LIST_ID')
  if (!brevoKey || !brevoListId) {
    console.error('Brevo sync is not configured (missing BREVO_API_KEY / BREVO_LIST_ID).')
    return new Response(JSON.stringify({ ok: false, error: 'Brevo sync not configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const attributes = relevantChanges(record, body.old_record)
  const optedIn = marketingConsentChange(record, body.old_record)
  if (Object.keys(attributes).length === 0 && optedIn === null) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { data, error } = await adminClient().auth.admin.getUserById(userId)
    const email = data?.user?.email
    if (error || !email) {
      console.error('profiles-changed: could not resolve email for user', userId, error?.message)
      return new Response(JSON.stringify({ ok: false, error: 'No email for user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const marketingListId = Deno.env.get('BREVO_MARKETING_LIST_ID')
    if (optedIn !== null) {
      if (!marketingListId) {
        // The Supabase row is already correct, so the digest still reaches them.
        // Only Brevo's view of the list is behind until the secret is set.
        console.error('BREVO_MARKETING_LIST_ID is not set — marketing_emails not synced to Brevo.')
      } else {
        attributes.OPT_IN = optedIn
      }
    }

    await upsertBrevoContact({
      apiKey: brevoKey,
      email,
      attributes,
      // Opting in adds the marketing list alongside the app-users list. Opting
      // out can't be expressed as a list set here (upserts only ever add), so it
      // takes the explicit removal below.
      listIds: optedIn && marketingListId
        ? [Number(brevoListId), Number(marketingListId)]
        : [Number(brevoListId)],
    })

    if (optedIn === false && marketingListId) {
      await removeContactFromList({ apiKey: brevoKey, listId: Number(marketingListId), email })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown profiles-changed error'
    console.error('Failed to sync profile change to Brevo:', errorMessage)
    await captureSentryError('profiles-changed', error, { userId })
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
