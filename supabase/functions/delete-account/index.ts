import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runAccountCleanup } from './cleanup.js'

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

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
