/**
 * brevo-lifecycle
 *
 * Signed-in POST { action: 'onboarding_completed' }
 *   Claims the pending flag and sends the Brevo event onboarding_completed.
 *   Contact attributes on that call are the welcome snapshot (current watchlist,
 *   not the raw onboarding picks).
 *
 * Service-role POST (pg_cron, hourly)
 *   Notes recent sign-ins, retries pending onboarding events, then pushes
 *   TRACK_COUNT, LAST_TRACK_AT, LAST_SEEN_AT, IMPORTED, and the current
 *   watchlist slots for contacts that have been dirty for an hour.
 *   This path never sends onboarding_completed for an account the client
 *   did not flag. That is what keeps the existing base out of the automation.
 *
 * A deleted auth user is removed from brevo_sync_state and not recreated in
 * Brevo. A blacklisted contact is not put back on a list and does not get
 * the event.
 *
 * Auth: verify_jwt = true. The user path resolves the bearer. The cron path
 * requires the service-role bearer on top of that.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { getBrevoContact, trackBrevoEvent, upsertBrevoContact } from '../_shared/brevo.ts';
import {
  ONBOARDING_EVENT,
  isRetryableBrevoStatus,
  lifecycleAttributes,
  onboardingContactProperties,
  onboardingEventProperties,
  shouldSendOnboardingEvent,
} from '../../../packages/core/brevoLifecycle.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const EVENT_BATCH = 20;
const ATTRIBUTE_BATCH = 40;
const HOUR_MS = 60 * 60 * 1000;

// The new table and RPCs are not in the generated Database types until the
// next gen:db-types. The default Supabase client types those rows as `never`,
// so this stays untyped on purpose.
function admin(): any {
  return createClient(SUPABASE_URL, serviceKey());
}

function allowedOrigin(origin: string | null) {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return origin;
  } catch { /* use the canonical origin */ }
  return 'https://app.theplot.tv';
}

function statusOf(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/Brevo (\d+)/);
  return match ? Number(match[1]) : null;
}

function listIdsFor(profile: { marketing_emails?: boolean | null } | null) {
  const listId = Number(Deno.env.get('BREVO_LIST_ID'));
  const marketingId = Number(Deno.env.get('BREVO_MARKETING_LIST_ID'));
  const ids: number[] = [];
  if (Number.isInteger(listId) && listId > 0) ids.push(listId);
  if (profile?.marketing_emails && Number.isInteger(marketingId) && marketingId > 0) ids.push(marketingId);
  return ids;
}

function asTitles(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: any) => ({
      name: typeof row?.title === 'string' ? row.title : '',
      poster_path: typeof row?.poster_path === 'string' ? row.poster_path : null,
      tmdbId: row?.tmdb_id,
      mediaType: row?.media_type,
    }))
    .filter((title) => title.name);
}

type Account =
  | { ok: false; gone?: boolean; reason: string }
  | {
    ok: true;
    email: string;
    profile: { onboarding_complete?: boolean | null; streaming_providers?: unknown; marketing_emails?: boolean | null };
  };

function userIsGone(error: { status?: number; message?: string } | null, user: { deleted_at?: string | null } | null) {
  if (user?.deleted_at) return true;
  if (user) return false;
  if (!error) return true;
  if (error.status === 404) return true;
  return /not found/i.test(error.message || '');
}

async function loadAccount(db: any, userId: string, known?: { email?: string | null }): Promise<Account> {
  let email = known?.email?.trim().toLowerCase() || '';
  if (!email) {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (userIsGone(error, data?.user ?? null)) {
      await db.from('brevo_sync_state').delete().eq('user_id', userId);
      console.warn(`[brevo] skipped deleted user ${userId}`);
      return { ok: false, gone: true, reason: 'deleted' };
    }
    if (error || !data?.user) {
      console.warn(`[brevo] user lookup failed ${userId}`);
      return { ok: false, reason: 'lookup' };
    }
    email = data.user.email?.trim().toLowerCase() || '';
  }
  if (!email) return { ok: false, reason: 'no_email' };

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('onboarding_complete, streaming_providers, marketing_emails')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profile) {
    console.warn(`[brevo] profile read failed ${userId}`);
    return { ok: false, reason: 'profile' };
  }
  return { ok: true, email, profile };
}

async function snapshots(db: any, userId: string) {
  const [track, watch, state] = await Promise.all([
    db.rpc('brevo_tracking_snapshot', { uid: userId }),
    db.rpc('brevo_watchlist_snapshot', { uid: userId }),
    db.from('brevo_sync_state').select('imported, last_seen_at').eq('user_id', userId).maybeSingle(),
  ]);
  if (track.error || watch.error) {
    console.error(`[brevo] snapshot failed ${userId}`, track.error?.message || watch.error?.message);
    return null;
  }
  const titles = asTitles(watch.data?.titles);
  return {
    titles,
    pickedCount: Number(watch.data?.count) || 0,
    trackCount: Number(track.data?.track_count) || 0,
    lastTrackAt: track.data?.last_track_at ?? null,
    imported: !!state.data?.imported,
    lastSeenAt: state.data?.last_seen_at ?? null,
  };
}

async function release(db: any, userId: string) {
  const { error } = await db.rpc('release_brevo_onboarding_event', { uid: userId });
  if (error) console.error(`[brevo] release failed ${userId}`, error.message);
}

async function sendOnboarding(
  db: any,
  apiKey: string,
  userId: string,
  known?: { email?: string | null },
) {
  const account = await loadAccount(db, userId, known);
  if (!account.ok) return { ok: !account.gone, skipped: account.reason };

  if (!account.profile.onboarding_complete) {
    await db.from('brevo_sync_state')
      .update({ onboarding_event_pending: false })
      .eq('user_id', userId)
      .is('onboarding_event_at', null);
    return { ok: true, skipped: 'onboarding_incomplete' };
  }

  const snap = await snapshots(db, userId);
  if (!snap) return { ok: false, skipped: 'snapshot' };

  const { data: claimed, error: claimError } = await db.rpc('claim_brevo_onboarding_event', { uid: userId });
  if (claimError) {
    console.error(`[brevo] claim failed ${userId}`, claimError.message);
    return { ok: false, skipped: 'claim' };
  }
  if (!claimed) return { ok: true, skipped: 'already_sent' };

  const providers = Array.isArray(account.profile.streaming_providers)
    ? account.profile.streaming_providers
    : [];
  const contactProperties = onboardingContactProperties({
    completedAt: new Date().toISOString(),
    titles: snap.titles,
    imported: snap.imported,
  });
  const eventProperties = onboardingEventProperties({
    titles: snap.titles,
    imported: snap.imported,
    pickedCount: snap.pickedCount,
    providers,
  });

  let eventSent = false;
  try {
    const contact = await getBrevoContact({ apiKey, email: account.email });
    const blacklisted = !shouldSendOnboardingEvent(contact);
    const listIds = contact || blacklisted ? undefined : listIdsFor(account.profile);
    if (!blacklisted) {
      await trackBrevoEvent({
        apiKey,
        email: account.email,
        event: ONBOARDING_EVENT,
        eventProperties,
        contactProperties,
      });
      eventSent = true;
    }
    await upsertBrevoContact({
      apiKey,
      email: account.email,
      attributes: contactProperties,
      listIds,
      skipBlacklistCheck: true,
    });
    console.log(`[brevo] onboarding ${blacklisted ? 'skipped blacklist' : 'sent'} ${userId}`);
    return { ok: true, sent: !blacklisted, skipped: blacklisted ? 'blacklisted' : undefined };
  } catch (err) {
    const status = statusOf(err);
    // Once the event is in, releasing the claim would send the welcome again.
    if (!eventSent && isRetryableBrevoStatus(status)) await release(db, userId);
    console.error(`[brevo] onboarding failed ${userId}`, err instanceof Error ? err.message : err);
    return { ok: false, skipped: 'brevo' };
  }
}

async function syncOne(db: any, apiKey: string, row: {
  user_id: string;
  dirty_at: string;
  imported: boolean;
  last_seen_at: string | null;
}) {
  const account = await loadAccount(db, row.user_id);
  if (!account.ok) return false;
  const snap = await snapshots(db, row.user_id);
  if (!snap) return false;

  const attributes = lifecycleAttributes({
    trackCount: snap.trackCount,
    lastTrackAt: snap.lastTrackAt,
    lastSeenAt: snap.lastSeenAt || row.last_seen_at,
    imported: snap.imported || row.imported,
    titles: snap.titles,
  });

  try {
    const contact = await getBrevoContact({ apiKey, email: account.email });
    // Existing contacts are attribute-only. List ids on an update put an
    // unsubscribed address back on the list. A brand-new contact (the signup
    // sync missed them) still needs the app list.
    const listIds = contact ? undefined : listIdsFor(account.profile);
    await upsertBrevoContact({
      apiKey,
      email: account.email,
      attributes,
      listIds,
      skipBlacklistCheck: true,
    });
  } catch (err) {
    console.error(`[brevo] attribute sync failed ${row.user_id}`, err instanceof Error ? err.message : err);
    return false;
  }

  const { error } = await db.from('brevo_sync_state')
    .update({ synced_at: new Date().toISOString(), dirty_at: null })
    .eq('user_id', row.user_id)
    .eq('dirty_at', row.dirty_at);
  if (error) console.error(`[brevo] clear dirty failed ${row.user_id}`, error.message);
  return true;
}

async function runCron(db: any) {
  const apiKey = Deno.env.get('BREVO_API_KEY')?.trim();
  if (!apiKey) {
    console.error('BREVO_API_KEY is not set');
    return { ok: false };
  }

  const noted = await db.rpc('brevo_note_recent_signins');
  if (noted.error) console.error('[brevo] sign-in fold failed', noted.error.message);

  const pending = await db.from('brevo_sync_state')
    .select('user_id')
    .eq('onboarding_event_pending', true)
    .is('onboarding_event_at', null)
    .limit(EVENT_BATCH);

  let events = 0;
  for (const row of pending.data || []) {
    const result = await sendOnboarding(db, apiKey, row.user_id);
    if (result.sent) events += 1;
  }

  const hourAgo = new Date(Date.now() - HOUR_MS).toISOString();
  const dirty = await db.from('brevo_sync_state')
    .select('user_id, dirty_at, imported, last_seen_at')
    .not('dirty_at', 'is', null)
    .or(`synced_at.is.null,synced_at.lt.${hourAgo}`)
    .order('dirty_at', { ascending: true })
    .limit(ATTRIBUTE_BATCH);

  let attributes = 0;
  for (const row of dirty.data || []) {
    if (!row.dirty_at) continue;
    const pushed = await syncOne(db, apiKey, row);
    if (pushed) attributes += 1;
  }

  return { ok: true, signins: noted.data ?? 0, events, attributes };
}

Deno.serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin(req.headers.get('Origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = admin();

  if (hasServiceRoleBearer(req)) {
    try {
      return json(await runCron(db));
    } catch (err) {
      console.error('[brevo] cron failed', err instanceof Error ? err.message : err);
      return json({ ok: false });
    }
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Not signed in' }, 401);

  const apiKey = Deno.env.get('BREVO_API_KEY')?.trim();
  if (!apiKey) {
    console.error('BREVO_API_KEY is not set');
    return json({ ok: false, skipped: 'no_key' });
  }

  try {
    return json(await sendOnboarding(db, apiKey, user.id, { email: user.email }));
  } catch (err) {
    console.error(`[brevo] onboarding failed ${user.id}`, err instanceof Error ? err.message : err);
    return json({ ok: false });
  }
});
