/**
 * Premium push delivery for existing title notifications. Safe to schedule
 * before release: PUSH_DELIVER_ENABLED must be true before it claims or sends.
 * A row in push_deliveries represents one notification on one device.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { errorText, reportLog } from '../_shared/posthogLog.ts';
import { PUSH_LOOK_BACK_DAYS, PUSH_TYPES, pushAction, pushBlocked, pushMessage } from '../_shared/pushDelivery.js';

type Db = SupabaseClient<Database>;
type Notification = Pick<Database['public']['Tables']['notifications']['Row'],
  'id' | 'user_id' | 'type' | 'created_at' | 'tmdb_id' | 'media_type' | 'media_title' |
  'season_number' | 'episode_number' | 'episode_count' | 'release_kind' | 'provider_name'>;
type Token = Pick<Database['public']['Tables']['push_tokens']['Row'], 'token' | 'user_id'>;
type Delivery = Pick<Database['public']['Tables']['push_deliveries']['Row'],
  'notification_id' | 'token' | 'status' | 'attempts' | 'claimed_at'>;
type Candidate = { notification: Notification; token: Token; delivery: Delivery | null; action: 'claim' | 'retry' | 'reclaim' };

const DB_URL = Deno.env.get('SUPABASE_URL')!;
const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;
const PAGE = 1000;
const MAX_MESSAGES = 500;
const MAX_RUN_MS = 100_000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const key = (id: string, token: string) => `${id}:${token}`;

async function preferences(db: Db) {
  const out = new Map<string, Database['public']['Tables']['notification_preferences']['Row']>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('notification_preferences')
      .select('*').eq('push_enabled', true).order('user_id').range(from, from + PAGE - 1);
    if (error) throw new Error(`preferences read failed: ${error.message}`);
    for (const row of data ?? []) out.set(row.user_id, row);
    if (!data || data.length < PAGE) return out;
  }
}

async function tokens(db: Db, users: string[]) {
  const out = new Map<string, Token[]>();
  for (const group of chunks(users, 100)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from('push_tokens')
        .select('token,user_id').in('user_id', group).is('disabled_at', null)
        .order('token').range(from, from + PAGE - 1);
      if (error) throw new Error(`tokens read failed: ${error.message}`);
      for (const row of data ?? []) out.set(row.user_id, [...(out.get(row.user_id) ?? []), row]);
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

async function notifications(db: Db, users: string[], since: string) {
  const out: Notification[] = [];
  for (const group of chunks(users, 100)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from('notifications')
        .select('id,user_id,type,created_at,tmdb_id,media_type,media_title,season_number,episode_number,episode_count,release_kind,provider_name')
        .in('user_id', group).in('type', [...PUSH_TYPES]).gte('created_at', since)
        .order('created_at').order('id').range(from, from + PAGE - 1);
      if (error) throw new Error(`notifications read failed: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

async function muted(db: Db, rows: Notification[]) {
  const out = new Set<string>();
  const kinds = [
    { type: 'new_episode', table: 'episode_alert_mutes' as const },
    { type: 'streaming_arrival', table: 'movie_streaming_alert_mutes' as const },
  ];
  for (const kind of kinds) {
    const relevant = rows.filter(r => r.type === kind.type && r.tmdb_id != null);
    const ids = [...new Set(relevant.map(r => r.tmdb_id!))];
    const users = new Set(relevant.map(r => r.user_id));
    for (const group of chunks(ids, 100)) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from(kind.table).select('user_id,tmdb_id')
          .in('tmdb_id', group).order('user_id').range(from, from + PAGE - 1);
        if (error) throw new Error(`mutes read failed: ${error.message}`);
        for (const row of data ?? []) if (users.has(row.user_id)) out.add(`${kind.type}:${row.user_id}:${row.tmdb_id}`);
        if (!data || data.length < PAGE) break;
      }
    }
  }
  return out;
}

async function deliveries(db: Db, rows: Notification[]) {
  const out = new Map<string, Delivery>();
  for (const group of chunks(rows.map(r => r.id), 100)) {
    const { data, error } = await db.from('push_deliveries')
      .select('notification_id,token,status,attempts,claimed_at').in('notification_id', group);
    if (error) throw new Error(`deliveries read failed: ${error.message}`);
    for (const row of data ?? []) out.set(key(row.notification_id, row.token), row);
  }
  return out;
}

async function claim(db: Db, candidate: Candidate, nowIso: string) {
  const { notification: n, token: t, delivery: d, action } = candidate;
  if (action === 'claim') {
    const { data, error } = await db.from('push_deliveries').upsert({
      notification_id: n.id, token: t.token, status: 'pending', attempts: 1, claimed_at: nowIso,
    }, { onConflict: 'notification_id,token', ignoreDuplicates: true }).select('notification_id');
    if (error) throw new Error(`delivery claim failed: ${error.message}`);
    return !!data?.length;
  }
  let query = db.from('push_deliveries').update({ status: 'pending', attempts: (d?.attempts ?? 0) + 1, claimed_at: nowIso, error: null })
    .eq('notification_id', n.id).eq('token', t.token).eq('attempts', d!.attempts);
  query = action === 'retry' ? query.eq('status', 'failed')
    : d!.claimed_at ? query.eq('status', 'pending').eq('claimed_at', d!.claimed_at)
      : query.eq('status', 'pending').is('claimed_at', null);
  const { data, error } = await query.select('notification_id');
  if (error) throw new Error(`delivery reclaim failed: ${error.message}`);
  return !!data?.length;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);
  let dryRun = false;
  try { dryRun = (await req.json())?.dry_run === true; } catch { /* cron posts {} */ }
  const deliver = Deno.env.get('PUSH_DELIVER_ENABLED') === 'true' && !dryRun;
  const db = createClient<Database>(DB_URL, serviceKey());
  const started = Date.now();
  const nowIso = new Date(started).toISOString();
  const since = new Date(started - PUSH_LOOK_BACK_DAYS * 86_400_000).toISOString();
  try {
    const prefs = await preferences(db);
    // Push is Free: everyone who switched it on is eligible.
    const eligible = [...prefs.keys()];
    const devices = await tokens(db, eligible);
    const rows = await notifications(db, eligible.filter(id => devices.has(id)), since);
    const mutes = await muted(db, rows);
    const existing = await deliveries(db, rows);
    const candidates: Candidate[] = [];
    for (const n of rows) {
      if (pushBlocked(prefs.get(n.user_id)!, n, true)) continue;
      if (mutes.has(`${n.type}:${n.user_id}:${n.tmdb_id}`)) continue;
      for (const token of devices.get(n.user_id) ?? []) {
        const prior = existing.get(key(n.id, token.token)) ?? null;
        const action = pushAction(prior, started);
        if (action) candidates.push({ notification: n, token, delivery: prior, action });
      }
    }
    const chosen = candidates.slice(0, MAX_MESSAGES);
    if (!deliver) return json({ ok: true, dry_run: dryRun, delivery_enabled: false, candidates: candidates.length });
    let sent = 0, failed = 0, disabled = 0;
    for (const group of chunks(chosen, CHUNK)) {
      if (Date.now() - started > MAX_RUN_MS) break;
      const claimed: Candidate[] = [];
      for (const c of group) if (await claim(db, c, nowIso)) claimed.push(c);
      if (!claimed.length) continue;
      let tickets: Array<{ status: string; id?: string; details?: { error?: string } }> = [];
      try {
        const response = await fetch(SEND_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(claimed.map(c => ({ to: c.token.token, sound: 'default', ...pushMessage(c.notification) }))),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Expo returned ${response.status}`);
        const body = await response.json();
        tickets = Array.isArray(body?.data) ? body.data : [];
        if (tickets.length !== claimed.length) throw new Error('Expo ticket count mismatch');
      } catch (error) {
        reportLog('send-push', 'error', `send-push request failed: ${errorText(error)}`);
        for (const c of claimed) await db.from('push_deliveries').update({ status: 'failed', error: 'provider request failed' })
          .eq('notification_id', c.notification.id).eq('token', c.token.token);
        failed += claimed.length;
        continue;
      }
      for (let i = 0; i < claimed.length; i++) {
        const c = claimed[i], ticket = tickets[i];
        if (ticket.status === 'ok' && ticket.id) {
          const { error } = await db.from('push_deliveries').update({ status: 'sent', provider_ref: ticket.id, sent_at: new Date().toISOString(), receipted_at: null, error: null })
            .eq('notification_id', c.notification.id).eq('token', c.token.token);
          if (error) throw new Error(`delivery status failed: ${error.message}`);
          sent++;
        } else {
          const invalid = ticket.details?.error === 'DeviceNotRegistered';
          await db.from('push_deliveries').update({ status: invalid ? 'disabled' : 'failed', error: ticket.details?.error ?? 'provider rejected' })
            .eq('notification_id', c.notification.id).eq('token', c.token.token);
          if (invalid) {
            await db.from('push_tokens').update({ disabled_at: new Date().toISOString() }).eq('token', c.token.token);
            disabled++;
          } else failed++;
        }
      }
    }
    return json({ ok: true, candidates: candidates.length, selected: chosen.length, sent, failed, disabled });
  } catch (error) {
    reportLog('send-push', 'error', `send-push failed: ${errorText(error)}`);
    return json({ ok: false, error: 'Push delivery failed' }, 500);
  }
});
