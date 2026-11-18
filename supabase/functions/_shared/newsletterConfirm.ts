// Double opt-in for the weekly digest (newsletter-subscribe). Pure decisions
// and message text, so the handler's choices can be tested without a request.
//
// Until 2026-11-18 a POST with any address made it `active` and added it to the
// Brevo marketing list at once, so anyone could sign a stranger up. Now a
// website signup is `pending` until the owner opens the emailed link. App
// opt-ins (Settings toggle, sync_marketing_subscription) stay immediate: that
// address is the signed-in account's own.

export type SubscriberRow = {
  status: string
  confirm_sent_at: string | null
  confirm_token: string | null
}

// One confirmation email per address per hour, however many times the form is
// submitted for it. The IP limits cap the total; this stops one inbox being
// flooded from many IPs.
export const CONFIRM_RESEND_MS = 60 * 60 * 1000
// A link older than this is refused; subscribing again sends a fresh one.
export const CONFIRM_TTL_MS = 14 * 24 * 60 * 60 * 1000

export type SubscribeAction =
  | 'create' // no row: insert a pending row and email the link
  | 'send' // pending or unsubscribed: (re)send the link
  | 'skip' // already active, bounced, or emailed within the hour: do nothing

export function subscribeAction(row: SubscriberRow | null, now = Date.now()): SubscribeAction {
  if (!row) return 'create'
  // An unsubscribed address may opt in again, but only by confirming: its row
  // keeps status 'unsubscribed' until the link is opened.
  if (row.status !== 'pending' && row.status !== 'unsubscribed') return 'skip'
  const sent = row.confirm_sent_at ? Date.parse(row.confirm_sent_at) : Number.NaN
  if (Number.isFinite(sent) && now - sent < CONFIRM_RESEND_MS) return 'skip'
  return 'send'
}

/** Keep the token from an earlier email while it is still valid, so that link keeps working. */
export function reusableToken(row: SubscriberRow | null, now = Date.now()): string | null {
  if (!row?.confirm_token || !row.confirm_sent_at) return null
  const sent = Date.parse(row.confirm_sent_at)
  return Number.isFinite(sent) && now - sent < CONFIRM_TTL_MS ? row.confirm_token : null
}

export type ConfirmState = 'ok' | 'invalid' | 'expired'

export function confirmState(row: SubscriberRow | null, now = Date.now()): ConfirmState {
  if (!row?.confirm_token) return 'invalid'
  // A bounced address is not re-activated by an old link.
  if (row.status !== 'pending' && row.status !== 'unsubscribed') return 'invalid'
  const sent = row.confirm_sent_at ? Date.parse(row.confirm_sent_at) : Number.NaN
  if (!Number.isFinite(sent) || now - sent >= CONFIRM_TTL_MS) return 'expired'
  return 'ok'
}

export function newConfirmToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function confirmUrl(appOrigin: string, token: string): string {
  const url = new URL('/newsletter/confirm', appOrigin.replace(/\/+$/, '') + '/')
  url.searchParams.set('token', token)
  return url.toString()
}

// Plain text on purpose (see sendBrevoTransactionalEmail): link tracking would
// rewrite the URL in an HTML body.
export function confirmMail(link: string): { subject: string, text: string } {
  return {
    subject: 'Confirm your Plot digest subscription',
    text: [
      'Someone, hopefully you, asked to get the Plot weekly digest at this address.',
      '',
      'To start getting it, confirm here:',
      '',
      link,
      '',
      'If this was not you, ignore this email. You will not be subscribed and we will not email you again about it.',
    ].join('\n'),
  }
}
