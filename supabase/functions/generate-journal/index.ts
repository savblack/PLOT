import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return true
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return true
    if (hostname.endsWith('.vercel.app')) return true
    return false
  } catch {
    return false
  }
}

const CANONICAL_ORIGIN = 'https://app.theplot.tv'
function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : CANONICAL_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

const DAILY_LIMIT = 20

serve(async (req) => {
  const origin = req.headers.get('Origin')
  const corsHeaders = cors(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (origin && !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Per-user daily cap. Fails open if the RPC is unavailable.
  const { data: allowed, error: limitError } = await supabaseClient.rpc('increment_ai_usage', {
    p_feature: 'journal',
    p_limit: DAILY_LIMIT,
  })
  if (!limitError && allowed === false) {
    return new Response(JSON.stringify({ error: 'Daily limit reached' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { watchHistory } = await req.json()

  const topItems = (watchHistory ?? []).filter((i: { rating: number }) => i.rating >= 8).slice(0, 15)

  const prompt = `You are a film critic writing a short, warm, personal taste summary.
Based on this watch history (title, rating 1-10 where 10 equals 5 stars, mood): ${JSON.stringify(topItems)}
Write 2-3 sentences describing this person's film taste in a distinctive, non-generic way.
Be specific to what they actually watched. No lists, no bullet points. Just flowing prose.`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('CLAUDE_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const ai = await resp.json()
  const summary = ai.content?.[0]?.text ?? ''

  return new Response(JSON.stringify({ summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
