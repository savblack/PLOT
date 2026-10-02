/**
 * people-feed-refresh: fills people_feed for one person right after someone
 * follows them, so Your people and the follow toast ("3 upcoming titles are
 * in Your people") are true straight away instead of after the next daily run.
 *
 *   POST {"person_id": <TMDB person id>}  with the signed-in user's bearer
 *   → {"upcoming": <titles and seasons dated today or later>}
 *
 * Only a Premium account that follows this person can ask, and a person whose
 * feed was refreshed in the last six hours is answered from the table without
 * calling TMDB, so this cannot be used to make the server fetch arbitrary
 * people. It writes people_feed only; release-day notifications stay with the
 * daily premium-alerts run.
 *
 * Auth: verify_jwt = true (config.toml); the handler resolves the user from the
 * bearer and checks the follow and is_premium() with the service role.
 * Secrets: TMDB_API_KEY.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { refreshPeopleFeed, upcomingCount, type FeedRow } from '../_shared/peopleFeedJob.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const FRESH_FOR_MS = 6 * 60 * 60 * 1000;

function allowedOrigin(origin: string | null) {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return origin;
  } catch { /* use canonical origin */ }
  return 'https://app.theplot.tv';
}

Deno.serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin(req.headers.get('Origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient<Database>(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Not signed in' }, 401);

  let personId = 0;
  try {
    const body = await req.json();
    personId = Number(body?.person_id);
  } catch { /* handled below */ }
  if (!Number.isInteger(personId) || personId <= 0) return json({ error: 'person_id is required' }, 400);

  const db = createClient<Database>(SUPABASE_URL, serviceKey());
  const [follow, premium] = await Promise.all([
    db.from('person_alerts').select('name').eq('user_id', user.id).eq('tmdb_person_id', personId).maybeSingle(),
    db.rpc('premium_user_ids', { p_users: [user.id] }),
  ]);
  if (follow.error || premium.error) return json({ error: 'Could not check the follow' }, 500);
  if (!follow.data) return json({ error: 'not_following' }, 403);
  if (!((premium.data ?? []) as string[]).includes(user.id)) return json({ error: 'premium_required' }, 403);

  const now = new Date();
  const existing = await db.from('people_feed').select('*').eq('tmdb_person_id', personId);
  if (existing.error) return json({ error: 'Could not read the feed' }, 500);
  const newest = Math.max(0, ...(existing.data ?? []).map(r => Date.parse(r.updated_at)));
  if (existing.data?.length && now.getTime() - newest < FRESH_FOR_MS) {
    return json({ upcoming: upcomingCount(existing.data as FeedRow[], now), cached: true });
  }

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbKey) return json({ error: 'TMDB_API_KEY is not set' }, 500);
  try {
    const { rows } = await refreshPeopleFeed(db, tmdbKey, [{ id: personId, name: follow.data.name }], now);
    return json({ upcoming: upcomingCount(rows, now), cached: false });
  } catch (err) {
    console.error(err);
    return json({ error: 'Could not refresh the feed' }, 500);
  }
});
