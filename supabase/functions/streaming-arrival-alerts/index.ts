/**
 * streaming-arrival-alerts — daily sweep that writes a `streaming_arrival`
 * notification when a film someone turned the bell on for:
 *   - gains a subscription offer on one of their own services, or
 *   - becomes free or free-with-ads on any service,
 * in their region. Premium, in-app only. The Free "it is out to rent or watch
 * at home" row is movie-release-notifications and is not repeated here.
 *
 * Rules live in _shared/availabilityAlerts.js and are unit-tested
 * (apps/web/tests/unit/availabilityAlerts.test.js). The short version: TMDB's
 * watch/providers has no history and flaps, so this keeps a snapshot per film
 * and region (title_availability) and only believes a new provider once it has
 * still been there at least 20 hours later. The first snapshot of a film is a
 * baseline and tells nobody.
 *
 * What makes it safe to run unattended:
 *   - a failed or unreadable TMDB response changes nothing for that film;
 *   - a film that had providers and now shows none is left alone (suspect);
 *   - events go in a ledger with a unique key before anything else, so a
 *     provider that flaps out and back never alerts twice;
 *   - notifications are derived from the last 7 days of the ledger, not from
 *     "what changed this run", so a failed write heals on the next run;
 *   - above 50% failed calls, or a flood of new providers across many films
 *     (a bad upstream import), the run writes nothing and reports ok:false;
 *   - it stops fetching after about 100s and carries the rest to tomorrow, the
 *     stalest films first, so nothing starves and nothing hangs the run;
 *   - one row per run lands in alert_job_runs.
 *
 * Who is told: a Premium person with the bell on for the film, who has not
 * logged watching it, and who did not turn the bell on after the provider was
 * already showing. A lapsed subscriber keeps their bells and gets nothing until
 * they return, the same as the other Premium alerts.
 *
 * Cost: one TMDB call per distinct opted-in film (all regions come back in one
 * response), capped per run, never one per person.
 *
 * Auth: called by pg_cron via pg_net with the Vault service-role bearer
 * (run_streaming_arrival_alerts, 20261004090000). Also runnable by hand with
 * the same bearer:
 *   {"dry_run": true}        report what it would do and write nothing
 *   {"force_breaker": true}  go ahead after the anomaly breaker tripped, once a
 *                            dry run has shown the change is real. It never
 *                            overrides the failure-rate breaker.
 *
 * Secrets: TMDB_API_KEY.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { alertRegion, isoDay, selectedProviderIds } from '../_shared/premiumAlerts.js';
import {
  ALERT_LOOK_BACK_DAYS, alertsFor, arrivalKey, circuitBreaker, parseProviders, stepSnapshot,
} from '../_shared/availabilityAlerts.js';
import { mapWithConcurrency, TMDB_CONCURRENCY } from '../_shared/peopleFeedJob.ts';
import { tmdbGetWithRetry } from '../_shared/tmdbRetry.ts';

type Db = SupabaseClient<Database>;
type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];
type Step = ReturnType<typeof stepSnapshot>;
type Snapshot = Step['state'];
type ArrivalEvent = Step['events'][number];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const JOB = 'streaming-arrival-alerts';
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;
// PostgREST puts .in() lists in the URL, so keep each one short.
const ID_CHUNK = 200;
// A film has at most 16 regions, and PostgREST returns at most 1000 rows, so
// 50 films per read of per-region rows can never be cut off.
const FILM_CHUNK = 50;
// A ceiling on TMDB calls per run. Anything over it is the stalest-first
// carry-over, same as hitting the deadline.
const MAX_FILMS_PER_RUN = 3000;
// pg_net times out at 150s (run_streaming_arrival_alerts). Stop fetching well
// before that so the writes still finish.
const FETCH_DEADLINE_MS = 100_000;
// A film nobody has a bell on stops being checked; its state is dropped after
// this long so the table does not grow forever.
const PRUNE_AFTER_DAYS = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const unique = <T>(items: T[]) => [...new Set(items)];
const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

type OptIn = { userId: string; tmdbId: number; title: string; posterPath: string | null; createdAt: string };
type Person = { region: string; serviceIds: number[] };

async function readOptIns(db: Db): Promise<OptIn[]> {
  const out: OptIn[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('movie_streaming_alerts')
      .select('user_id, tmdb_id, title, poster_path, created_at')
      .order('user_id').order('tmdb_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`movie_streaming_alerts read failed: ${error.message}`);
    for (const r of data ?? []) {
      out.push({ userId: r.user_id, tmdbId: r.tmdb_id, title: r.title, posterPath: r.poster_path, createdAt: r.created_at });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

/** Users whose Premium is current. A lapsed subscriber keeps their bells but is skipped. */
async function premiumSet(db: Db, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const ids of chunks(userIds, ID_CHUNK)) {
    const { data, error } = await db.rpc('premium_user_ids', { p_users: ids });
    if (error) throw new Error(`premium_user_ids failed: ${error.message}`);
    for (const id of data ?? []) out.add(id);
  }
  return out;
}

async function peopleFor(db: Db, userIds: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>();
  for (const ids of chunks(userIds, ID_CHUNK)) {
    const { data, error } = await db.from('profiles').select('id, region, streaming_providers').in('id', ids);
    if (error) throw new Error(`profiles read failed: ${error.message}`);
    for (const p of data ?? []) out.set(p.id, { region: alertRegion(p.region), serviceIds: selectedProviderIds(p.streaming_providers) });
  }
  return out;
}

/** What the job believed last time, per `${tmdbId}:${region}`, with when it last looked. */
async function readSnapshots(db: Db, filmIds: number[]): Promise<Map<string, { state: Snapshot; checkedAt: string }>> {
  const out = new Map<string, { state: Snapshot; checkedAt: string }>();
  for (const ids of chunks(filmIds, FILM_CHUNK)) {
    const { data, error } = await db.from('title_availability')
      .select('tmdb_id, region, confirmed, pending, missing, last_checked_at')
      .in('tmdb_id', ids);
    if (error) throw new Error(`title_availability read failed: ${error.message}`);
    for (const r of data ?? []) {
      const confirmed = (r.confirmed ?? {}) as Partial<Snapshot['confirmed']>;
      out.set(`${r.tmdb_id}:${r.region}`, {
        checkedAt: r.last_checked_at,
        // A stored row missing a bucket would throw in the rules; fill it.
        state: {
          confirmed: { flatrate: {}, free: {}, ads: {}, ...confirmed },
          pending: (r.pending ?? {}) as Snapshot['pending'],
          missing: (r.missing ?? {}) as Snapshot['missing'],
        },
      });
    }
  }
  return out;
}

/** Confirmed events from the last few days for these films, newest data the ledger has. */
async function readRecentEvents(db: Db, filmIds: number[], sinceIso: string): Promise<Map<string, ArrivalEvent[]>> {
  const out = new Map<string, ArrivalEvent[]>();
  for (const ids of chunks(filmIds, FILM_CHUNK)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db.from('availability_events')
        .select('tmdb_id, region, provider_id, bucket, provider_name, first_seen_at, confirmed_at')
        .in('tmdb_id', ids)
        .gte('confirmed_at', sinceIso)
        .order('tmdb_id').order('region').order('provider_id').order('bucket')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`availability_events read failed: ${error.message}`);
      for (const r of data ?? []) {
        const key = `${r.tmdb_id}:${r.region}`;
        const list = out.get(key) ?? [];
        list.push({
          bucket: r.bucket as ArrivalEvent['bucket'], providerId: r.provider_id, name: r.provider_name,
          firstSeenAt: r.first_seen_at, confirmedAt: r.confirmed_at,
        });
        out.set(key, list);
      }
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return out;
}

/** `${userId}:${tmdbId}` for every pair where the person has logged watching the film. */
async function watchedPairs(db: Db, movieIds: number[], userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const ids of chunks(movieIds, ID_CHUNK)) {
    for (const users of chunks(userIds, ID_CHUNK)) {
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

type Looked = {
  tmdbId: number;
  status: 'ok' | 'failed' | 'deferred';
  regions: Array<{ region: string; step: Step }>;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return json({ ok: false, error: 'TMDB_API_KEY is not set' }, 500);

  let dryRun = false;
  let forceBreaker = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
    forceBreaker = body?.force_breaker === true;
  } catch { /* no body is the normal case: pg_cron posts {} */ }

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const startedMs = Date.now();
  const now = new Date(startedMs);
  const nowIso = now.toISOString();
  const lookBackIso = new Date(startedMs - ALERT_LOOK_BACK_DAYS * 86400000).toISOString();

  // One row per run, so a failure or a tripped breaker is visible later and not
  // only in the short-lived pg_net response. Never fatal: monitoring must not
  // be the reason a run does not happen.
  let runId: number | null = null;
  if (!dryRun) {
    const { data, error } = await db.from('alert_job_runs').insert({ job: JOB, started_at: nowIso }).select('id').single();
    if (error) console.error('alert_job_runs insert failed:', error); else runId = data.id;
  }
  const finish = async (status: number, body: Record<string, unknown>) => {
    if (runId !== null) {
      const { error } = await db.from('alert_job_runs')
        .update({ finished_at: new Date().toISOString(), ok: body.ok === true, stats: body as Json })
        .eq('id', runId);
      if (error) console.error('alert_job_runs update failed:', error);
    }
    return json(body, status);
  };

  let stage = 'start';
  try {
    stage = 'opt-ins';
    const optIns = await readOptIns(db);
    stage = 'premium';
    const premium = await premiumSet(db, unique(optIns.map(o => o.userId)));
    stage = 'profiles';
    const people = await peopleFor(db, unique(optIns.filter(o => premium.has(o.userId)).map(o => o.userId)));
    const active = optIns.filter(o => people.has(o.userId));

    // Which regions each film must be checked in: where an opted-in Premium
    // person lives. One TMDB call covers all of them.
    const demand = new Map<number, Set<string>>();
    for (const o of active) {
      const region = people.get(o.userId)!.region;
      (demand.get(o.tmdbId) ?? demand.set(o.tmdbId, new Set()).get(o.tmdbId)!).add(region);
    }

    stage = 'snapshots';
    const snapshots = await readSnapshots(db, [...demand.keys()]);
    // Stalest first (never-checked films, then the longest ago), so a run that
    // hits its deadline carries the rest to tomorrow and nothing starves.
    const staleness = (id: number) => Math.min(...[...demand.get(id)!].map(r => Date.parse(snapshots.get(`${id}:${r}`)?.checkedAt ?? '') || 0));
    const queue = [...demand.keys()].sort((a, b) => staleness(a) - staleness(b));
    const films = queue.slice(0, MAX_FILMS_PER_RUN);

    stage = 'tmdb';
    const deadline = startedMs + FETCH_DEADLINE_MS;
    const looked: Looked[] = await mapWithConcurrency(films, TMDB_CONCURRENCY, async (tmdbId): Promise<Looked> => {
      if (Date.now() > deadline) return { tmdbId, status: 'deferred', regions: [] };
      let body: unknown;
      try {
        body = await tmdbGetWithRetry(`/movie/${tmdbId}/watch/providers`, tmdbKey);
      } catch (err) {
        console.error(err);
        return { tmdbId, status: 'failed', regions: [] };
      }
      const regions: Looked['regions'] = [];
      for (const region of demand.get(tmdbId)!) {
        const parsed = parseProviders(body, region);
        // Not a providers response at all: change nothing for this film.
        if (!parsed.usable) return { tmdbId, status: 'failed', regions: [] };
        regions.push({ region, step: stepSnapshot(snapshots.get(`${tmdbId}:${region}`)?.state ?? null, parsed.observed, nowIso) });
      }
      return { tmdbId, status: 'ok', regions };
    });

    const checked = looked.filter(l => l.status !== 'deferred');
    const failures = looked.filter(l => l.status === 'failed').length;
    const pairs = looked.flatMap(l => l.regions.map(r => ({ tmdbId: l.tmdbId, ...r })));
    const candidates = pairs.flatMap(p => p.step.events.map(e => ({ tmdbId: p.tmdbId, region: p.region, event: e })));
    const suspects = pairs.filter(p => p.step.suspect).length;
    const stats = {
      dry_run: dryRun,
      opt_ins: optIns.length,
      opt_ins_premium: active.length,
      films_demanded: demand.size,
      films_checked: checked.length,
      films_deferred: queue.length - checked.length,
      tmdb_failures: failures,
      baselines: pairs.filter(p => p.step.baseline).length,
      suspect_regions: suspects,
      events_new: candidates.length,
    };

    const breaker = circuitBreaker({ checked: checked.length, failures, newEvents: candidates.length, suspects });
    // A bad key or a TMDB outage never gets forced through. A flood of changes
    // can be, once a dry run has shown it is real.
    const tripped = breaker.tripped && !(forceBreaker && breaker.reason === 'anomaly');
    if (tripped) {
      console.error(`${JOB}: breaker tripped (${breaker.reason}); nothing written`, stats);
      return await finish(200, { ok: false, breaker: breaker.reason, ...stats });
    }

    if (!dryRun) {
      // Ledger first, then state. If the state write fails the provider is
      // still pending and the next run re-derives the same event, which the
      // ledger's unique key turns into a no-op. The other order could lose it.
      stage = 'ledger';
      for (const batch of chunks(candidates, INSERT_CHUNK)) {
        const { error } = await db.from('availability_events').upsert(
          batch.map(c => ({
            tmdb_id: c.tmdbId, region: c.region, provider_id: c.event.providerId, bucket: c.event.bucket,
            provider_name: c.event.name, first_seen_at: c.event.firstSeenAt, confirmed_at: c.event.confirmedAt,
          })),
          { onConflict: 'tmdb_id,region,provider_id,bucket', ignoreDuplicates: true },
        );
        if (error) throw new Error(`availability_events write failed: ${error.message}`);
      }

      stage = 'state';
      // A suspect region is left exactly as it was, and not marked checked, so
      // it is first in line tomorrow.
      const writable = pairs.filter(p => !p.step.suspect);
      for (const batch of chunks(writable, INSERT_CHUNK)) {
        const { error } = await db.from('title_availability').upsert(
          batch.map(p => ({
            tmdb_id: p.tmdbId, region: p.region,
            confirmed: p.step.state.confirmed as unknown as Json,
            pending: p.step.state.pending as unknown as Json,
            missing: p.step.state.missing as unknown as Json,
            last_checked_at: nowIso, updated_at: nowIso,
          })),
          { onConflict: 'tmdb_id,region' },
        );
        if (error) throw new Error(`title_availability write failed: ${error.message}`);
      }
    }

    // Who to tell comes from the ledger's last 7 days, not from this run's new
    // events, so a failed notification write on one run heals on the next.
    stage = 'events';
    const recent = await readRecentEvents(db, [...demand.keys()], lookBackIso);
    if (dryRun) {
      for (const c of candidates) {
        const key = `${c.tmdbId}:${c.region}`;
        recent.set(key, [...(recent.get(key) ?? []), c.event]);
      }
    }

    const withEvents = active.filter(o => recent.has(`${o.tmdbId}:${people.get(o.userId)!.region}`));
    stage = 'history';
    const watched = await watchedPairs(db, unique(withEvents.map(o => o.tmdbId)), unique(withEvents.map(o => o.userId)));

    const skipped = { stale: 0, before_opt_in: 0, watched: 0 };
    const rows: NotificationInsert[] = [];
    for (const o of withEvents) {
      const person = people.get(o.userId)!;
      const result = alertsFor(
        { serviceIds: person.serviceIds, optedInAt: o.createdAt, watched: watched.has(`${o.userId}:${o.tmdbId}`) },
        recent.get(`${o.tmdbId}:${person.region}`)!,
        nowIso,
      );
      for (const reason of Object.keys(skipped) as Array<keyof typeof skipped>) skipped[reason] += result.skipped[reason];
      for (const alert of result.alerts) {
        rows.push({
          user_id: o.userId,
          type: 'streaming_arrival',
          dedupe_key: arrivalKey(o.tmdbId, person.region, alert.kind),
          tmdb_id: o.tmdbId,
          media_type: 'movie',
          media_title: o.title,
          media_poster_path: o.posterPath,
          air_date: alert.date,
          release_kind: alert.kind,
          provider_name: alert.providerName,
        });
      }
    }

    let written = 0;
    if (!dryRun) {
      stage = 'notifications';
      for (const batch of chunks(rows, INSERT_CHUNK)) {
        const { data, error } = await db.from('notifications')
          .upsert(batch, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
          .select('id');
        if (error) throw new Error(`notifications write failed: ${error.message}`);
        written += data?.length ?? 0;
      }

      stage = 'prune';
      const { error } = await db.from('title_availability').delete().lt('last_checked_at', isoDay(now, PRUNE_AFTER_DAYS));
      if (error) console.error('title_availability prune failed:', error);
    }

    return await finish(200, { ok: true, ...stats, skipped, rows_candidate: rows.length, rows_written: written });
  } catch (err) {
    // Details go to the function log, not the response (no stack traces out).
    console.error(`${JOB}: failed at ${stage}:`, err);
    return await finish(500, { ok: false, error: 'Run failed', stage });
  }
});
