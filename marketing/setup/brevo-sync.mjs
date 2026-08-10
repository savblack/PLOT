// One-time (re-runnable) backfill: syncs every PLOT app user into Brevo as a
// contact, segmented by existing newsletter opt-in (marketing_subscribers),
// plus everyone on the launch waitlist (app_waitlist).
// Keeping it live afterward is handled by supabase/functions/notify-signup,
// profiles-changed and newsletter-subscribe — this script is just the initial
// (and any later manual re-) sync.
//
// Usage (run from the repo root — the env vars below come from .env, which this
// script does not load on its own):
//   node --env-file=.env marketing/setup/brevo-sync.mjs             # full backfill
//   node --env-file=.env marketing/setup/brevo-sync.mjs --limit=5   # first N users/waitlist rows
//   DRY_RUN=1 node --env-file=.env marketing/setup/brevo-sync.mjs   # no contact writes
//
// The attribute/folder/list "ensure" calls always run for real, even under
// DRY_RUN — they're idempotent account setup, not user data. Only the bulk
// import and list-add calls (the actual PII writes) are skipped in DRY_RUN.
// So a DRY_RUN still creates the lists and attributes in the live Brevo account.
//
// After the first real run, copy the three printed list ids into the Supabase
// Edge Function secrets (BREVO_LIST_ID / BREVO_MARKETING_LIST_ID /
// BREVO_WAITLIST_LIST_ID) alongside BREVO_API_KEY — see marketing/README.md.
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
const WAITLIST_LIST_NAME = 'PLOT Waitlist';

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

// The website's "notify me when the app lands" form and the app's maintenance
// splash both write to app_waitlist, which had no path into Brevo at all — the
// addresses sat in a table with nothing able to send to them. Its own list,
// separate from the marketing one: joining the waitlist is consent to hear
// about the launch, not to receive the weekly digest, so OPT_IN is left alone.
async function syncWaitlist(supabase, waitlistListId) {
  let query = supabase.from('app_waitlist').select('email, source');
  if (LIMIT) query = query.limit(LIMIT);
  const { data: rows, error } = await query;
  if (error) throw new Error(`app_waitlist query failed: ${error.message}`);
  if (!rows?.length) {
    console.log('Waitlist is empty — nothing to sync.');
    return;
  }

  const contacts = rows.map(row => ({
    email: row.email.toLowerCase(),
    attributes: compact({ WAITLIST_SOURCE: row.source }),
  }));
  console.log(`${contacts.length} waitlist contact(s) to sync${LIMIT ? ` (limited to ${LIMIT})` : ''}.`);

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — skipping waitlist import. Sample:', JSON.stringify(contacts.slice(0, 3), null, 2));
    return;
  }

  for (const batch of chunk(contacts, 5000)) {
    const result = await bulkImport({ jsonBody: batch, listIds: [waitlistListId] });
    console.log(`Queued import of ${batch.length} waitlist contact(s), processId=${result?.processId}`);
  }
}

async function main() {
  const supabase = getSupabase();

  console.log('Ensuring Brevo attributes/folder/lists exist...');
  await ensureAttribute('USERNAME', 'text');
  await ensureAttribute('SIGNUP_DATE', 'date');
  await ensureAttribute('IS_PREMIUM', 'boolean');
  await ensureAttribute('OPT_IN', 'boolean');
  await ensureAttribute('WAITLIST_SOURCE', 'text');
  const folderId = await ensureFolder(FOLDER_NAME);
  const appListId = await ensureList(APP_LIST_NAME, folderId);
  const marketingListId = await ensureList(MARKETING_LIST_NAME, folderId);
  const waitlistListId = await ensureList(WAITLIST_LIST_NAME, folderId);
  console.log(`Lists ready — ${APP_LIST_NAME}: ${appListId}, ${MARKETING_LIST_NAME}: ${marketingListId}, ${WAITLIST_LIST_NAME}: ${waitlistListId}`);
  console.log('If these are new, set BREVO_LIST_ID / BREVO_MARKETING_LIST_ID / BREVO_WAITLIST_LIST_ID as Supabase Edge Function secrets.');

  // Before the app-user sync, and outside its early return — the waitlist is
  // mostly people who have no account, so it must not depend on there being any.
  await syncWaitlist(supabase, waitlistListId);

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

  // Brevo 400s when every address in the batch is already a member, and this
  // script is meant to be re-runnable — by the second run the marketing list is
  // already populated (notify-signup / profiles-changed keep it current), so a
  // strict throw here fails a run that otherwise completed everything. Log the
  // real Brevo message and carry on rather than exiting 1 on a no-op.
  for (const batch of chunk(optedInContactEmails, 1000)) {
    try {
      await addContactsToList(marketingListId, batch);
    } catch (err) {
      console.warn(`Marketing list add skipped for ${batch.length} contact(s) — ${err.message}`);
    }
  }

  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
