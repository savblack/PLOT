/**
 * movie-release-notifications — daily sweep that writes a `movie_release`
 * notification for everyone who has a movie on one of their lists, on the day
 * it first comes out in their region: in cinemas, or to watch at home.
 *
 * Free for everyone, in-app only. The episode equivalent is
 * new-episode-notifications; the Premium "a person you follow has a new film"
 * alert is premium-alerts. Rules live in _shared/movieReleaseAlerts.js and are
 * unit-tested (apps/web/tests/unit/movieReleaseAlerts.test.js).
 *
 * Who is told: a person with the film in list_items (any list, so the
 * watchlist counts) who has not logged watching it and did not save it on or
 * after the release date. The release date is the film's first general
 * theatrical or digital release in the person's own region (profiles.region,
 * the app's default when unset), read from TMDB /movie/{id}/release_dates. A
 * film with no entry for the region is left alone: the primary date does not
 * say it is out where they live.
 *
 * One row per person per film, ever. The dedupe key is the same one
 * premium-alerts uses for a followed person's film, so a film that is both on
 * your list and by someone you follow is announced once, by whichever job runs
 * first. This job runs after premium-alerts' people run (21:00 UTC) so that,
 * when both apply, the richer "with <person>" row wins.
 *
 * Cost: one TMDB call per distinct saved film that could plausibly be out
 * (worthChecking), capped per run, never one per person. TMDB is only asked
 * about films, not about people.
 *
 * Idempotent: rows are upserted on (user_id, dedupe_key) with ignoreDuplicates,
 * and the look-back window lets a missed run heal on the next one.
 *
 * There is no per-title mute or global switch yet, the same as new_episode.
 * When they land, this is where they are enforced, server-side.
 *
 * Auth: called by pg_cron via pg_net with the Vault service-role bearer
 * (run_movie_release_notifications, 20261003090000). Also runnable by hand with
 * the same bearer; POST {"dry_run": true} reports what it would write and
 * writes nothing.
 *
 * Secrets: TMDB_API_KEY.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { alertRegion, isoDay } from '../_shared/premiumAlerts.js';
import {
  MOVIE_LOOK_BACK_DAYS, movieReleaseKey, regionsInWindow, skipReason, worthChecking,
} from '../_shared/movieReleaseAlerts.js';
import { mapWithConcurrency, tmdbGet, TMDB_CONCURRENCY } from '../_shared/peopleFeedJob.ts';

type Db = SupabaseClient<Database>;
type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Cost caps: one run scales with the number of distinct saved films, not with
// people, but it still needs a ceiling on TMDB calls and execution time.
const PAGE_SIZE = 1000;
const MAX_MOVIES_PER_RUN = 4000;
const INSERT_CHUNK = 500;
// PostgREST puts .in() lists in the URL, so keep each one short.
const ID_CHUNK = 200;
// Above this share of failed TMDB calls, report ok:false so a bad key or a TMDB
// outage shows up in the cron log instead of as a quiet day.
const MAX_FAILURE_RATE = 0.5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Saved = { userId: string; savedAt: string | null };
type Movie = {
  tmdbId: number;
  title: string | null;
  posterPath: string | null;
  primaryDate: string | null;
  savers: Map<string, Saved>;
};

/** Every saved film → who saved it and when. Earliest save per person wins. */
async function savedMovies(db: Db): Promise<Map<number, Movie>> {
  const byMovie = new Map<number, Movie>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('list_items')
      .select('user_id, tmdb_id, title, poster_path, release_date, created_at')
      .eq('media_type', 'movie')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`list_items read failed: ${error.message}`);
    for (const row of data ?? []) {
      let movie = byMovie.get(row.tmdb_id);
      if (!movie) {
        byMovie.set(row.tmdb_id, movie = { tmdbId: row.tmdb_id, title: null, posterPath: null, primaryDate: null, savers: new Map() });
      }
      // The same film on several lists carries the same display cache; take the
      // first usable value of each.
      movie.title ??= row.title || null;
      movie.posterPath ??= row.poster_path || null;
      movie.primaryDate ??= row.release_date || null;
      const existing = movie.savers.get(row.user_id);
      // A row with no timestamp means "unknown, so assume long ago", and that has
      // to stick: otherwise a later row's timestamp would make an old save look
      // recent and skip them as added_on_or_after.
      if (!existing) movie.savers.set(row.user_id, { userId: row.user_id, savedAt: row.created_at });
      else if (existing.savedAt !== null) {
        existing.savedAt = row.created_at === null || row.created_at < existing.savedAt ? row.created_at : existing.savedAt;
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return byMovie;
}

/** `${userId}:${tmdbId}` for every pair where the person has logged watching the film. */
async function watchedPairs(db: Db, movieIds: number[], userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!movieIds.length || !userIds.length) return out;
  for (let i = 0; i < movieIds.length; i += ID_CHUNK) {
    const ids = movieIds.slice(i, i + ID_CHUNK);
    for (let u = 0; u < userIds.length; u += ID_CHUNK) {
      const users = userIds.slice(u, u + ID_CHUNK);
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db.from('history')
          .select('user_id, tmdb_id')
          .eq('media_type', 'movie')
          .in('tmdb_id', ids)
          .in('user_id', users)
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`history read failed: ${error.message}`);
        for (const row of data ?? []) out.add(`${row.user_id}:${row.tmdb_id}`);
        if (!data || data.length < PAGE_SIZE) break;
      }
    }
  }
  return out;
}

/** Region for each of these users (the app's default when unset). */
async function regionsFor(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const regions = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += ID_CHUNK) {
    const { data, error } = await db.from('profiles')
      .select('id, region')
      .in('id', userIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`profiles read failed: ${error.message}`);
    for (const p of data ?? []) regions.set(p.id, alertRegion(p.region));
  }
  return regions;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return json({ ok: false, error: 'TMDB_API_KEY is not set' }, 500);

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch { /* no body is the normal case: pg_cron posts {} */ }

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const now = new Date();
  const today = isoDay(now);
  const since = isoDay(now, MOVIE_LOOK_BACK_DAYS);

  let saved: Map<number, Movie>;
  try {
    saved = await savedMovies(db);
  } catch (err) {
    // Details go to the function log, not the response (no stack traces out).
    console.error(err);
    return json({ ok: false, error: 'Could not read saved films' }, 500);
  }

  // Films with a usable primary date first, so the cap trims the unknowns.
  const candidates = [...saved.values()]
    .filter(m => worthChecking(m.primaryDate, today))
    .sort((a, b) => Number(b.primaryDate !== null) - Number(a.primaryDate !== null))
    .slice(0, MAX_MOVIES_PER_RUN);

  let failures = 0;
  const looked = await mapWithConcurrency(candidates, TMDB_CONCURRENCY, async (movie) => {
    try {
      return { movie, inRange: regionsInWindow(await tmdbGet(`/movie/${movie.tmdbId}/release_dates`, tmdbKey), today, since) };
    } catch (err) {
      failures++;
      console.error(err);
      return null;
    }
  });
  // Almost every saved film has nothing out in the window anywhere. Only the
  // people who saved one that does need their region read.
  const outNow = looked.filter((r): r is NonNullable<typeof r> => r !== null && Object.keys(r.inRange).length > 0);

  let regions: Map<string, string>;
  try {
    regions = await regionsFor(db, [...new Set(outNow.flatMap(r => [...r.movie.savers.keys()]))]);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Could not read profiles' }, 500);
  }

  type Hit = { movie: Movie; userId: string; savedAt: string | null; kind: 'theatrical' | 'digital'; date: string };
  const hits: Hit[] = [];
  for (const { movie, inRange } of outNow) {
    for (const saver of movie.savers.values()) {
      const release = inRange[regions.get(saver.userId) ?? ''];
      if (release) hits.push({ movie, userId: saver.userId, savedAt: saver.savedAt, kind: release.kind, date: release.date });
    }
  }

  let watched: Set<string>;
  try {
    watched = await watchedPairs(db, [...new Set(hits.map(h => h.movie.tmdbId))], [...new Set(hits.map(h => h.userId))]);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Could not read watch history' }, 500);
  }

  const skipped = { watched: 0, added_on_or_after: 0 };
  const rows: NotificationInsert[] = [];
  for (const hit of hits) {
    const reason = skipReason(
      { savedAt: hit.savedAt, watched: watched.has(`${hit.userId}:${hit.movie.tmdbId}`) },
      { date: hit.date },
    );
    if (reason) { skipped[reason]++; continue; }
    rows.push({
      user_id: hit.userId,
      type: 'movie_release',
      dedupe_key: movieReleaseKey(hit.movie.tmdbId),
      tmdb_id: hit.movie.tmdbId,
      media_type: 'movie',
      media_title: hit.movie.title,
      media_poster_path: hit.movie.posterPath,
      air_date: hit.date,
      release_kind: hit.kind,
    });
  }

  let written = 0;
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { data, error } = await db.from('notifications')
        .upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error('notifications write failed:', error);
        return json({ ok: false, error: 'Could not write notifications', written }, 500);
      }
      written += data?.length ?? 0;
    }
  }

  const failureRate = candidates.length ? failures / candidates.length : 0;
  return json({
    ok: failureRate <= MAX_FAILURE_RATE,
    dry_run: dryRun,
    window: { since, today },
    movies_saved: saved.size,
    movies_checked: candidates.length,
    movies_out_now: outNow.length,
    movies_capped: saved.size > candidates.length && [...saved.values()].filter(m => worthChecking(m.primaryDate, today)).length > candidates.length,
    tmdb_failures: failures,
    people_in_range: hits.length,
    skipped,
    rows_candidate: rows.length,
    rows_written: written,
  });
});
