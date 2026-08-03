import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runAccountCleanup } from './cleanup.js'
import { deleteBrevoContact } from '../_shared/brevo.ts'

function attachmentPathsFrom(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return []
    const marker = '/storage/v1/object/public/feedback-attachments/'
    const index = entry.indexOf(marker)
    if (index === -1) return []
    const path = decodeURIComponent(entry.slice(index + marker.length))
    return /^feedback\/[0-9a-f-]{36}(?:\.[a-z0-9]{1,10})?$/i.test(path) ? [path] : []
  })
}

function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  // Client with user context (RLS enforced)
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) return new Response('Unauthorized', { status: 401 })

  // A guessed/typed phrase alone doesn't verify identity — a valid bearer
  // token already does that. This guards against a misclick or a UI bug
  // triggering deletion without the user having actually typed to confirm,
  // enforced server-side so it can't be skipped by calling the API directly.
  let confirmationPhrase = ''
  try {
    const body = await req.json()
    confirmationPhrase = String(body?.confirmationPhrase || '')
  } catch { /* missing/invalid body falls through to the check below */ }
  if (confirmationPhrase.trim().toLowerCase() !== 'delete account') {
    return jsonError('Type "delete account" to confirm.', 400)
  }

  const userId = user.id

  // Use the service role client for storage cleanup and auth deletion.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: feedbackRows, error: feedbackError } = await supabaseClient
    .from('feedback')
    .select('attachments')
    .eq('user_id', userId)

  if (feedbackError) return jsonError(feedbackError.message || 'Failed to load feedback attachments.')

  const attachmentPaths = (feedbackRows ?? [])
    .flatMap((row) => attachmentPathsFrom(row.attachments))
    .filter(Boolean)

  if (attachmentPaths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage.from('feedback-attachments').remove(attachmentPaths)
    if (storageError) return jsonError(storageError.message || 'Failed to delete feedback attachments.')
  }

  const cleanupError = await runAccountCleanup(supabaseClient, userId)
  if (cleanupError) {
    return jsonError(
      cleanupError.error?.message || `Failed to delete rows from ${cleanupError.table}.`,
      500,
      { table: cleanupError.table },
    )
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteError) return jsonError(deleteError.message)

  // Best-effort — the account is already gone either way, this just keeps a
  // deleted user's PII from lingering in the Brevo contact list.
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  if (brevoKey && user.email) {
    try {
      await deleteBrevoContact({ apiKey: brevoKey, email: user.email })
    } catch (error) {
      console.error('Failed to delete Brevo contact:', error instanceof Error ? error.message : error)
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
