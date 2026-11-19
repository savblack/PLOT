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
 *   2. Reads exact airings from an hour ago to six hours ahead and applies the
 *      brake: if the time sync is stale, or too many nearby times moved in the
 *      last day, it writes nothing and answers 500. The hourly pg_net health
 *      check (cron-health.yml) turns that into an incident issue and an email.
 *   3. Groups drops whose time passed in the last six hours.
 *   4. Confirms each drop with TMDB: same season and episode, dated within a
 *      day. A disagreement means the numbering differs, so it is left to the
 *      daily job, which works from TMDB alone.
 *   5. Reads only those shows' followers and applies the same skip rules as the
 *      daily job (_shared/newEpisodeRecipients.ts), including the new
 *      "Episode alerts in Plot" switch.
 *
 * Push is not sent here. send-push picks the new rows up on its next quarter
 * hour and applies the phone rules (quiet hours, the 7 AM summary, the phone
 * switch).
 *
 * Auth: pg_cron via pg_net with the Vault service-role bearer
 * (run_episode_drop_alerts, 20261120090000). POST {"dry_run": true} reports
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
const CALL_TIMEOUT_MS = 15_000;
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
    drops_due: 0, drops_confirmed: 0, drops_unconfirmed: 0, tmdb_failures: 0,
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

  let airings;
  try {
    airings = await nearbyAirings(db, now);
    const brake = brakeReason(airings, await lastSyncOkAt(db), now);
    if (brake) {
      stats.braked = brake;
      reportError(JOB, `brake on (${brake}): no drop alerts this run; the daily job covers them`);
      return finish(false, { error: `Brake on: ${brake}` });
    }
  } catch (err) {
    reportError(JOB, err);
    return finish(false, { error: 'Could not read drop times' });
  }

  const drops = dueDrops(airings, now);
  stats.drops_due = drops.length;
  if (!drops.length) return finish(true);

  // Confirm each drop with TMDB, and take its title and poster from the same call.
  type Confirmed = (typeof drops)[number] & { title: string | null; posterPath: string | null };
  const confirmed: Confirmed[] = [];
  for (const drop of drops) {
    try {
      const show = await tmdbGetWithRetry(`/tv/${drop.tmdbId}?append_to_response=season/${drop.season}`, tmdbKey, { fetchImpl: timedFetch });
      const episodes = (show?.[`season/${drop.season}`]?.episodes ?? []) as { episode_number?: number; air_date?: string | null }[];
      const tmdbEpisode = episodes.find(ep => ep.episode_number === drop.firstEpisode);
      if (!tmdbAgrees(tmdbEpisode, drop)) { stats.drops_unconfirmed = (stats.drops_unconfirmed as number) + 1; continue; }
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
  stats.drops_confirmed = confirmed.length;
  if (!confirmed.length) return finish((stats.tmdb_failures as number) < drops.length);

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

  // Every TMDB check failing is an outage worth an incident; some is not.
  return finish((stats.tmdb_failures as number) < drops.length);
});
