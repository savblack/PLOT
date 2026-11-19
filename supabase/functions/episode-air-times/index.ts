/**
 * episode-air-times — hourly sync of exact episode drop times from TVmaze into
 * episode_airings, for every show someone follows.
 *
 * Phase 1 of exact drop times: it collects, nothing user-facing reads it yet.
 * Rules are in _shared/episodeAirings.js and unit-tested.
 *
 * Each run:
 *   1. Reads followed shows (list_items media_type 'tv', and watching_progress),
 *      the same definition new-episode-notifications uses.
 *   2. Links up to LINK_PER_RUN unlinked ones to TVmaze: TMDB external_ids, then
 *      TVmaze /lookup/shows by TheTVDB id, then IMDb id. Never by title. No match
 *      is stored too, and retried after 14 days.
 *   3. Asks TVmaze which shows changed in the last day (/updates/shows, one call)
 *      and re-reads those, never-synced ones and any not read for 72 hours.
 *   4. Upserts each show's episodes within the kept window, noting when a drop
 *      time moved (the signal phase 3's alert brake watches).
 *
 * What makes it safe to run unattended:
 *   - TVmaze allows 20 calls per 10 seconds; calls are spaced to stay under it
 *     and a 429 is retried after a pause;
 *   - it stops starting TVmaze calls after about 100s and carries the rest to
 *     the next hour, the most urgent first, so nothing starves or hangs;
 *   - every call times out after 15s, and a failed call changes nothing for
 *     that show;
 *   - an episode TVmaze stops listing in the window (TBA, pushed out,
 *     renumbered) is deleted, so no stale time is left for an alert to use;
 *   - at 50% or more failed links and show reads the run reports ok:false;
 *   - one row per run lands in alert_job_runs.
 *
 * Auth: called by pg_cron via pg_net with the Vault service-role bearer
 * (run_episode_air_times, 20261119100000). Runnable by hand with the same
 * bearer; POST {"dry_run": true} reads and reports but writes nothing.
 *
 * Secrets: TMDB_API_KEY. TVmaze needs no key.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { reportError } from '../_shared/posthogLog.ts';
import { retryAfterMs, tmdbGetWithRetry } from '../_shared/tmdbRetry.ts';
import {
  KEEP_PAST_DAYS, airingRow, dedupeRows, isoDay, linkLookups, linkQueue, syncQueue, venueOf, withChanges, withdrawnRows,
} from '../_shared/episodeAirings.js';

type Db = SupabaseClient<Database>;
type LinkRow = Database['public']['Tables']['tvmaze_show_links']['Row'];

const JOB = 'episode-air-times';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const TVMAZE_BASE = 'https://api.tvmaze.com';
// TVmaze identifies callers by User-Agent; a generic client name, no contact details.
const TVMAZE_HEADERS = { 'User-Agent': 'Plot episode times (theplot.tv)' };

const PAGE_SIZE = 1000;
const ID_CHUNK = 200;
const UPSERT_CHUNK = 500;
// 20 calls per 10s is TVmaze's limit; 550ms apart keeps us at about 18.
const TVMAZE_GAP_MS = 550;
const TVMAZE_RETRY_MS = 10_000;
const TVMAZE_RETRY_MAX_MS = 20_000;
// Per call. The run deadline is only checked between shows, so this bounds
// how far past it one show can run.
const CALL_TIMEOUT_MS = 15_000;
const FETCH_DEADLINE_MS = 100_000;
// Linking costs a TMDB call and up to two TVmaze calls, so cap it per run and
// leave room for syncing. A large backlog clears over a few hours.
const LINK_PER_RUN = 40;
const MAX_FAILURE_RATE = 0.5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A fetch that gives up after CALL_TIMEOUT_MS, so one hung call cannot outlive the run. */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });

/**
 * Spaced TVmaze GET. Returns null for a 404 (no such show), throws on anything
 * else that fails. `weight` is how many requests the call really makes: a
 * matched /lookup answers with a redirect that fetch follows, so it is two.
 */
function tvmazeClient() {
  let next = 0;
  return async function get(path: string, weight = 1): Promise<any | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + TVMAZE_GAP_MS * weight;
      const res = await timedFetch(`${TVMAZE_BASE}${path}`, { headers: TVMAZE_HEADERS });
      if (res.ok) return await res.json();
      if (res.status === 404) { await res.body?.cancel(); return null; }
      await res.body?.cancel();
      if (res.status === 429 && attempt === 1) {
        const asked = retryAfterMs(res.headers.get('Retry-After'));
        await sleep(Math.min(TVMAZE_RETRY_MAX_MS, asked ?? TVMAZE_RETRY_MS));
        continue;
      }
      throw new Error(`TVmaze ${path.split('?')[0]} failed (${res.status})`);
    }
    throw new Error(`TVmaze ${path.split('?')[0]} failed`);
  };
}

/** Every distinct followed TMDB show id. */
async function followedShows(db: Db): Promise<number[]> {
  const ids = new Set<number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('list_items')
      .select('tmdb_id').eq('media_type', 'tv').order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`list_items read failed: ${error.message}`);
    for (const row of data ?? []) ids.add(row.tmdb_id);
    if (!data || data.length < PAGE_SIZE) break;
  }
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('watching_progress')
      .select('tmdb_id').order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`watching_progress read failed: ${error.message}`);
    for (const row of data ?? []) ids.add(row.tmdb_id);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return [...ids].filter(id => Number.isInteger(id) && id > 0);
}

async function readLinks(db: Db, tmdbIds: number[]): Promise<Map<number, LinkRow>> {
  const out = new Map<number, LinkRow>();
  for (let i = 0; i < tmdbIds.length; i += ID_CHUNK) {
    const { data, error } = await db.from('tvmaze_show_links').select('*').in('tmdb_id', tmdbIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`tvmaze_show_links read failed: ${error.message}`);
    for (const row of data ?? []) out.set(row.tmdb_id, row);
  }
  return out;
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
  } catch { /* pg_cron posts {} */ }

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const startedMs = Date.now();
  const deadline = startedMs + FETCH_DEADLINE_MS;
  const now = new Date(startedMs);
  const nowIso = now.toISOString();
  const tvmaze = tvmazeClient();

  const stats = {
    dry_run: dryRun,
    shows_followed: 0,
    links_attempted: 0, links_matched: 0, links_unmatched: 0,
    shows_due: 0, shows_synced: 0, shows_deferred: 0,
    episodes_written: 0, episodes_exact: 0, episodes_moved: 0, episodes_withdrawn: 0,
    // Units of work (one link, the update list, one show sync) and how many of
    // them failed, so a full TVmaze outage reads as 100%, not as a share of
    // individual requests.
    calls: 0, attempts: 0, failures: 0,
  };

  let runId: number | null = null;
  if (!dryRun) {
    const { data, error } = await db.from('alert_job_runs').insert({ job: JOB, started_at: nowIso }).select('id').single();
    if (error) reportError(JOB, 'alert_job_runs insert failed:', error); else runId = data.id;
  }
  const finish = async (ok: boolean, extra: Record<string, unknown> = {}) => {
    const body = { ok, ...stats, ...extra };
    if (runId !== null) {
      const { error } = await db.from('alert_job_runs')
        .update({ finished_at: new Date().toISOString(), ok, stats: body })
        .eq('id', runId);
      if (error) reportError(JOB, 'alert_job_runs update failed:', error);
    }
    return json(body, ok ? 200 : 500);
  };

  let followed: number[];
  let links: Map<number, LinkRow>;
  try {
    followed = await followedShows(db);
    links = await readLinks(db, followed);
  } catch (err) {
    reportError(JOB, err);
    return finish(false, { error: 'Could not read followed shows' });
  }
  stats.shows_followed = followed.length;

  // ── Link new shows ──
  for (const tmdbId of linkQueue(followed, links, now).slice(0, LINK_PER_RUN)) {
    if (Date.now() > deadline) break;
    stats.links_attempted++;
    stats.attempts++;
    try {
      stats.calls++;
      const ids = await tmdbGetWithRetry(`/tv/${tmdbId}/external_ids`, tmdbKey, { fetchImpl: timedFetch });
      let show: any = null;
      let source: 'thetvdb' | 'imdb' | 'none' = 'none';
      for (const lookup of linkLookups(ids)) {
        stats.calls++;
        show = await tvmaze(`/lookup/shows?${lookup.source}=${encodeURIComponent(lookup.value)}`, 2);
        if (show?.id) { source = lookup.source; break; }
      }
      const venue = venueOf(show);
      const row: Database['public']['Tables']['tvmaze_show_links']['Insert'] = {
        tmdb_id: tmdbId,
        tvmaze_id: show?.id ?? null,
        match_source: source,
        venue_kind: venue.kind,
        venue_name: venue.name,
        venue_country: venue.country && /^[A-Z]{2}$/.test(venue.country) ? venue.country : null,
        venue_timezone: venue.timezone,
        checked_at: nowIso,
      };
      if (show?.id) stats.links_matched++; else stats.links_unmatched++;
      if (!dryRun) {
        const { error } = await db.from('tvmaze_show_links').upsert(row, { onConflict: 'tmdb_id' });
        if (error) throw new Error(`tvmaze_show_links write failed: ${error.message}`);
      }
      links.set(tmdbId, { tvmaze_updated: null, synced_at: null, ...row } as LinkRow);
    } catch (err) {
      stats.failures++;
      reportError(JOB, err);
    }
  }

  // ── Re-read changed shows ──
  let updates: Record<string, number> = {};
  stats.attempts++;
  try {
    stats.calls++;
    updates = (await tvmaze('/updates/shows?since=day')) ?? {};
  } catch (err) {
    // Without the update list, only never-synced and stale shows are read.
    stats.failures++;
    reportError(JOB, err);
  }

  const linked = [...links.values()].filter((l): l is LinkRow & { tvmaze_id: number } => l.tvmaze_id !== null);
  const queue = syncQueue(linked, updates, now);
  stats.shows_due = queue.length;

  for (const [index, link] of queue.entries()) {
    if (Date.now() > deadline) { stats.shows_deferred = queue.length - index; break; }
    stats.attempts++;
    try {
      stats.calls++;
      const episodes = await tvmaze(`/shows/${link.tvmaze_id}/episodes`);
      if (!Array.isArray(episodes)) throw new Error(`TVmaze episodes for ${link.tvmaze_id} were not a list`);
      const rows = dedupeRows(episodes.map(ep => airingRow(ep, link.tmdb_id, now)).filter(Boolean));

      const { data: existingRows, error: readError } = await db.from('episode_airings')
        .select('season_number, episode_number, air_date, airs_at, previous_air_date, previous_airs_at, changed_at')
        .eq('tmdb_id', link.tmdb_id);
      if (readError) throw new Error(`episode_airings read failed: ${readError.message}`);
      const existing = new Map((existingRows ?? []).map(r => [`${r.season_number}:${r.episode_number}`, r]));
      const fresh = withChanges(rows, existing, now).map(r => ({ ...r, updated_at: nowIso }));
      const withdrawn = withdrawnRows(existingRows ?? [], rows);

      stats.episodes_exact += fresh.filter(r => r.time_source === 'exact').length;
      stats.episodes_moved += fresh.filter(r => r.changed_at === nowIso).length;
      stats.episodes_withdrawn += withdrawn.length;
      if (!dryRun) {
        for (let i = 0; i < fresh.length; i += UPSERT_CHUNK) {
          const { error } = await db.from('episode_airings')
            .upsert(fresh.slice(i, i + UPSERT_CHUNK), { onConflict: 'tmdb_id,season_number,episode_number' });
          if (error) throw new Error(`episode_airings write failed: ${error.message}`);
        }
        // A stored drop TVmaze no longer lists in the window (TBA, pushed out,
        // renumbered) will not happen at its stored time, so it goes.
        for (const gone of withdrawn) {
          const { error } = await db.from('episode_airings').delete()
            .eq('tmdb_id', link.tmdb_id)
            .eq('season_number', gone.season_number)
            .eq('episode_number', gone.episode_number);
          if (error) throw new Error(`episode_airings delete failed: ${error.message}`);
        }
        const { error } = await db.from('tvmaze_show_links')
          .update({ synced_at: nowIso, tvmaze_updated: updates[String(link.tvmaze_id)] ?? link.tvmaze_updated })
          .eq('tmdb_id', link.tmdb_id);
        if (error) throw new Error(`tvmaze_show_links update failed: ${error.message}`);
      }
      stats.episodes_written += fresh.length;
      stats.shows_synced++;
    } catch (err) {
      stats.failures++;
      reportError(JOB, err);
    }
  }

  // Episodes of shows nobody re-reads (unfollowed) would otherwise stay forever.
  if (!dryRun) {
    const { error } = await db.from('episode_airings').delete().lt('air_date', isoDay(now, -KEEP_PAST_DAYS));
    if (error) reportError(JOB, 'episode_airings prune failed:', error);
  }

  const failureRate = stats.attempts ? stats.failures / stats.attempts : 0;
  return finish(failureRate < MAX_FAILURE_RATE);
});
