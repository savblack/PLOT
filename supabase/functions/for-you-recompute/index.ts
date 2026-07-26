/**
 * Nightly recompute of the "For You" title-similarity table. Pure Postgres
 * work — this function just triggers recompute_title_similarity() with the
 * service role and reports how it went.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FOR_YOU_CRON_SECRET.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (req.headers.get('x-cron-secret') !== Deno.env.get('FOR_YOU_CRON_SECRET')) return new Response('Forbidden', { status: 403 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRole) return Response.json({ ok: false, error: 'For-you recompute is not configured.' }, { status: 500 })

  const admin = createClient(supabaseUrl, serviceRole)
  const { error } = await admin.rpc('recompute_title_similarity')
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  return Response.json({ ok: true })
})
