/**
 * Resolves a critic score (Rotten Tomatoes %, via OMDb) for a title by IMDb id.
 *
 * OMDb's free tier is capped at ~1,000 req/day and RT scores rarely change, so
 * every lookup checks the `critic_scores` cache table first and only calls
 * OMDb on a miss or a stale (30+ day old) row. Best-effort: with no key, no
 * IMDb id, or an OMDb miss, this returns `{ criticScore: null }` rather than
 * an error — the panel simply omits the critic score.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serviceKey } from '../_shared/serviceKey.ts'

function allowedOrigin(origin: string | null) {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return origin;
    if (protocol === 'https:' && hostname.endsWith('.plot-5wr.pages.dev')) return origin;
  } catch { /* use canonical origin */ }
  return 'https://app.theplot.tv';
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NEGATIVE_CACHE_TTL_MS = 60 * 60 * 1000; // retry misses after 1 hour
const OMDB_BASE = 'https://www.omdbapi.com/';

async function callerBucket(req: Request, salt: string) {
  const address = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${address}`),
  );
  return `caller:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, origin, 405);

  const imdbId = new URL(req.url).searchParams.get('imdb_id') || '';
  if (!/^tt\d{7,10}$/.test(imdbId)) return json({ error: 'Invalid imdb_id' }, origin, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRole = serviceKey();
  const admin = createClient(supabaseUrl, serviceRole);

  const { data: cached } = await admin
    .from('critic_scores')
    .select('critic_score, source, fetched_at')
    .eq('imdb_id', imdbId)
    .maybeSingle();

  const cacheTtl = cached?.critic_score == null ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < cacheTtl) {
    return json({ criticScore: cached.critic_score, source: cached.source }, origin);
  }

  const key = Deno.env.get('OMDB_API_KEY');
  if (!key) return json({ criticScore: cached?.critic_score ?? null, source: cached?.source ?? null }, origin);

  // One database transaction admits both the caller and the global daily
  // budget. It also bounds/prunes caller buckets so address rotation cannot
  // turn the limiter itself into unbounded storage growth.
  const bucket = await callerBucket(req, Deno.env.get('CRITIC_RATE_LIMIT_SALT') || serviceRole);
  const { data: allowed, error: quotaError } = await admin.rpc('admit_critic_score_request', {
    p_caller_bucket: bucket,
  });
  if (quotaError || !allowed) {
    return json({ criticScore: cached?.critic_score ?? null, source: cached?.source ?? null, rateLimited: true }, origin);
  }

  let criticScore: number | null = null;
  let source: string | null = null;
  let providerResponded = false;
  try {
    const res = await fetch(`${OMDB_BASE}?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdbId)}&tomatoes=true`);
    const data = res.ok ? await res.json().catch(() => null) : null;
    providerResponded = Boolean(data);
    if (data && data.Response !== 'False') {
      const rt = data.Ratings?.find((r: { Source: string }) => r.Source === 'Rotten Tomatoes')?.Value;
      const parsed = rt ? parseInt(rt, 10) : NaN;
      if (Number.isFinite(parsed)) {
        criticScore = parsed;
        source = 'Rotten Tomatoes';
      }
    }
  } catch {
    // Preserve a stale valid score and retry transient provider failures later.
  }

  if (providerResponded) {
    await admin
      .from('critic_scores')
      .upsert({ imdb_id: imdbId, critic_score: criticScore, source, fetched_at: new Date().toISOString() });
  }

  return json({
    criticScore: providerResponded ? criticScore : cached?.critic_score ?? null,
    source: providerResponded ? source : cached?.source ?? null,
  }, origin);
});
