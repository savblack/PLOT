// Backfill lifecycle attributes onto existing Brevo contacts.
// Does not send onboarding_completed. Sending it would drop the existing
// base into the welcome automation.
//
// Dry run is the default for contacts. Pass --apply to write them.
// Attribute setup always runs, including on a dry run: Brevo drops a key it
// does not know, so the attributes have to exist before a sync can store them.
// --attributes-only stops after that setup.
//
// ONBOARDING_COMPLETED_AT uses the auth signup day. Plot never stored the
// moment onboarding finished, so the signup day is the stand-in.
//
// --apply needs the brevo lifecycle migration (the snapshot RPCs).
// --attributes-only does not.
//
//   node --env-file=.env marketing/setup/brevo-lifecycle-backfill.mjs
//   node --env-file=.env marketing/setup/brevo-lifecycle-backfill.mjs --attributes-only
//   node --env-file=.env marketing/setup/brevo-lifecycle-backfill.mjs --apply --limit=5
//
// Do not point this at production unless you mean to update those contacts.
//
// Env: SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY.
// Optional: BREVO_LIST_ID (default 4), used only when the contact does not exist yet.
import { getSupabase } from '../lib/supabase.mjs';
import { ensureAttribute, upsertContact } from '../lib/brevo.mjs';
import { brevoDate, lifecycleAttributes } from '../../packages/core/brevoLifecycle.js';

const APPLY = process.argv.includes('--apply');
const ATTRIBUTES_ONLY = process.argv.includes('--attributes-only');
const LIMIT = (() => {
  const arg = process.argv.find(a => a.startsWith('--limit='));
  return arg ? Number(arg.split('=')[1]) : null;
})();
const LIST_ID = Number(process.env.BREVO_LIST_ID || 4);

const ATTRIBUTES = [
  ['ONBOARDING_COMPLETED_AT', 'date'],
  ['LAST_TRACK_AT', 'date'],
  ['LAST_SEEN_AT', 'date'],
  ['TRACK_COUNT', 'float'],
  ['SAVED_TITLES', 'text'],
  ['IMPORTED', 'boolean'],
];
for (const slot of [1, 2, 3]) {
  ATTRIBUTES.push(
    [`TITLE_${slot}_NAME`, 'text'],
    [`TITLE_${slot}_POSTER_URL`, 'text'],
    [`TITLE_${slot}_URL`, 'text'],
  );
}

async function ensureLifecycleAttributes() {
  for (const [name, type] of ATTRIBUTES) {
    await ensureAttribute(name, type);
    console.log(`attribute ${name} (${type})`);
  }
}

async function getContact(email) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');
  const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    headers: { 'api-key': key.trim(), Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Brevo GET /contacts -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchOnboarded(supabase) {
  const rows = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    let query = supabase
      .from('profiles')
      .select('id, streaming_providers')
      .eq('onboarding_complete', true)
      .range(from, from + page - 1);
    if (LIMIT) query = supabase
      .from('profiles')
      .select('id, streaming_providers')
      .eq('onboarding_complete', true)
      .limit(LIMIT);
    const { data, error } = await query;
    if (error) throw new Error(`profiles query failed: ${error.message}`);
    rows.push(...(data || []));
    if (LIMIT || !data || data.length < page) break;
  }
  return rows;
}

function asTitles(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => ({
    name: row?.title || '',
    poster_path: row?.poster_path ?? null,
    tmdbId: row?.tmdb_id,
    mediaType: row?.media_type,
  }));
}

async function main() {
  if (!process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set');
  await ensureLifecycleAttributes();
  if (ATTRIBUTES_ONLY) {
    console.log('--attributes-only: contact rows were not read or written.');
    return;
  }

  const supabase = getSupabase();
  const profiles = await fetchOnboarded(supabase);
  console.log(`${profiles.length} onboarded profile(s). ${APPLY ? 'Writing.' : 'Dry run (pass --apply to write).'}`);

  let written = 0;
  let skipped = 0;
  const sample = [];

  for (const profile of profiles) {
    const { data, error } = await supabase.auth.admin.getUserById(profile.id);
    if (error || !data?.user?.email || data.user.deleted_at) {
      skipped += 1;
      continue;
    }
    const email = data.user.email.trim().toLowerCase();

    const [track, watch, state] = await Promise.all([
      supabase.rpc('brevo_tracking_snapshot', { uid: profile.id }),
      supabase.rpc('brevo_watchlist_snapshot', { uid: profile.id }),
      supabase.from('brevo_sync_state').select('imported').eq('user_id', profile.id).maybeSingle(),
    ]);
    if (track.error || watch.error) {
      throw new Error(`snapshot failed for ${profile.id}: ${track.error?.message || watch.error?.message}. Apply the brevo lifecycle migration first.`);
    }

    const attributes = {
      ...lifecycleAttributes({
        trackCount: Number(track.data?.track_count) || 0,
        lastTrackAt: track.data?.last_track_at,
        lastSeenAt: data.user.last_sign_in_at,
        imported: !!state.data?.imported,
        titles: asTitles(watch.data?.titles),
      }),
    };
    const completed = brevoDate(data.user.created_at);
    if (completed) attributes.ONBOARDING_COMPLETED_AT = completed;

    if (sample.length < 3) sample.push({ email, attributes });

    if (!APPLY) continue;

    const existing = await getContact(email);
    if (existing?.emailBlacklisted) {
      await upsertContact({ email, attributes });
    } else if (!existing && Number.isInteger(LIST_ID) && LIST_ID > 0) {
      await upsertContact({ email, attributes, listIds: [LIST_ID] });
    } else {
      await upsertContact({ email, attributes });
    }
    written += 1;
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  console.log(JSON.stringify({ apply: APPLY, written, skipped, sample }, null, 2));
  if (!APPLY) console.log('Dry run only. No contact was created or updated.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
