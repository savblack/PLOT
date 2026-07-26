/**
 * Nightly recompute of the "For You" recommendation tables:
 *  1. Cross-user title_similarity (pure Postgres — recompute_title_similarity()).
 *  2. TMDB content_similarity — fetches TMDB's own /recommendations for any
 *     title with a real user signal that isn't cached yet. This is what
 *     gives early/light users (before there's enough cross-user overlap on
 *     PLOT itself) a real "For You" tier instead of falling straight to
 *     genre overlap. Cached per title and reused by every user who has
 *     signalled on it, so each title only costs one TMDB call, ever.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TMDB_API_KEY,
 * FOR_YOU_CRON_SECRET.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TMDB_BASE = 'https://api.themoviedb.org/3'
// Bounds each run's TMDB call volume. A title only needs fetching once ever,
// so steady-state runs (after the initial backlog drains) do near-zero work.
const CONTENT_SIMILARITY_BATCH_SIZE = 50
const CONTENT_SIMILARITY_TOP_N = 10

type Gap = { tmdb_id: number; media_type: 'movie' | 'tv' }
type TmdbResult = { id?: number; vote_average?: number; vote_count?: number }

async function fetchRecommendations(gap: Gap, tmdbKey: string): Promise<TmdbResult[]> {
  const response = await fetch(
    `${TMDB_BASE}/${gap.media_type}/${gap.tmdb_id}/recommendations?api_key=${encodeURIComponent(tmdbKey)}`
  )
  if (!response.ok) throw new Error(`TMDB recommendations failed for ${gap.media_type}/${gap.tmdb_id} (${response.status})`)
  const body = await response.json()
  return (body?.results ?? []) as TmdbResult[]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (req.headers.get('x-cron-secret') !== Deno.env.get('FOR_YOU_CRON_SECRET')) return new Response('Forbidden', { status: 403 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const tmdbKey = Deno.env.get('TMDB_API_KEY')
  if (!supabaseUrl || !serviceRole || !tmdbKey) return Response.json({ ok: false, error: 'For-you recompute is not configured.' }, { status: 500 })

  const admin = createClient(supabaseUrl, serviceRole)

  const { error: similarityError } = await admin.rpc('recompute_title_similarity')
  if (similarityError) return Response.json({ ok: false, error: similarityError.message }, { status: 500 })

  const { data: gaps, error: gapsError } = await admin.rpc('for_you_content_similarity_gaps', { p_limit: CONTENT_SIMILARITY_BATCH_SIZE })
  if (gapsError) return Response.json({ ok: false, error: gapsError.message }, { status: 500 })

  let cached = 0
  let failed = 0
  for (const gap of (gaps ?? []) as Gap[]) {
    try {
      const results = await fetchRecommendations(gap, tmdbKey)
      const ranked = results
        .filter(result => Number.isInteger(result.id))
        .slice(0, CONTENT_SIMILARITY_TOP_N)
      if (!ranked.length) { cached++; continue } // no recommendations — still mark as covered so it isn't retried every run

      const rows = ranked.map((result, index) => ({
        tmdb_id_a: gap.tmdb_id,
        media_type_a: gap.media_type,
        tmdb_id_b: result.id,
        // TMDB recommendations don't declare media_type per-result on these
        // endpoints — they're always the same type as the source title.
        media_type_b: gap.media_type,
        // Blend TMDB's own ranking (position) with vote_average so a
        // well-regarded #8 doesn't lose to a barely-rated #1.
        score: (CONTENT_SIMILARITY_TOP_N - index) * (1 + (result.vote_average ?? 0) / 10),
      }))
      const { error: insertError } = await admin.from('content_similarity').upsert(rows, { onConflict: 'tmdb_id_a,media_type_a,tmdb_id_b,media_type_b' })
      if (insertError) throw insertError
      cached++
    } catch (error) {
      console.error(error)
      failed++
    }
  }

  return Response.json({ ok: true, content_similarity_cached: cached, content_similarity_failed: failed })
})
