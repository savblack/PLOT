/**
 * premium-alerts: daily sweep that writes Premium alert notifications.
 *
 *   {"only": "people"}   actor and director release alerts (person_release)
 *   {"only": "seasons"}  whole-season-ready alerts (season_ready)
 *
 * Two runs rather than one so each stays well inside the function's time
 * limit: pg_cron calls this twice a day, half an hour apart
 * (run_premium_alerts, 20260928120000_premium_alerts.sql).
 *
 * Who gets alerts: people with an opt-in row (person_alerts /
 * season_ready_alerts) who are Premium at the time of the run, asked of
 * is_premium() through premium_user_ids(). A lapsed subscription keeps its
 * opt-ins and simply stops receiving alerts.
 *
 * The rules themselves live in _shared/premiumAlerts.js, which is unit tested
 * (apps/web/tests/unit/premiumAlerts.test.js):
 *
 *   people   a TV credit whose series premiered in the last three days, or a
 *            movie credit whose first general release (theatrical or digital)
 *            in the person's own region was in the last three days. Festival
 *            premieres and limited runs do not count.
 *   seasons  the show's latest season has finished (finale marker, ended or
 *            cancelled, or the next episode is in a later season), every
 *            episode TMDB lists for it has aired, the list is complete, and
 *            TMDB's season-level watch providers put it on one of the person's
 *            selected subscription, free or ad-supported services in their
 *            region. Air dates alone never qualify.
 *
 * Episode release notifications (new_episode, PR #1032) are a separate Free
 * feature and are not produced here.
 *
 * Idempotent: rows are upserted on notifications_dedupe_once (user_id,
 * dedupe_key) with ignoreDuplicates, so the look-back windows let a missed run
 * heal without anyone seeing the same alert twice.
 *
 * Auth: the gateway verifies the bearer (verify_jwt = true); this handler then
 * requires the service role, as the other internal functions do. Runnable by
 * hand with the same bearer; {"only": "people", "dry_run": true} reports what
 * it would write and writes nothing.
 *
 * Secrets: TMDB_API_KEY (already set for tmdb-proxy and calendar-feed).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import {
  alertRegion, finishedSeason, isoDay, PEOPLE_LOOK_BACK_DAYS, personReleaseKey, readyOnSelectedServices,
  regionalMovieRelease, releaseCandidates, seasonFullyAired, seasonReadyKey, selectedProviderIds,
} from '../_shared/premiumAlerts.js';

type Db = SupabaseClient<Database>;
type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];
type Recipient = { region: string; providerIds: number[] };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const TMDB_BASE = 'https://api.themoviedb.org/3';

// Cost caps. One run scales with distinct followed people or shows, not with
// accounts, but still needs a ceiling on TMDB calls and execution time.
const PAGE_SIZE = 1000;
const MAX_SUBJECTS_PER_RUN = 2500;
const TMDB_CONCURRENCY = 6;
const INSERT_CHUNK = 500;
// PostgREST puts .in() lists in the URL, so keep each one short.
const ID_CHUNK = 200;
// Above this share of failed TMDB calls, report ok:false so a bad key or an
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

async function tmdbGet(path: string, key: string): Promise<any> {
  const res = await fetch(`${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}&language=en-US`);
  if (!res.ok) throw new Error(`TMDB ${path} failed (${res.status})`);
  return await res.json();
}

/** Every row of an opt-in table, paged. */
async function readAll<T>(db: Db, table: 'person_alerts' | 'season_ready_alerts', columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select(columns)
      .order('created_at').order('user_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Premium recipients among these users, with their region and selected services. */
async function premiumRecipients(db: Db, userIds: string[]): Promise<Map<string, Recipient>> {
  const premium: string[] = [];
  for (let i = 0; i < userIds.length; i += ID_CHUNK) {
    const { data, error } = await db.rpc('premium_user_ids', { p_users: userIds.slice(i, i + ID_CHUNK) });
    if (error) throw new Error(`premium_user_ids failed: ${error.message}`);
    premium.push(...((data ?? []) as string[]));
  }
  const recipients = new Map<string, Recipient>();
  for (let i = 0; i < premium.length; i += ID_CHUNK) {
    const { data, error } = await db.from('profiles')
      .select('id, region, streaming_providers')
      .in('id', premium.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`profiles read failed: ${error.message}`);
    for (const p of data ?? []) {
      recipients.set(p.id, { region: alertRegion(p.region), providerIds: selectedProviderIds(p.streaming_providers) });
    }
  }
  return recipients;
}

/** Group opt-in rows by subject id, keeping only Premium recipients. */
function bySubject<T extends { user_id: string }>(rows: T[], subject: (row: T) => number, recipients: Map<string, Recipient>) {
  const grouped = new Map<number, string[]>();
  for (const row of rows) {
    if (!recipients.has(row.user_id)) continue;
    const id = subject(row);
    const list = grouped.get(id);
    if (list) list.push(row.user_id); else grouped.set(id, [row.user_id]);
  }
  return grouped;
}

type Outcome = { rows: NotificationInsert[]; subjects: number; checked: number; capped: boolean; hits: number; failures: number; calls: number };

async function peopleAlerts(db: Db, tmdbKey: string, now: Date): Promise<Outcome> {
  const follows = await readAll<{ user_id: string; tmdb_person_id: number; name: string }>(db, 'person_alerts', 'user_id, tmdb_person_id, name');
  const recipients = await premiumRecipients(db, [...new Set(follows.map(f => f.user_id))]);
  const followers = bySubject(follows, f => f.tmdb_person_id, recipients);
  const names = new Map(follows.map(f => [f.tmdb_person_id, f.name]));
  const personIds = [...followers.keys()].slice(0, MAX_SUBJECTS_PER_RUN);

  const today = isoDay(now);
  const window = { today, since: isoDay(now, PEOPLE_LOOK_BACK_DAYS) };
  let failures = 0;
  let calls = 0;

  const credits = await mapWithConcurrency(personIds, TMDB_CONCURRENCY, async (personId) => {
    calls++;
    try {
      const body = await tmdbGet(`/person/${personId}/combined_credits`, tmdbKey);
      return { personId, name: typeof body?.name === 'string' ? body.name : names.get(personId) ?? '', candidates: releaseCandidates(body, window) };
    } catch (err) {
      failures++;
      console.error(err);
      return { personId, name: '', candidates: [] };
    }
  });

  // One release_dates call per candidate movie, shared across people and followers.
  const movieIds = [...new Set(credits.flatMap(c => c.candidates.filter(x => x.mediaType === 'movie').map(x => x.tmdbId)))];
  const releaseDates = new Map<number, unknown>();
  await mapWithConcurrency(movieIds, TMDB_CONCURRENCY, async (movieId) => {
    calls++;
    try {
      releaseDates.set(movieId, await tmdbGet(`/movie/${movieId}/release_dates`, tmdbKey));
    } catch (err) {
      failures++;
      console.error(err);
    }
  });

  const rows: NotificationInsert[] = [];
  const seen = new Set<string>();
  let hits = 0;
  for (const { personId, name, candidates } of credits) {
    const personName = name || names.get(personId) || '';
    if (!personName) continue;
    for (const c of candidates) {
      for (const userId of followers.get(personId) ?? []) {
        let kind: 'theatrical' | 'digital' | 'premiere';
        let date: string;
        if (c.mediaType === 'tv') {
          kind = 'premiere';
          date = c.primaryDate;
        } else {
          const release = regionalMovieRelease(releaseDates.get(c.tmdbId), recipients.get(userId)!.region, window);
          if (!release) continue;
          kind = release.kind;
          date = release.date;
        }
        const dedupeKey = personReleaseKey(c.mediaType, c.tmdbId);
        // Two followed people in the same film: one alert, the first one found.
        if (seen.has(`${userId}:${dedupeKey}`)) continue;
        seen.add(`${userId}:${dedupeKey}`);
        hits++;
        rows.push({
          user_id: userId,
          type: 'person_release',
          dedupe_key: dedupeKey,
          tmdb_id: c.tmdbId,
          media_type: c.mediaType,
          media_title: c.title,
          media_poster_path: c.posterPath,
          air_date: date,
          person_tmdb_id: personId,
          person_name: personName,
          person_role: c.role,
          release_kind: kind,
        });
      }
    }
  }
  return { rows, subjects: followers.size, checked: personIds.length, capped: followers.size > personIds.length, hits, failures, calls };
}

async function seasonAlerts(db: Db, tmdbKey: string, now: Date): Promise<Outcome> {
  const optIns = await readAll<{ user_id: string; tmdb_id: number }>(db, 'season_ready_alerts', 'user_id, tmdb_id');
  const recipients = await premiumRecipients(db, [...new Set(optIns.map(o => o.user_id))]);
  // Nobody without a selected service can be told a season is on their services.
  for (const [id, r] of recipients) if (!r.providerIds.length) recipients.delete(id);
  const followers = bySubject(optIns, o => o.tmdb_id, recipients);
  const showIds = [...followers.keys()].slice(0, MAX_SUBJECTS_PER_RUN);

  const today = isoDay(now);
  let failures = 0;
  let calls = 0;
  const rows: NotificationInsert[] = [];
  let hits = 0;

  await mapWithConcurrency(showIds, TMDB_CONCURRENCY, async (showId) => {
    try {
      calls++;
      const show = await tmdbGet(`/tv/${showId}`, tmdbKey);
      const finished = finishedSeason(show, today);
      if (!finished) return;
      calls++;
      const seasonBody = await tmdbGet(`/tv/${showId}/season/${finished.season}`, tmdbKey);
      if (!seasonFullyAired(seasonBody, finished.episodeCount, today)) return;
      calls++;
      const providers = await tmdbGet(`/tv/${showId}/season/${finished.season}/watch/providers`, tmdbKey);
      for (const userId of followers.get(showId) ?? []) {
        const r = recipients.get(userId)!;
        const on = readyOnSelectedServices(providers, r.region, r.providerIds);
        if (!on.length) continue;
        hits++;
        rows.push({
          user_id: userId,
          type: 'season_ready',
          dedupe_key: seasonReadyKey(showId, finished.season),
          tmdb_id: showId,
          media_type: 'tv',
          season_number: finished.season,
          media_title: typeof show?.name === 'string' ? show.name : null,
          media_poster_path: typeof show?.poster_path === 'string' ? show.poster_path : null,
          air_date: finished.finaleDate,
          provider_name: on.map(p => p.name).slice(0, 2).join(', '),
        });
      }
    } catch (err) {
      failures++;
      console.error(err);
    }
  });
  return { rows, subjects: followers.size, checked: showIds.length, capped: followers.size > showIds.length, hits, failures, calls };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return json({ ok: false, error: 'TMDB_API_KEY is not set' }, 500);

  let only: unknown = null;
  let dryRun = false;
  try {
    const body = await req.json();
    only = body?.only;
    dryRun = body?.dry_run === true;
  } catch { /* handled below */ }
  if (only !== 'people' && only !== 'seasons') return json({ ok: false, error: 'Body must name "only": "people" or "seasons"' }, 400);

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const now = new Date();

  let outcome: Outcome;
  try {
    outcome = only === 'people' ? await peopleAlerts(db, tmdbKey, now) : await seasonAlerts(db, tmdbKey, now);
  } catch (err) {
    // Details go to the function log, not the response.
    console.error(err);
    return json({ ok: false, only, error: 'Could not read alert opt-ins' }, 500);
  }

  let written = 0;
  if (!dryRun) {
    for (let i = 0; i < outcome.rows.length; i += INSERT_CHUNK) {
      const { data, error } = await db.from('notifications')
        .upsert(outcome.rows.slice(i, i + INSERT_CHUNK), { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error('notifications write failed:', error);
        return json({ ok: false, only, error: 'Could not write notifications', written }, 500);
      }
      written += data?.length ?? 0;
    }
  }

  const failureRate = outcome.calls ? outcome.failures / outcome.calls : 0;
  return json({
    ok: failureRate <= MAX_FAILURE_RATE,
    only,
    dry_run: dryRun,
    subjects_followed: outcome.subjects,
    subjects_checked: outcome.checked,
    subjects_capped: outcome.capped,
    tmdb_calls: outcome.calls,
    tmdb_failures: outcome.failures,
    rows_candidate: outcome.hits,
    rows_written: written,
  });
});
