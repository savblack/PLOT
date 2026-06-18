import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runDataExport } from './collect.js'

const EXPORT_VERSION = 1

function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  // Client with user context — RLS guarantees we only ever read the caller's
  // own rows, so no service-role key is needed here.
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) return new Response('Unauthorized', { status: 401 })

  const result = await runDataExport(supabaseClient, user.id)
  if (result.error) {
    return jsonError(
      result.error.message || `Failed to read rows from ${result.table}.`,
      500,
      { table: result.table },
    )
  }

  const payload = {
    export_version: EXPORT_VERSION,
    generated_at: new Date().toISOString(),
    user: { id: user.id, email: user.email ?? null },
    data: result.data,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
