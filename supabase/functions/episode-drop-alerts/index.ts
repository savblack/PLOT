/**
 * episode-drop-alerts — every 15 minutes, writes a `new_episode` notification
 * for each follower of a show whose exact drop time has just passed.
 *
 * Phase 3a of docs/features/episode-drop-times.md. Exact times come from
 * episode_airings (the hourly episode-air-times sync of TVmaze). Shows with only
 * a date are not touched here: the daily new-episode-notifications job still
 * tells those followers the next morning, and it is also the fallback for
 * everything this job skips. Both write against notifications_new_episode_once,
 * so nobody is told twice.
 *
 * Rules are in _shared/dropAlerts.js and unit-tested. Each run:
 *   1. Stops if the PostHog flag `kill-episode-drop-alerts` is on.
 *   2. Groups drops whose exact time passed in the last six hours. With none,
 *      it stops there.
 *   3. Applies the brake: if the time sync is stale, or too many nearby drops
 *      moved in the last day, it writes nothing and answers 500. The hourly
 *      pg_net health check (cron-health.yml) turns that into an incident issue
 *      and an email.
 *   4. Skips drops already announced in the last seven hours, and shows whose
 *      TVmaze venue is outside the US (their broadcast is not when a US viewer
 *      can watch; the daily job covers them).
 *   5. Confirms each drop with TMDB, a few at a time within 60 seconds: every
 *      episode of the drop must carry exactly the drop's date. A disagreement
 *      means the numbering differs, so it is left to the daily job, which
 *      works from TMDB alone.
 *   6. Reads only those shows' followers and applies the same skip rules as the
 *      daily job (_shared/newEpisodeRecipients.ts), including the new
 *      "Episode alerts in Plot" switch.
 *
 * Push is not sent here. send-push picks the new rows up on its next quarter
 * hour and applies the phone rules (quiet hours, the 7 AM summary, the phone
 * switch).
 *
 * Auth: pg_cron via pg_net with the Vault service-role bearer
 * (run_episode_drop_alerts, 20261120110000). POST {"dry_run": true} reports
 * what it would write and writes nothing (not even the run log).
 *
 * Secrets: TMDB_API_KEY.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { reportError } from '../_shared/posthogLog.ts';
import { POSTHOG_HOST, POSTHOG_TOKEN } from '../_shared/posthog.ts';
import { tmdbGetWithRetry } from '../_shared/tmdbRetry.ts';
import { skipReason, type SkipReason } from '../_shared/newEpisodeRecipients.ts';
import { followersByShow, markAlertsOff, markDnf, markMuted } from '../_shared/newEpisodeFollowers.ts';
import {
  BRAKE_AHEAD_HOURS, DUE_LOOK_BACK_HOURS, brakeReason, dropAlertsKilled, dueDrops, tmdbAgrees,
} from '../_shared/dropAlerts.js';

type Db = SupabaseClient<Database>;
type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

const JOB = 'episode-drop-alerts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const HOUR_MS = 60 * 60 * 1000;
const ID_CHUNK = 200;
const CALL_TIMEOUT_MS = 15_000;
// TMDB checks run a few at a time and stop starting after this, well inside
// pg_net's 120s; anything unchecked is picked up by the next run.
const TMDB_CONCURRENCY = 4;
const TMDB_DEADLINE_MS = 60_000;
// A drop already announced in this window is not checked again.
const TOLD_LOOK_BACK_MS = 7 * HOUR_MS;
const INSERT_CHUNK = 500;
const PAGE_SIZE = 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });

/** True only when PostHog answered and the kill flag is on. Fails open. */
async function killed(): Promise<boolean> {
  try {
    const res = await timedFetch(`${POSTHOG_HOST}/flags/?v=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Same fixed reader id as packages/core/killSwitches.js: no person is sent.
      body: JSON.stringify({ api_key: POSTHOG_TOKEN, distinct_id: 'plot-kill-switches' }),
    });
    if (!res.ok) { await res.body?.cancel(); return false; }
    return dropAlertsKilled(await res.json());
  } catch {
    return false;
  }
}

async function nearbyAirings(db: Db, now: Date) {
  const from = new Date(now.getTime() - DUE_LOOK_BACK_HOURS * HOUR_MS).toISOString();
  const to = new Date(now.getTime() + BRAKE_AHEAD_HOURS * HOUR_MS).toISOString();
  const out: Database['public']['Tables']['episode_airings']['Row'][] = [];
  for (let page = 0; ; page += PAGE_SIZE) {
    const { data, error } = await db.from('episode_airings').select('*')
      .eq('time_source', 'exact').gte('airs_at', from).lte('airs_at', to)
      .order('airs_at').order('tmdb_id').order('season_number').order('episode_number')
      .range(page, page + PAGE_SIZE - 1);
    if (error) throw new Error(`episode_airings read failed: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return out;
  }
}

/** `${tmdb}:${season}:${episode}` of new_episode rows written recently for these shows. */
async function alreadyTold(db: Db, tmdbIds: number[], now: Date): Promise<Set<string>> {
  const since = new Date(now.getTime() - TOLD_LOOK_BACK_MS).toISOString();
  const out = new Set<string>();
  for (let i = 0; i < tmdbIds.length; i += ID_CHUNK) {
    for (let page = 0; ; page += PAGE_SIZE) {
      const { data, error } = await db.from('notifications').select('tmdb_id, season_number, episode_number')
        .eq('type', 'new_episode').in('tmdb_id', tmdbIds.slice(i, i + ID_CHUNK)).gte('created_at', since)
        .order('id').range(page, page + PAGE_SIZE - 1);
      if (error) throw new Error(`notifications read failed: ${error.message}`);
      for (const r of data ?? []) out.add(`${r.tmdb_id}:${r.season_number}:${r.episode_number}`);
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return out;
}

/**
 * Shows whose TVmaze venue is outside the US (a BBC One broadcast, say). Their
 * "is out" moment is not when a US viewer can watch (decision 2), so they are
 * left to the daily job. A worldwide streamer has no country and is kept.
 */
async function foreignShows(db: Db, tmdbIds: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  for (let i = 0; i < tmdbIds.length; i += ID_CHUNK) {
    const { data, error } = await db.from('tvmaze_show_links').select('tmdb_id, venue_country')
      .in('tmdb_id', tmdbIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`tvmaze_show_links read failed: ${error.message}`);
    for (const r of data ?? []) if (r.venue_country && r.venue_country !== 'US') out.add(r.tmdb_id);
  }
  return out;
}

async function lastSyncOkAt(db: Db): Promise<string | null> {
  const { data, error } = await db.from('alert_job_runs').select('finished_at')
    .eq('job', 'episode-air-times').eq('ok', true).not('finished_at', 'is', null)
    .order('finished_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`alert_job_runs read failed: ${error.message}`);
  return data?.finished_at ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return json({ ok: false, error: 'TMDB_API_KEY is not set' }, 500);

  let dryRun = false;
  try {
    dryRun = (await req.json())?.dry_run === true;
  } catch { /* pg_cron posts {} */ }

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const now = new Date();
  const nowIso = now.toISOString();

  const stats: Record<string, unknown> = {
    dry_run: dryRun, killed: false, braked: null,
    drops_due: 0, drops_told: 0, drops_foreign: 0, drops_deferred: 0,
    drops_confirmed: 0, drops_unconfirmed: 0, tmdb_failures: 0,
    rows_candidate: 0, rows_written: 0,
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
        .update({ finished_at: new Date().toISOString(), ok, stats: body }).eq('id', runId);
      if (error) reportError(JOB, 'alert_job_runs update failed:', error);
    }
    return json(body, ok ? 200 : 500);
  };

  if (await killed()) {
    stats.killed = true;
    return finish(true);
  }

  let drops;
  try {
    const airings = await nearbyAirings(db, now);
    const due = dueDrops(airings, now);
    stats.drops_due = due.length;
    // The brake only matters when there is something to announce; a stale sync
    // with nothing due is cron-health's to report, not an incident from here.
    if (!due.length) return finish(true);
    const brake = brakeReason(airings, await lastSyncOkAt(db), now);
    if (brake) {
      stats.braked = brake;
      reportError(JOB, `brake on (${brake}): no drop alerts this run; the daily job covers them`);
      return finish(false, { error: `Brake on: ${brake}` });
    }
    const ids = [...new Set(due.map(d => d.tmdbId))];
    const told = await alreadyTold(db, ids, now);
    const foreign = await foreignShows(db, ids);
    drops = due.filter(d => {
      if (told.has(`${d.tmdbId}:${d.season}:${d.firstEpisode}`)) { stats.drops_told = (stats.drops_told as number) + 1; return false; }
      if (foreign.has(d.tmdbId)) { stats.drops_foreign = (stats.drops_foreign as number) + 1; return false; }
      return true;
    });
  } catch (err) {
    reportError(JOB, err);
    return finish(false, { error: 'Could not read drop times' });
  }
  if (!drops.length) return finish(true);

  // Confirm each drop with TMDB, and take its title and poster from the same call.
  type Confirmed = (typeof drops)[number] & { title: string | null; posterPath: string | null };
  const confirmed: Confirmed[] = [];
  const deadline = Date.now() + TMDB_DEADLINE_MS;
  let next = 0;
  let checked = 0;
  const worker = async () => {
    while (next < drops.length && Date.now() < deadline) {
      const drop = drops[next++];
      checked++;
      try {
        const show = await tmdbGetWithRetry(`/tv/${drop.tmdbId}?append_to_response=season/${drop.season}`, tmdbKey, { fetchImpl: timedFetch });
        const episodes = (show?.[`season/${drop.season}`]?.episodes ?? []) as { episode_number?: number; air_date?: string | null }[];
        if (!tmdbAgrees(episodes, drop)) { stats.drops_unconfirmed = (stats.drops_unconfirmed as number) + 1; continue; }
        confirmed.push({
          ...drop,
          title: typeof show?.name === 'string' ? show.name : null,
          posterPath: typeof show?.poster_path === 'string' ? show.poster_path : null,
        });
      } catch (err) {
        stats.tmdb_failures = (stats.tmdb_failures as number) + 1;
        reportError(JOB, err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(TMDB_CONCURRENCY, drops.length) }, worker));
  stats.drops_deferred = drops.length - checked;
  stats.drops_confirmed = confirmed.length;
  // Every TMDB check failing is an outage worth an incident; some is not.
  const tmdbOk = checked === 0 || (stats.tmdb_failures as number) < checked;
  if (!confirmed.length) return finish(tmdbOk);

  const showIds = [...new Set(confirmed.map(d => d.tmdbId))];
  let byShow;
  try {
    byShow = await followersByShow(db, showIds);
    await markDnf(db, byShow, showIds);
    await markMuted(db, byShow, showIds);
    await markAlertsOff(db, byShow);
  } catch (err) {
    reportError(JOB, err);
    return finish(false, { error: 'Could not read followers' });
  }

  const skipped: Record<SkipReason, number> = { alerts_off: 0, muted: 0, followed_after: 0, watched: 0, dnf: 0 };
  const rows: NotificationInsert[] = confirmed.flatMap(drop => [...(byShow.get(drop.tmdbId)?.values() ?? [])].filter(f => {
    const reason = skipReason(f, { airDate: drop.airDate, season: drop.season, firstEpisode: drop.firstEpisode });
    if (reason) skipped[reason]++;
    return reason === null;
  }).map(f => ({
    user_id: f.userId,
    type: 'new_episode',
    tmdb_id: drop.tmdbId,
    media_type: 'tv',
    season_number: drop.season,
    episode_number: drop.firstEpisode,
    episode_count: drop.count,
    media_title: drop.title,
    media_poster_path: drop.posterPath,
    air_date: drop.airDate,
  })));
  stats.skipped = skipped;
  stats.rows_candidate = rows.length;

  if (!dryRun) {
    let written = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { data, error } = await db.from('notifications')
        .upsert(rows.slice(i, i + INSERT_CHUNK), {
          onConflict: 'user_id,type,tmdb_id,season_number,episode_number',
          ignoreDuplicates: true,
        })
        .select('id');
      if (error) {
        reportError(JOB, 'notifications write failed:', error);
        stats.rows_written = written;
        return finish(false, { error: 'Could not write notifications' });
      }
      written += data?.length ?? 0;
    }
    stats.rows_written = written;
  }

  return finish(tmdbOk);
});
