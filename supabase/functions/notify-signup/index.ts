/**
 * notify-signup
 *
 * Triggered by a Supabase Database Webhook on INSERT to auth.users.
 * Sends an email via Resend so we hear about every new signup in real time,
 * and (best-effort) upserts the new user into Brevo as a contact.
 *
 * Fires on the auth.users insert, i.e. the moment someone signs up — for
 * email/password signups this is before they confirm their address. profiles
 * doesn't exist yet at this point (see supabase/functions/profiles-changed
 * for username/first_name/is_premium, which only exist post-onboarding).
 *
 * Required secrets:
 *   RESEND_API_KEY            - Resend API key (theplot.tv is a verified sender)
 *
 * Optional secrets:
 *   SIGNUP_NOTIFY_TO_EMAIL    - recipient of the alert (defaults to TO_EMAIL below)
 *   BREVO_API_KEY             - Brevo API key; unset skips the Brevo sync entirely
 *   BREVO_LIST_ID             - Brevo "PLOT App Users" list id
 *   BREVO_MARKETING_LIST_ID   - Brevo "PLOT Marketing Subscribers" list id (opted-in only)
 */

import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts'
import { captureSentryError } from '../_shared/sentry.ts'
import { upsertBrevoContact } from '../_shared/brevo.ts'
import { adminClient } from '../_shared/supabaseAdmin.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'
const TO_EMAIL = Deno.env.get('SIGNUP_NOTIFY_TO_EMAIL') || 'sav.black@outlook.com'
const FROM_EMAIL = 'PLOT <signups@theplot.tv>'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatSignedUpAt(value: unknown) {
  if (!value) return 'unknown'

  return new Date(String(value)).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
  })
}

/**
 * Best-effort read of the signup method. For OAuth signups auth.users stores
 * the provider in raw_app_meta_data.provider; email/password signups report
 * "email".
 */
function signupMethodFrom(record: Record<string, unknown>) {
  const appMeta = record.raw_app_meta_data
  if (appMeta && typeof appMeta === 'object') {
    const provider = (appMeta as Record<string, unknown>).provider
    if (typeof provider === 'string' && provider.trim()) return provider
  }
  return 'email'
}

async function sendSignupEmail({
  resendKey,
  email,
  method,
  userId,
  createdAt,
}: {
  resendKey: string
  email: string
  method: string
  userId: string
  createdAt: unknown
}) {
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; color: #1a1a1a;">
      <h2 style="margin: 0 0 4px; font-size: 1.1rem;">New PLOT signup</h2>
      <p style="margin: 0 0 20px; font-size: 0.8rem; color: #888;">${escapeHtml(formatSignedUpAt(createdAt))} · via ${escapeHtml(method)}</p>
      <div style="background: #f5f4f2; border-radius: 8px; padding: 16px; font-size: 0.92rem; line-height: 1.6;">
        <div><strong>${escapeHtml(email || 'unknown email')}</strong></div>
        <div style="font-size: 0.8rem; color: #888; margin-top: 4px;">${escapeHtml(userId)}</div>
      </div>
    </div>
  `

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `New PLOT signup: ${email || userId}`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend request failed with status ${res.status}: ${err}`)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!hasServiceRoleBearer(req)) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: { record?: Record<string, unknown> }
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
    return new Response('User record is missing an id', { status: 400 })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    const errorMessage = 'Signup notifications are not configured (missing RESEND_API_KEY).'
    console.error(errorMessage)
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const email = record.email ? String(record.email) : ''
  const method = signupMethodFrom(record)

  // Best-effort Brevo contact sync — independent of the Resend notification
  // below, never throws. USERNAME/FIRSTNAME aren't knowable yet: profiles
  // doesn't exist until onboarding finishes (see profiles-changed).
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const brevoListId = Deno.env.get('BREVO_LIST_ID')
  const brevoMarketingListId = Deno.env.get('BREVO_MARKETING_LIST_ID')
  if (brevoKey && brevoListId && email) {
    try {
      const { data: subscriber } = await adminClient()
        .from('marketing_subscribers')
        .select('status')
        .eq('email', email.toLowerCase())
        .maybeSingle()
      const optedIn = subscriber?.status === 'active'
      const listIds = [Number(brevoListId)]
      if (optedIn && brevoMarketingListId) listIds.push(Number(brevoMarketingListId))

      // Brevo's "date" attribute type expects YYYY-MM-DD; anything else is
      // silently dropped, not stored wrong, but keep this consistent with
      // the backfill script's SIGNUP_DATE format regardless.
      const signupDate = record.created_at ? String(record.created_at).slice(0, 10) : undefined

      await upsertBrevoContact({
        apiKey: brevoKey,
        email,
        attributes: { SIGNUP_DATE: signupDate, IS_PREMIUM: false, OPT_IN: optedIn },
        listIds,
      })
    } catch (error) {
      console.error('Failed to sync signup to Brevo:', error instanceof Error ? error.message : error)
    }
  }

  try {
    await sendSignupEmail({
      resendKey,
      email,
      method,
      userId,
      createdAt: record.created_at,
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown signup notification error'
    console.error('Failed to send signup notification:', errorMessage)
    await captureSentryError('notify-signup', error, { userId })
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
