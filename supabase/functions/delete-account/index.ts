import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runAccountCleanup } from './cleanup.js'
import { deleteBrevoContact } from '../_shared/brevo.ts'
import { serviceKey } from '../_shared/serviceKey.ts'
import { attachmentPathsFrom } from '../_shared/feedbackAttachments.ts'

function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// deno-lint-ignore no-explicit-any
async function removeImportUploads(client: { storage: { from: (bucket: string) => any } }, userId: string): Promise<string | null> {
  const bucket = client.storage.from('import-uploads')
  const { data: folders, error } = await bucket.list(userId, { limit: 1000 })
  if (error) return error.message || 'Failed to list import files.'
  const paths: string[] = []
  for (const folder of (folders ?? []) as { name: string }[]) {
    const { data: files, error: listError } = await bucket.list(`${userId}/${folder.name}`, { limit: 1000 })
    if (listError) return listError.message || 'Failed to list import files.'
    for (const file of (files ?? []) as { name: string }[]) paths.push(`${userId}/${folder.name}/${file.name}`)
  }
  if (!paths.length) return null
  const { error: removeError } = await bucket.remove(paths)
  return removeError ? (removeError.message || 'Failed to delete import files.') : null
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
    serviceKey()
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
    // Delete through the caller's authenticated client so Storage RLS verifies
    // object ownership. A service-role delete would turn a caller-controlled
    // URL in their feedback row into authority over somebody else's object.
    const { error: storageError } = await supabaseClient.storage.from('feedback-attachments').remove(attachmentPaths)
    if (storageError) return jsonError(storageError.message || 'Failed to delete feedback attachments.')
  }

  // Background-import files (uploads still queued, review leftovers) live at
  // import-uploads/<user id>/<job id>/. The folder is the caller's own, and the
  // owner delete policy applies through their client.
  const importFilesError = await removeImportUploads(supabaseClient, userId)
  if (importFilesError) return jsonError(importFilesError)

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
