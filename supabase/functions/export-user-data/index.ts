import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runDataExport } from './collect.js'

const EXPORT_VERSION = 1

Deno.serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
  // Browsers send this without a bearer token. The actual export still requires
  // a verified user and reads only through that user's RLS context.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const jsonError = (message: string, status = 500, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ error: message, ...extra }), { status, headers })
  if (req.method !== 'POST') return jsonError('Method not allowed', 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError('Unauthorized', 401)

  // Client with user context — RLS guarantees we only ever read the caller's
  // own rows, so no service-role key is needed here.
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) return jsonError('Unauthorized', 401)

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
    headers,
  })
})
