// One-time (re-runnable) backfill: syncs every PLOT app user into Brevo as a
// contact, segmented by existing newsletter opt-in (marketing_subscribers).
// Keeping it live afterward is handled by supabase/functions/notify-signup
// and profiles-changed — this script is just the initial (and any later
// manual re-) sync.
//
// Usage:
//   node marketing/setup/brevo-sync.mjs               # full backfill
//   node marketing/setup/brevo-sync.mjs --limit=5      # first N users only
//   DRY_RUN=1 node marketing/setup/brevo-sync.mjs       # no writes, just logs
//
// The attribute/folder/list "ensure" calls always run for real, even under
// DRY_RUN — they're idempotent account setup, not user data. Only the bulk
// import and list-add calls (the actual PII writes) are skipped in DRY_RUN.
//
// After the first real run, copy the two printed list ids into the Supabase
// Edge Function secrets (BREVO_LIST_ID / BREVO_MARKETING_LIST_ID) alongside
// BREVO_API_KEY — see marketing/README.md.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY
import { getSupabase } from '../lib/supabase.mjs';
import { ensureAttribute, ensureFolder, ensureList, bulkImport, addContactsToList } from '../lib/brevo.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = (() => {
  const arg = process.argv.find(a => a.startsWith('--limit='));
  return arg ? Number(arg.split('=')[1]) : null;
})();

const FOLDER_NAME = 'PLOT';
const APP_LIST_NAME = 'PLOT App Users';
const MARKETING_LIST_NAME = 'PLOT Marketing Subscribers';

const chunk = (array, size) => {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
};

// Brevo's "date" attribute type expects YYYY-MM-DD (see notify-signup).
const signupDate = (iso) => (iso ? String(iso).slice(0, 10) : undefined);

// Drop undefined/null attributes rather than sending them.
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

async function fetchAllUsers(supabase) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (!data?.users?.length) break;
    users.push(...data.users);
    if (LIMIT && users.length >= LIMIT) return users.slice(0, LIMIT);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function main() {
  const supabase = getSupabase();

  console.log('Ensuring Brevo attributes/folder/lists exist...');
  await ensureAttribute('USERNAME', 'text');
  await ensureAttribute('SIGNUP_DATE', 'date');
  await ensureAttribute('IS_PREMIUM', 'boolean');
  await ensureAttribute('OPT_IN', 'boolean');
  const folderId = await ensureFolder(FOLDER_NAME);
  const appListId = await ensureList(APP_LIST_NAME, folderId);
  const marketingListId = await ensureList(MARKETING_LIST_NAME, folderId);
  console.log(`Lists ready — ${APP_LIST_NAME}: ${appListId}, ${MARKETING_LIST_NAME}: ${marketingListId}`);
  console.log('If these are new, set BREVO_LIST_ID / BREVO_MARKETING_LIST_ID as Supabase Edge Function secrets.');

  const users = await fetchAllUsers(supabase);
  console.log(`Found ${users.length} auth user(s)${LIMIT ? ` (limited to ${LIMIT})` : ''}.`);
  if (!users.length) return;

  const ids = users.map(u => u.id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, first_name, is_premium')
    .in('id', ids);
  if (profilesError) throw new Error(`profiles query failed: ${profilesError.message}`);
  const profileById = new Map((profiles || []).map(p => [p.id, p]));

  const { data: subscribers, error: subscribersError } = await supabase
    .from('marketing_subscribers')
    .select('email')
    .eq('status', 'active');
  if (subscribersError) throw new Error(`marketing_subscribers query failed: ${subscribersError.message}`);
  const optedInEmails = new Set((subscribers || []).map(s => s.email.toLowerCase()));

  const contacts = [];
  const optedInContactEmails = [];
  for (const user of users) {
    if (!user.email) continue;
    const email = user.email.toLowerCase();
    const profile = profileById.get(user.id);
    const optedIn = optedInEmails.has(email);
    if (optedIn) optedInContactEmails.push(email);

    contacts.push({
      email,
      attributes: compact({
        USERNAME: profile?.username,
        FIRSTNAME: profile?.first_name,
        SIGNUP_DATE: signupDate(user.created_at),
        IS_PREMIUM: profile?.is_premium ?? false,
        OPT_IN: optedIn,
      }),
    });
  }

  console.log(`${contacts.length} contact(s) to sync, ${optedInContactEmails.length} opted in.`);

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — skipping bulk import. Sample:', JSON.stringify(contacts.slice(0, 3), null, 2));
    return;
  }

  for (const batch of chunk(contacts, 5000)) {
    const result = await bulkImport({ jsonBody: batch, listIds: [appListId] });
    console.log(`Queued import of ${batch.length} contact(s), processId=${result?.processId}`);
  }

  for (const batch of chunk(optedInContactEmails, 1000)) {
    await addContactsToList(marketingListId, batch);
  }

  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
