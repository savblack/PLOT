import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  // Delete all user data
  await supabaseClient.from('integration_outbox').delete().eq('user_id', userId)
  await supabaseClient.from('integration_items').delete().eq('user_id', userId)
  await supabaseClient.from('media_integrations').delete().eq('user_id', userId)
  await supabaseClient.from('journal').delete().eq('user_id', userId)
  await supabaseClient.from('list_items').delete().eq('user_id', userId)
  await supabaseClient.from('lists').delete().eq('user_id', userId)
  await supabaseClient.from('journal_board').delete().eq('user_id', userId)
  await supabaseClient.from('follows').delete().or(`follower_id.eq.${userId},following_id.eq.${userId}`)
  await supabaseClient.from('profiles').delete().eq('id', userId)

  // Delete auth user — requires service role key
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

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
