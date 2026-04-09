import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { watchHistory, layoutStyle } = await req.json()

  const topItems = (watchHistory ?? []).filter((i: { rating: number }) => i.rating >= 4).slice(0, 15)

  const prompt = `You are a film critic writing a short, warm, personal taste summary.
Based on this watch history (title, rating 1-5, mood): ${JSON.stringify(topItems)}
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
