/**
 * smart-list-digest: the weekly smart lists roll-up (C4 on the smart lists
 * canvas). One notification per Premium person per ISO week, "Your smart
 * lists found 5 new titles this week.", and only when something is new.
 * Never one per title.
 *
 * pg_cron calls this on Sundays at 21:00 UTC (run_smart_list_digest,
 * 20261002180000_smart_list_digest.sql).
 *
 * For each smart list whose source is new discoveries, owned by someone who
 * is Premium right now (premium_user_ids() asks is_premium() on every run, so
 * a lapsed subscription simply stops getting the roll-up):
 *   - fetch page 1 of TMDB discover per media type, the same query the app
 *     opens the list with (_shared/smartListDigest.js, kept in step with
 *     @plot/core by apps/web/tests/unit/smartListDigest.test.js)
 *   - a title is new when it is in neither seen_keys (shown at the last
 *     open) nor pending_keys (already counted); new keys join pending_keys,
 *     which the My Lists index shows as "2 new"
 *   - a list never opened gets its first page recorded and counts nothing
 *
 * Watchlist and history lists are skipped: they change when their owner saves
 * or watches something, which needs no notification. So is any list its owner
 * switched out of the roll-up (user_custom_lists.digest_enabled false,
 * 20261002204500_smart_list_digest_switch.sql); someone with every list
 * switched off gets nothing. The filter is _shared inDigest().
 *
 * Idempotent: the row's dedupe_key is smart_list_digest:<ISO week>, upserted
 * on notifications_dedupe_once (user_id, dedupe_key) with ignoreDuplicates,
 * and people who already have this week's row are skipped before any TMDB
 * call. pending_keys only ever gains keys that were not there, so a second
 * run in the same week finds nothing new.
 *
 * Auth: the gateway verifies the bearer (verify_jwt = true); this handler then
 * requires the service role, as the other internal functions do. Runnable by
 * hand with the same bearer. {"dry_run": true} reports what it would write and
 * writes nothing; {"user_id": "<uuid>"} limits a run to one person.
 *
 * Secrets: TMDB_API_KEY (already set for tmdb-proxy and premium-alerts).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { alertRegion } from '../_shared/premiumAlerts.js';
import { mapWithConcurrency, tmdbGet, TMDB_CONCURRENCY } from '../_shared/peopleFeedJob.ts';
import {
  buildDigest, cleanRules, digestDedupeKey, discoverQuery, inDigest, isoWeek, listRun, matchKey, pageMatches,
  providerIdsOf, rulesTypes,
} from '../_shared/smartListDigest.js';

type Db = SupabaseClient<Database>;
type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];
type SeenRow = Database['public']['Tables']['smart_list_seen']['Row'];
type Person = { region: string; providerIds: number[]; hideKids: boolean };
type ListRow = { id: string; user_id: string; name: string; rules: Json | null; digest_enabled: boolean };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Cost caps: one or two TMDB calls per list.
const PAGE_SIZE = 1000;
const MAX_LISTS_PER_RUN = 3000;
const ID_CHUNK = 200;
const INSERT_CHUNK = 500;
// Above this share of failed TMDB calls, report ok:false so a bad key or an
// outage shows up in the cron log instead of as a quiet week.
const MAX_FAILURE_RATE = 0.5;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Every smart list still in the roll-up, paged. Manual lists have rules = null. */
async function readSmartLists(db: Db, onlyUser: string | null): Promise<ListRow[]> {
  const rows: ListRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db.from('user_custom_lists').select('id, user_id, name, rules, digest_enabled')
      .not('rules', 'is', null)
      .eq('digest_enabled', true)
      .order('created_at').order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (onlyUser) query = query.eq('user_id', onlyUser);
    const { data, error } = await query;
    if (error) throw new Error(`user_custom_lists read failed: ${error.message}`);
    rows.push(...((data ?? []) as ListRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Premium people among these, with region, services and the kids setting. */
async function premiumPeople(db: Db, userIds: string[]): Promise<Map<string, Person>> {
  const premium: string[] = [];
  for (const ids of chunks(userIds, ID_CHUNK)) {
    const { data, error } = await db.rpc('premium_user_ids', { p_users: ids });
    if (error) throw new Error(`premium_user_ids failed: ${error.message}`);
    premium.push(...((data ?? []) as string[]));
  }
  const people = new Map<string, Person>();
  for (const ids of chunks(premium, ID_CHUNK)) {
    const { data, error } = await db.from('profiles')
      .select('id, region, streaming_providers, include_kids_content')
      .in('id', ids);
    if (error) throw new Error(`profiles read failed: ${error.message}`);
    for (const p of data ?? []) {
      people.set(p.id, {
        region: alertRegion(p.region),
        providerIds: providerIdsOf(p.streaming_providers),
        hideKids: !p.include_kids_content,
      });
    }
  }
  return people;
}

/** People who already have this week's roll-up. */
async function alreadySent(db: Db, userIds: string[], dedupeKey: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const ids of chunks(userIds, ID_CHUNK)) {
    const { data, error } = await db.from('notifications').select('user_id')
      .eq('dedupe_key', dedupeKey).in('user_id', ids);
    if (error) throw new Error(`notifications read failed: ${error.message}`);
    for (const r of data ?? []) out.add(r.user_id);
  }
  return out;
}

async function seenRows(db: Db, listIds: string[]): Promise<Map<string, SeenRow>> {
  const out = new Map<string, SeenRow>();
  for (const ids of chunks(listIds, ID_CHUNK)) {
    const { data, error } = await db.from('smart_list_seen').select('*').in('list_id', ids);
    if (error) throw new Error(`smart_list_seen read failed: ${error.message}`);
    for (const r of data ?? []) out.set(r.list_id, r);
  }
  return out;
}

/** What one person has watched, as match keys, for lists that leave it out. */
async function watchedKeys(db: Db, userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('history').select('tmdb_id, media_type')
      .eq('user_id', userId).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`history read failed: ${error.message}`);
    for (const r of data ?? []) out.add(matchKey(r.media_type === 'tv' ? 'tv' : 'movie', r.tmdb_id));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return json({ ok: false, error: 'TMDB_API_KEY is not set' }, 500);

  let dryRun = false;
  let onlyUser: string | null = null;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
    if (typeof body?.user_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.user_id)) onlyUser = body.user_id;
  } catch { /* an empty body is the cron's */ }

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const now = new Date();
  const week = isoWeek(now);
  const dedupeKey = digestDedupeKey(week);

  let calls = 0;
  let failures = 0;
  const notifications: NotificationInsert[] = [];
  // New rows (a list never opened or checked) are inserted; existing rows only
  // gain pending keys, so a list opened while the job runs keeps its seen keys.
  const seenInserts: Array<Database['public']['Tables']['smart_list_seen']['Insert']> = [];
  const pendingUpdates: Array<{ list_id: string; pending_keys: string[] }> = [];
  let listsChecked = 0;
  let capped = false;

  try {
    const all = await readSmartLists(db, onlyUser);
    const owners = [...new Set(all.map(l => l.user_id))];
    const people = await premiumPeople(db, owners);
    const sent = await alreadySent(db, [...people.keys()], dedupeKey);
    const lists = all
      .map(l => ({ ...l, clean: cleanRules(l.rules) }))
      .filter(l => inDigest(l) && people.has(l.user_id) && !sent.has(l.user_id));
    capped = lists.length > MAX_LISTS_PER_RUN;
    const work = lists.slice(0, MAX_LISTS_PER_RUN);
    listsChecked = work.length;
    const seen = await seenRows(db, work.map(l => l.id));

    // One person at a time, their lists in parallel, so watched keys are read once.
    const byUser = new Map<string, typeof work>();
    for (const l of work) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);

    for (const [userId, userLists] of byUser) {
      const person = people.get(userId)!;
      const watched = userLists.some(l => l.clean!.hideWatched) ? await watchedKeys(db, userId) : new Set<string>();
      const results = await mapWithConcurrency(userLists, TMDB_CONCURRENCY, async (list) => {
        const rules = list.clean!;
        // A services rule with no services saved matches nothing: skip it.
        if (rules.onlyServices && !person.providerIds.length) return null;
        const found: Array<{ key: string; poster_path: string }> = [];
        try {
          for (const type of rulesTypes(rules)) {
            const params = discoverQuery(rules, type, { ...person, now });
            const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
            calls++;
            const page = await tmdbGet(`/discover/${type}?${qs}`, tmdbKey);
            found.push(...pageMatches(page?.results, type, { rules, hideKids: person.hideKids, watched }));
          }
        } catch (err) {
          failures++;
          console.error(err);
          return null;
        }
        const row = seen.get(list.id) ?? null;
        const { newKeys, next } = listRun(found.map(f => f.key), row);
        if (next && !row) seenInserts.push({ list_id: list.id, user_id: userId, ...next, last_checked_at: now.toISOString() });
        else if (next) pendingUpdates.push({ list_id: list.id, pending_keys: next.pending_keys });
        return { id: list.id, name: list.name, newKeys, posters: Object.fromEntries(found.map(f => [f.key, f.poster_path])) };
      });
      const digest = buildDigest(results.filter((r): r is NonNullable<typeof r> => !!r));
      if (digest) {
        notifications.push({
          user_id: userId,
          type: 'smart_list_digest',
          dedupe_key: dedupeKey,
          smart_list_digest: digest as unknown as Json,
        });
      }
    }
  } catch (err) {
    // Details go to the function log, not the response.
    console.error(err);
    return json({ ok: false, error: 'Could not read smart lists' }, 500);
  }

  let written = 0;
  let seenWritten = 0;
  if (!dryRun) {
    // Notifications first: if recording the matches then fails, the next run
    // finds the same titles new but is skipped for this week by the dedupe
    // key, so nobody is told twice.
    for (const rows of chunks(notifications, INSERT_CHUNK)) {
      const { data, error } = await db.from('notifications')
        .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
        .select('id');
      if (error) {
        console.error('notifications write failed:', error);
        return json({ ok: false, error: 'Could not write notifications', week, written }, 500);
      }
      written += data?.length ?? 0;
    }
    for (const rows of chunks(seenInserts, INSERT_CHUNK)) {
      const { error } = await db.from('smart_list_seen').upsert(rows, { onConflict: 'list_id', ignoreDuplicates: true });
      if (error) {
        console.error('smart_list_seen insert failed:', error);
        return json({ ok: false, error: 'Could not record matches', week, written }, 500);
      }
      seenWritten += rows.length;
    }
    for (const update of pendingUpdates) {
      const { error } = await db.from('smart_list_seen')
        .update({ pending_keys: update.pending_keys, last_checked_at: now.toISOString() })
        .eq('list_id', update.list_id);
      if (error) {
        console.error('smart_list_seen update failed:', error);
        return json({ ok: false, error: 'Could not record matches', week, written }, 500);
      }
      seenWritten++;
    }
  }

  const failureRate = calls ? failures / calls : 0;
  return json({
    ok: failureRate <= MAX_FAILURE_RATE,
    dry_run: dryRun,
    week,
    lists_checked: listsChecked,
    lists_capped: capped,
    tmdb_calls: calls,
    tmdb_failures: failures,
    seen_rows_written: seenWritten,
    rows_candidate: notifications.length,
    rows_written: written,
    ...(dryRun ? { preview: notifications.map(n => ({ user_id: n.user_id, digest: n.smart_list_digest })) } : {}),
  });
});
