/**
 * new-episode-notifications — daily sweep that writes a `new_episode`
 * notification for everyone following a show whose latest episode aired on
 * either of the previous two UTC days.
 *
 * Never today: TMDB's air_date is the local (usually US) broadcast date, so an
 * evening network episode dated today has not aired yet at the 12:00 UTC run.
 * Looking only at yesterday and the day before means "is out" is always true,
 * at the cost of a streaming drop arriving the morning after rather than the
 * same day.
 *
 * "Following" means the show is in one of the person's lists (list_items,
 * media_type 'tv') or in watching_progress. Followers are then filtered by
 * _shared/newEpisodeRecipients.ts: skipped if they followed on or after the air
 * date, have already watched the start of the drop, or last marked the show
 * did-not-finish. There is no per-show mute or global opt-out yet; both are
 * follow-ups, and when they land this is where they are enforced, server-side,
 * rather than hidden in the UI.
 *
 * One TMDB details call per followed show (deduplicated across people), plus a
 * season call only for shows that actually aired, to find where a same-day drop
 * starts. A drop of several episodes is ONE row: episode_number is the first
 * episode of the drop and episode_count covers the rest.
 *
 * Idempotent: rows are upserted against notifications_new_episode_once with
 * ignoreDuplicates, so the two-day look-back lets a missed run heal on the next
 * one without anyone seeing the same episode twice.
 *
 * Push delivery is not wired yet. When it is, it sends for the rows this run
 * inserted (the upsert returns only those), so the in-app row stays the single
 * source of truth and push is a delivery channel on top of it.
 *
 * Auth: called by pg_cron via pg_net with the Vault service-role bearer
 * (run_new_episode_notifications, 20260925120000). Also runnable by hand with
 * the same bearer; POST {"dry_run": true} reports what it would write and
 * writes nothing.
 *
 * Secrets: TMDB_API_KEY.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { earliest, latestIsDnf, skipReason, type Follower, type HistoryRow, type SkipReason } from '../_shared/newEpisodeRecipients.ts';

type Db = SupabaseClient<Database>;
type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const TMDB_BASE = 'https://api.themoviedb.org/3';

// Cost caps: one run scales with the number of distinct followed shows, not
// with people, but it still needs a ceiling on TMDB calls and execution time.
const PAGE_SIZE = 1000;
const MAX_SHOWS_PER_RUN = 4000;
const TMDB_CONCURRENCY = 6;
const INSERT_CHUNK = 500;
// PostgREST puts .in() lists in the URL, so keep each one short.
const ID_CHUNK = 200;
// Days before today (UTC) that count as "just aired": yesterday and the day before.
const LOOK_BACK_DAYS = 2;
// Above this share of failed TMDB calls, report ok:false so a bad key or a TMDB
// outage shows up in the cron log instead of as a quiet day.
const MAX_FAILURE_RATE = 0.5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** UTC calendar date, `days` before `from`, as YYYY-MM-DD. */
function isoDay(from: Date, days = 0): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - days));
  return d.toISOString().slice(0, 10);
}

/** Every followed show id → its followers, with when they followed and their progress. */
async function followersByShow(db: Db): Promise<Map<number, Map<string, Follower>>> {
  const byShow = new Map<number, Map<string, Follower>>();
  const follower = (tmdbId: number, userId: string): Follower => {
    let show = byShow.get(tmdbId);
    if (!show) byShow.set(tmdbId, show = new Map());
    let f = show.get(userId);
    if (!f) show.set(userId, f = { userId, followedAt: null, progress: null, dnf: false });
    return f;
  };
  // followedAt is the earliest timestamp across a person's rows for the show.
  // A row with no timestamp means "unknown, so assume long ago", and that has
  // to stick: otherwise a later row's timestamp would make an old follow look
  // recent and skip them as followed_after.
  const unknownFollow = new Set<Follower>();
  const noteFollow = (f: Follower, at: string | null) => {
    if (unknownFollow.has(f)) return;
    if (!at) { unknownFollow.add(f); f.followedAt = null; return; }
    f.followedAt = earliest(f.followedAt, at);
  };

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('list_items')
      .select('user_id, tmdb_id, created_at')
      .eq('media_type', 'tv')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`list_items read failed: ${error.message}`);
    for (const row of data ?? []) noteFollow(follower(row.tmdb_id, row.user_id), row.created_at);
    if (!data || data.length < PAGE_SIZE) break;
  }

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('watching_progress')
      .select('user_id, tmdb_id, started_at, current_season, current_episode')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`watching_progress read failed: ${error.message}`);
    for (const row of data ?? []) {
      const f = follower(row.tmdb_id, row.user_id);
      noteFollow(f, row.started_at);
      f.progress = { season: row.current_season, episode: row.current_episode };
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  return byShow;
}

/** Marks followers whose latest history row for an aired show is did-not-finish. */
async function markDnf(db: Db, byShow: Map<number, Map<string, Follower>>, showIds: number[]) {
  const rowsByKey = new Map<string, HistoryRow[]>();
  for (let i = 0; i < showIds.length; i += ID_CHUNK) {
    const ids = showIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db.from('history')
        .select('id, user_id, tmdb_id, dnf, watched_at, created_at')
        .eq('media_type', 'tv')
        .in('tmdb_id', ids)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`history read failed: ${error.message}`);
      for (const row of data ?? []) {
        const key = `${row.tmdb_id}:${row.user_id}`;
        let list = rowsByKey.get(key);
        if (!list) rowsByKey.set(key, list = []);
        list.push({ dnf: row.dnf, watched_at: row.watched_at, created_at: row.created_at });
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  for (const [key, rows] of rowsByKey) {
    const [tmdbId, userId] = key.split(':');
    const f = byShow.get(Number(tmdbId))?.get(userId);
    if (f) f.dnf = latestIsDnf(rows);
  }
}

type Aired = {
  tmdbId: number;
  title: string | null;
  posterPath: string | null;
  airDate: string;
  season: number;
  firstEpisode: number;
  count: number;
};

type TmdbEpisode = { air_date?: string | null; season_number?: number; episode_number?: number };

async function tmdbGet(path: string, key: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}&language=en-US`);
  if (!res.ok) throw new Error(`TMDB ${path} failed (${res.status})`);
  return await res.json();
}

/**
 * The show's latest aired episode if it falls in [since, until], widened to the
 * start of its same-day drop. null when nothing new aired.
 */
async function latestAired(tmdbId: number, since: string, until: string, key: string): Promise<Aired | null> {
  const show = await tmdbGet(`/tv/${tmdbId}`, key);
  const last = show.last_episode_to_air as TmdbEpisode | null | undefined;
  const airDate = last?.air_date;
  if (!last || !airDate || airDate < since || airDate > until) return null;
  const season = last.season_number;
  const lastEpisode = last.episode_number;
  if (typeof season !== 'number' || typeof lastEpisode !== 'number') return null;

  let firstEpisode = lastEpisode;
  let count = 1;
  if (lastEpisode > 1) {
    // Streaming drops release a whole block on one date; TMDB's
    // last_episode_to_air names only the final one. Widen to the block.
    const seasonBody = await tmdbGet(`/tv/${tmdbId}/season/${season}`, key);
    const sameDay = ((seasonBody.episodes as TmdbEpisode[] | undefined) ?? [])
      .filter(ep => ep.air_date === airDate && typeof ep.episode_number === 'number' && ep.episode_number <= lastEpisode)
      .map(ep => ep.episode_number as number);
    if (sameDay.length) {
      firstEpisode = Math.min(...sameDay);
      count = lastEpisode - firstEpisode + 1;
    }
  }

  return {
    tmdbId,
    title: typeof show.name === 'string' ? show.name : null,
    posterPath: typeof show.poster_path === 'string' ? show.poster_path : null,
    airDate,
    season,
    firstEpisode,
    count,
  };
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
  const until = isoDay(now, 1);
  const since = isoDay(now, LOOK_BACK_DAYS);

  let byShow: Map<number, Map<string, Follower>>;
  try {
    byShow = await followersByShow(db);
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }

  const showIds = [...byShow.keys()].slice(0, MAX_SHOWS_PER_RUN);
  let failures = 0;
  const aired = (await mapWithConcurrency(showIds, TMDB_CONCURRENCY, async (id) => {
    try {
      return await latestAired(id, since, until, tmdbKey);
    } catch (err) {
      failures++;
      console.error(err);
      return null;
    }
  })).filter((a): a is Aired => a !== null);

  try {
    await markDnf(db, byShow, aired.map(a => a.tmdbId));
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }

  const skipped: Record<SkipReason, number> = { followed_after: 0, watched: 0, dnf: 0 };
  const rows: NotificationInsert[] = aired.flatMap(show => [...(byShow.get(show.tmdbId)?.values() ?? [])].filter(f => {
    const reason = skipReason(f, { airDate: show.airDate, season: show.season, firstEpisode: show.firstEpisode });
    if (reason) skipped[reason]++;
    return reason === null;
  }).map(f => ({
    user_id: f.userId,
    type: 'new_episode',
    tmdb_id: show.tmdbId,
    media_type: 'tv',
    season_number: show.season,
    episode_number: show.firstEpisode,
    episode_count: show.count,
    media_title: show.title,
    media_poster_path: show.posterPath,
    air_date: show.airDate,
  })));

  let written = 0;
  if (!dryRun) {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { data, error } = await db.from('notifications')
        .upsert(rows.slice(i, i + INSERT_CHUNK), {
          onConflict: 'user_id,type,tmdb_id,season_number,episode_number',
          ignoreDuplicates: true,
        })
        .select('id');
      if (error) return json({ ok: false, error: `notifications write failed: ${error.message}`, written }, 500);
      written += data?.length ?? 0;
    }
  }

  const failureRate = showIds.length ? failures / showIds.length : 0;
  return json({
    ok: failureRate <= MAX_FAILURE_RATE,
    dry_run: dryRun,
    window: { since, until },
    shows_followed: byShow.size,
    shows_checked: showIds.length,
    shows_capped: byShow.size > showIds.length,
    shows_aired: aired.length,
    tmdb_failures: failures,
    skipped,
    rows_candidate: rows.length,
    rows_written: written,
  });
});
