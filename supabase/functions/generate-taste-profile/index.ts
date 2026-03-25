import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user via their JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { genres, seedTitles, region } = await req.json();

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

    const genreLabels = (genres ?? []).join(', ') || 'not specified';
    const titleList = (seedTitles ?? []).join(', ') || 'not specified';

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'You are a perceptive film critic who writes precise, evocative taste profiles for cinephiles. Your profiles feel personal and insightful, revealing something true about the viewer\'s sensibility. Always write in second person.',
      messages: [
        {
          role: 'user',
          content: `Based on the following preferences and loved titles, write a 2–3 sentence taste profile in second person. Be specific and evocative — avoid generic phrases like "you love great stories". Capture what makes this person's taste distinctive.

Favorite genres: ${genreLabels}
Films/shows they loved: ${titleList}
Region: ${region ?? 'not specified'}

Write only the taste profile text. No preamble, no quotes around it.`,
        },
      ],
    });

    const tasteProfile = (message.content[0] as { text: string })?.text ?? '';

    // Save to profile using service role key (taste_profile is managed by Edge Function)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await serviceClient.from('profiles').update({ taste_profile: tasteProfile }).eq('id', user.id);

    return new Response(JSON.stringify({ taste_profile: tasteProfile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
