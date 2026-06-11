import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function attachmentPathsFrom(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return []
    const marker = '/storage/v1/object/public/feedback-attachments/'
    const index = entry.indexOf(marker)
    if (index === -1) return []
    return [decodeURIComponent(entry.slice(index + marker.length))]
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

  const { data: feedbackRows } = await supabaseClient
    .from('feedback')
    .select('attachments')
    .eq('user_id', userId)

  const attachmentPaths = (feedbackRows ?? [])
    .flatMap((row) => attachmentPathsFrom(row.attachments))
    .filter(Boolean)

  // Delete all user data
  await supabaseClient.from('integration_outbox').delete().eq('user_id', userId)
  await supabaseClient.from('integration_items').delete().eq('user_id', userId)
  await supabaseClient.from('media_integrations').delete().eq('user_id', userId)
  await supabaseClient.from('watching_progress').delete().eq('user_id', userId)
  await supabaseClient.from('reminders').delete().eq('user_id', userId)
  await supabaseClient.from('user_favourites').delete().eq('user_id', userId)
  await supabaseClient.from('user_top_lists').delete().eq('user_id', userId)
  await supabaseClient.from('user_custom_list_items').delete().eq('user_id', userId)
  await supabaseClient.from('user_custom_lists').delete().eq('user_id', userId)
  await supabaseClient.from('feedback').delete().eq('user_id', userId)
  await supabaseClient.from('journal').delete().eq('user_id', userId)
  await supabaseClient.from('list_items').delete().eq('user_id', userId)
  await supabaseClient.from('lists').delete().eq('user_id', userId)
  await supabaseClient.from('journal_board').delete().eq('user_id', userId)
  await supabaseClient.from('follows').delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`)
  await supabaseClient.from('profiles').delete().eq('id', userId)

  if (attachmentPaths.length > 0) {
    await supabaseAdmin.storage.from('feedback-attachments').remove(attachmentPaths)
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
