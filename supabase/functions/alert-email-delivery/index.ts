/**
 * alert-email-delivery — daily sweep that emails streaming alerts to Premium
 * members who turned email on. The Premium option on top of the Free in-app
 * alert (streaming-arrival-alerts writes the `streaming_arrival` notifications
 * this reads). Opt-in, default off: notification_preferences.streaming_email.
 *
 * Rules live in _shared/alertDelivery.js and _shared/alertEmail.js and are
 * unit-tested (apps/web/tests/unit/alertDelivery.test.js, alertEmail.test.js).
 *
 * The in-app notification is the source of truth. notification_deliveries is the
 * ledger of what was done about it by email, and is what makes this safe to run
 * unattended:
 *   - an alert is CLAIMED (a primary-key insert) before anything is sent, so a
 *     re-run, a second run at the same time or a crash cannot send it twice;
 *   - a 2xx from the provider means sent, even if its body is unreadable: a
 *     duplicate email is worse than a missing reference. Only a non-2xx or a
 *     failed request is a failure, and a failure is retried up to 3 times;
 *   - a claim abandoned by a run that died (pending past the lease) is retaken;
 *   - who is emailed is decided at send time: the preference on, the in-app
 *     switch still on, Premium still current, and a confirmed address read from
 *     auth.users (never a stale copy). A lapsed member keeps their choice and
 *     gets nothing;
 *   - one email per person per run covers everything new (capped), only alerts
 *     from the last 7 days are considered, and the run is capped and stops
 *     sending after about 100s, leaving the rest for the next run;
 *   - one row per run lands in alert_job_runs.
 *
 * Every email carries a one-click unsubscribe (List-Unsubscribe-Post) and the
 * registered address. The link goes to alert-email-unsubscribe and is a signed
 * token, deliberately separate from the weekly digest's unsubscribe.
 *
 * Delivery is off unless the ALERT_EMAIL_DELIVER secret is "true". With it off
 * the run still plans everything and reports what it would send, but claims and
 * sends nothing. `dry_run` does the same whatever the secret says.
 *
 * Auth: called by pg_cron via pg_net with the Vault service-role bearer
 * (run_alert_email_delivery, 20261006090000). Also runnable by hand with the same
 * bearer; POST {"dry_run": true} reports and writes nothing.
 *
 * Secrets: RESEND_API_KEY, ALERT_EMAIL_UNSUBSCRIBE_SECRET (16+ characters;
 * rotating it invalidates every unsubscribe link already sent, so don't, unless
 * a leak demands it), ALERT_EMAIL_DELIVER (optional), ALERT_EMAIL_FROM (optional).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { isoDay } from '../_shared/premiumAlerts.js';
import {
  EMAIL_CHANNEL, EMAIL_LOOK_BACK_DAYS, MAX_EMAILS_PER_RUN, emailBlocker, parseBatchResponse, planEmail,
  sendRunFailed, signUnsubscribeToken, unsubscribeUrl,
} from '../_shared/alertDelivery.js';
import { ALERT_EMAIL_FROM, buildAlertEmail } from '../_shared/alertEmail.js';

type Db = SupabaseClient<Database>;
type NotificationRow = Pick<
  Database['public']['Tables']['notifications']['Row'],
  'id' | 'user_id' | 'tmdb_id' | 'media_title' | 'media_poster_path' | 'release_kind' | 'provider_name' | 'created_at'
>;
type Action = 'claim' | 'retry' | 'reclaim';
type Planned = { notification: NotificationRow; action: Action };
type Delivery = { status: 'pending' | 'sent' | 'failed' | 'skipped'; attempts: number; claimedAt: string | null };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';

const JOB = 'alert-email-delivery';
const PAGE_SIZE = 1000;
// PostgREST puts .in() lists in the URL, so keep each one short.
const ID_CHUNK = 200;
// Resend's batch endpoint takes up to 100 messages. One message is one person.
const RESEND_CHUNK = 100;
// pg_net times out at 150s (run_alert_email_delivery). Stop sending well before
// that so the ledger updates still finish.
const SEND_DEADLINE_MS = 100_000;
const REQUEST_TIMEOUT_MS = 30_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

type Prefs = { streaming_email: boolean; streaming_alerts: boolean };

/** Everyone who turned email on. Whether they may be emailed is decided later. */
async function readEmailPrefs(db: Db): Promise<Map<string, Prefs>> {
  const out = new Map<string, Prefs>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from('notification_preferences')
      .select('user_id, streaming_email, streaming_alerts')
      .eq('streaming_email', true)
      .order('user_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`notification_preferences read failed: ${error.message}`);
    for (const r of data ?? []) out.set(r.user_id, { streaming_email: r.streaming_email, streaming_alerts: r.streaming_alerts });
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

/** Users whose Premium is current. */
async function premiumSet(db: Db, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const ids of chunks(userIds, ID_CHUNK)) {
    const { data, error } = await db.rpc('premium_user_ids', { p_users: ids });
    if (error) throw new Error(`premium_user_ids failed: ${error.message}`);
    for (const id of data ?? []) out.add(id);
  }
  return out;
}

/** Recent streaming alerts for these people. */
async function readNotifications(db: Db, userIds: string[], sinceIso: string): Promise<NotificationRow[]> {
  const out: NotificationRow[] = [];
  for (const ids of chunks(userIds, ID_CHUNK)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db.from('notifications')
        .select('id, user_id, tmdb_id, media_title, media_poster_path, release_kind, provider_name, created_at')
        .eq('type', 'streaming_arrival')
        .in('user_id', ids)
        .gte('created_at', sinceIso)
        .order('created_at').order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`notifications read failed: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return out;
}

async function readDeliveries(db: Db, notificationIds: string[]): Promise<Map<string, Delivery>> {
  const out = new Map<string, Delivery>();
  for (const ids of chunks(notificationIds, ID_CHUNK)) {
    const { data, error } = await db.from('notification_deliveries')
      .select('notification_id, status, attempts, claimed_at')
      .eq('channel', EMAIL_CHANNEL)
      .in('notification_id', ids);
    if (error) throw new Error(`notification_deliveries read failed: ${error.message}`);
    for (const r of data ?? []) {
      out.set(r.notification_id, { status: r.status as Delivery['status'], attempts: r.attempts, claimedAt: r.claimed_at });
    }
  }
  return out;
}

/** Current confirmed addresses, read from auth.users at send time. */
async function readAddresses(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const ids of chunks(userIds, ID_CHUNK)) {
    const { data, error } = await db.rpc('alert_email_recipients', { p_users: ids });
    if (error) throw new Error(`alert_email_recipients failed: ${error.message}`);
    for (const r of data ?? []) out.set(r.user_id, r.email);
  }
  return out;
}

/**
 * Take these alerts for this run. Returns the ids actually taken: one lost to a
 * run going on at the same moment is simply not returned, and is not sent here.
 *   claim    insert a pending row; the primary key lets exactly one run win.
 *   retry    flip a failed row back to pending, only if its attempts are what we saw.
 *   reclaim  retake an abandoned pending row, only if its claim time is what we saw.
 */
async function claimItems(db: Db, planned: Planned[], deliveries: Map<string, Delivery>, nowIso: string): Promise<Set<string>> {
  const taken = new Set<string>();

  const fresh = planned.filter(p => p.action === 'claim');
  for (const batch of chunks(fresh, ID_CHUNK)) {
    const { data, error } = await db.from('notification_deliveries')
      .upsert(
        batch.map(p => ({ notification_id: p.notification.id, channel: EMAIL_CHANNEL, status: 'pending', attempts: 1, claimed_at: nowIso })),
        { onConflict: 'notification_id,channel', ignoreDuplicates: true },
      )
      .select('notification_id');
    if (error) throw new Error(`notification_deliveries claim failed: ${error.message}`);
    for (const r of data ?? []) taken.add(r.notification_id);
  }

  for (const p of planned.filter(p => p.action !== 'claim')) {
    const seen = deliveries.get(p.notification.id)!;
    let q = db.from('notification_deliveries')
      .update({ status: 'pending', attempts: seen.attempts + 1, claimed_at: nowIso, error: null })
      .eq('notification_id', p.notification.id)
      .eq('channel', EMAIL_CHANNEL)
      .eq('attempts', seen.attempts);
    q = p.action === 'retry'
      ? q.eq('status', 'failed')
      : (seen.claimedAt ? q.eq('status', 'pending').eq('claimed_at', seen.claimedAt) : q.eq('status', 'pending').is('claimed_at', null));
    const { data, error } = await q.select('notification_id');
    if (error) throw new Error(`notification_deliveries retake failed: ${error.message}`);
    for (const r of data ?? []) taken.add(r.notification_id);
  }
  return taken;
}

/** One short line for the ledger. Never the request body, which can hold addresses. */
const failureNote = (status: number | null, body: unknown) => {
  const message = typeof (body as { message?: unknown })?.message === 'string' ? (body as { message: string }).message : '';
  return `${status === null ? 'request failed' : `provider ${status}`}${message ? `: ${message}` : ''}`
    .replace(/[\w.+-]+@[\w.-]+/g, '[address]').slice(0, 200);
};

type Message = { userId: string; ids: string[]; payload: Record<string, unknown> };

/** Send one batch. A 2xx is sent whatever the body says; anything else is a failure to retry. */
async function sendBatch(resendKey: string, messages: Message[]): Promise<{ sent: boolean; refs: Array<string | null>; note: string | null }> {
  let res: Response;
  try {
    res = await fetch(RESEND_BATCH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.map(m => m.payload)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${JOB}: resend request failed:`, err instanceof Error ? err.name : 'error');
    return { sent: false, refs: [], note: failureNote(null, null) };
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* an unreadable body does not change whether it was accepted */ }
  if (!res.ok) return { sent: false, refs: [], note: failureNote(res.status, body) };
  return { sent: true, refs: parseBatchResponse(body, messages.length) ?? messages.map(() => null), note: null };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const secret = Deno.env.get('ALERT_EMAIL_UNSUBSCRIBE_SECRET');
  // Say which setting is missing, never its value.
  if (!resendKey) return json({ ok: false, error: 'RESEND_API_KEY is not set' }, 500);
  if (!secret || secret.length < 16) return json({ ok: false, error: 'ALERT_EMAIL_UNSUBSCRIBE_SECRET is not set or too short' }, 500);
  const from = Deno.env.get('ALERT_EMAIL_FROM') || ALERT_EMAIL_FROM;
  const deliver = Deno.env.get('ALERT_EMAIL_DELIVER') === 'true';

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch { /* no body is the normal case: pg_cron posts {} */ }

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const startedMs = Date.now();
  const now = new Date(startedMs);
  const nowIso = now.toISOString();
  const sinceIso = new Date(startedMs - EMAIL_LOOK_BACK_DAYS * 86400000).toISOString();

  // One row per run, so a failure is visible later and not only in the
  // short-lived pg_net response. Never fatal: monitoring must not be the reason
  // a run does not happen.
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
    stage = 'preferences';
    const prefs = await readEmailPrefs(db);
    stage = 'premium';
    const premium = await premiumSet(db, [...prefs.keys()]);

    const blocked = { no_pref: 0, alerts_off: 0, not_premium: 0 };
    const eligible: string[] = [];
    for (const [userId, p] of prefs) {
      const why = emailBlocker({ prefs: p, premium: premium.has(userId) });
      if (why) blocked[why]++; else eligible.push(userId);
    }

    stage = 'notifications';
    const notifications = await readNotifications(db, eligible, sinceIso);
    stage = 'deliveries';
    const deliveries = await readDeliveries(db, notifications.map(n => n.id));

    const byUser = new Map<string, NotificationRow[]>();
    for (const n of notifications) (byUser.get(n.user_id) ?? byUser.set(n.user_id, []).get(n.user_id)!).push(n);

    const counts = { too_old: 0, done: 0, wait: 0, give_up: 0, deferred: 0 };
    const plans: Array<{ userId: string; selected: Planned[] }> = [];
    for (const [userId, list] of byUser) {
      const plan = planEmail(list, deliveries, nowIso);
      for (const k of Object.keys(counts) as Array<keyof typeof counts>) counts[k] += plan.counts[k];
      if (plan.selected.length) plans.push({ userId, selected: plan.selected as Planned[] });
    }
    // Oldest waiting first, so a capped run never starves anyone.
    plans.sort((a, b) => Date.parse(a.selected[0].notification.created_at) - Date.parse(b.selected[0].notification.created_at));
    const capped = plans.slice(0, MAX_EMAILS_PER_RUN);

    stage = 'addresses';
    const addresses = await readAddresses(db, capped.map(p => p.userId));
    const sendable = capped.filter(p => addresses.has(p.userId));

    const stats = {
      dry_run: dryRun,
      delivery: deliver,
      email_preferences: prefs.size,
      blocked,
      eligible_people: eligible.length,
      alerts_recent: notifications.length,
      alerts_not_sendable: counts,
      people_with_news: plans.length,
      people_deferred: plans.length - capped.length,
      people_without_address: capped.length - sendable.length,
      emails_planned: sendable.length,
      alerts_planned: sendable.reduce((n, p) => n + p.selected.length, 0),
    };

    if (dryRun || !deliver) {
      return await finish(200, { ok: true, ...stats, emails_sent: 0, emails_failed: 0, note: dryRun ? 'dry run: nothing claimed or sent' : 'delivery is off: nothing claimed or sent' });
    }

    // Build and send in batches, claiming each person's alerts just before their email goes out.
    stage = 'send';
    const deadline = startedMs + SEND_DEADLINE_MS;
    let emailsSent = 0, emailsFailed = 0, alertsSent = 0, alertsFailed = 0, alertsLostToAnotherRun = 0, peopleDeferredByDeadline = 0;

    for (const group of chunks(sendable, RESEND_CHUNK)) {
      if (Date.now() > deadline) { peopleDeferredByDeadline += group.length; continue; }

      const taken = await claimItems(db, group.flatMap(g => g.selected), deliveries, nowIso);
      const messages: Message[] = [];
      for (const g of group) {
        const items = g.selected.filter(p => taken.has(p.notification.id)).map(p => p.notification);
        alertsLostToAnotherRun += g.selected.length - items.length;
        if (!items.length) continue;
        const token = await signUnsubscribeToken(secret, g.userId);
        const email = buildAlertEmail(items, { unsubscribeUrl: unsubscribeUrl(SUPABASE_URL, token) });
        messages.push({
          userId: g.userId,
          ids: items.map(n => n.id),
          payload: {
            from, to: [addresses.get(g.userId)!], subject: email.subject, html: email.html, text: email.text,
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl(SUPABASE_URL, token)}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          },
        });
      }
      if (!messages.length) continue;

      const result = await sendBatch(resendKey, messages);
      const rows = messages.flatMap((m, i) => m.ids.map(id => result.sent
        ? { notification_id: id, channel: EMAIL_CHANNEL, status: 'sent', provider_ref: result.refs[i], sent_at: new Date().toISOString(), error: null }
        : { notification_id: id, channel: EMAIL_CHANNEL, status: 'failed', error: result.note }));
      const { error } = await db.from('notification_deliveries').upsert(rows, { onConflict: 'notification_id,channel' });
      // If this write fails the rows stay pending, and are retaken after the
      // lease. For a send that DID go out that can mean one repeat, which is why
      // the lease is generous; surface it loudly instead of hiding it.
      if (error) throw new Error(`notification_deliveries update failed: ${error.message}`);

      if (result.sent) { emailsSent += messages.length; alertsSent += rows.length; }
      else { emailsFailed += messages.length; alertsFailed += rows.length; }
    }

    // A failure is retried on later runs, so it is not fatal to this one; but a
    // run where most sends fail (a bad key, a provider outage) is reported not ok.
    const failed = sendRunFailed({ attempted: emailsSent + emailsFailed, failed: emailsFailed });
    return await finish(200, {
      ok: !failed, ...stats,
      emails_sent: emailsSent, emails_failed: emailsFailed, alerts_sent: alertsSent, alerts_failed: alertsFailed,
      alerts_lost_to_another_run: alertsLostToAnotherRun, people_deferred_by_deadline: peopleDeferredByDeadline,
      since: isoDay(now, EMAIL_LOOK_BACK_DAYS),
    });
  } catch (err) {
    // Details go to the function log, not the response (no stack traces out).
    console.error(`${JOB}: failed at ${stage}:`, err);
    return await finish(500, { ok: false, error: 'Run failed', stage });
  }
});
