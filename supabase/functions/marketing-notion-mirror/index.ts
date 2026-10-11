/**
 * marketing-notion-mirror — keeps a Notion database matching marketing_posts.
 *
 * The read half of reviewing the week in Notion, and the write half as well.
 * Notion's webhooks do not say what a property used to be, so a delivery that
 * only echoed the current Status would re-apply it every time this sweep
 * rewrote the page. That is the bug that unapproved a Linear card (PLO-421).
 * This sweep stores the Status and Scheduled date it last wrote. A difference
 * is the only thing treated as a decision. marketing-notion-sync can wake the
 * same comparison for one page; it is not required for correctness. A missed
 * webhook is picked up here.
 *
 * Status and the scheduled date are read for every page in the database on
 * every tick. Slash-command comments are listed for posts that are not yet
 * live, and for posts whose day is within three weeks. A comment does not
 * update Notion's last_edited_time, so a comment on an older page is applied
 * when the webhook delivers, or on the next tick if the page was edited too.
 *
 * Weekly website-refresh pull requests are not mirrored here. Approve and
 * reject on those cards stay on Linear, including when MARKETING_LINEAR_ENABLED
 * is turned off. That flag does not affect this function.
 *
 * The Name property is the article title. The page body does not list slash
 * commands. Comments still accept them, including /copy. The body fingerprint
 * carries a shape mark so the next sweep rewrites pages that were rendered
 * with the dated title and the Commands block. That rewrite is not a decision.
 *
 * Auth: pg_cron via pg_net with the Vault service-role bearer. verify_jwt
 * stays true.
 *
 * DRY RUN: POST {"dry_run": true}. Reads Notion and the database, writes
 * neither. The would_create count is the one to read before the first real
 * sweep.
 *
 * Secrets: NOTION_TOKEN (NOTION_API_KEY is accepted), NOTION_MARKETING_DATABASE_ID.
 * Optional: GH_DISPATCH_TOKEN_CONTENT (or GH_DISPATCH_TOKEN) so /generate and
 * /regenerate can start the weekly workflow. The database itself is created
 * by marketing/setup/notion-review-db.mjs under NOTION_PARENT_PAGE_ID.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { githubDispatch, sweepNotion } from '../_shared/notionMirror.js';
import { notionId } from '../_shared/notionReview.js';

type Db = SupabaseClient<Database>;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const NOTION_TOKEN = Deno.env.get('NOTION_TOKEN') || Deno.env.get('NOTION_API_KEY') || '';
const DATABASE_ID = notionId(Deno.env.get('NOTION_MARKETING_DATABASE_ID') ?? '');
const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';
const LEGACY_GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';
const GH_CONTENT_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN_CONTENT') || LEGACY_GH_TOKEN;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const startRun = async (supabase: Db): Promise<string | null> => {
  try {
    const { data } = await supabase.from('marketing_batch_runs')
      .insert({ run_type: 'notion_mirror' }).select('id').single();
    return data?.id ?? null;
  } catch (err) {
    console.error('Could not open a Notion run record:', err);
    return null;
  }
};

const finishRun = async (supabase: Db, runId: string | null, patch: Record<string, unknown>) => {
  if (!runId) return;
  try {
    await supabase.from('marketing_batch_runs')
      .update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  } catch (err) {
    console.error('Could not close the Notion run record:', err);
  }
};

const pruneHeartbeats = async (supabase: Db) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await supabase.from('marketing_batch_runs').delete()
      .eq('run_type', 'notion_mirror').eq('status', 'idle').lt('started_at', cutoff);
  } catch (err) {
    console.error('Notion heartbeat prune failed:', err);
  }
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  if (!NOTION_TOKEN || !DATABASE_ID) {
    return json({
      ok: true,
      skipped: 'NOTION_TOKEN or NOTION_MARKETING_DATABASE_ID is not set',
    });
  }

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch { /* pg_cron posts {} */ }

  const supabase = createClient<Database>(SUPABASE_URL, serviceKey());
  const leaseOwner = crypto.randomUUID();
  if (!dryRun) {
    const { data: claimed, error: claimError } = await supabase.rpc('claim_marketing_notion_mirror', {
      p_owner: leaseOwner,
    });
    if (claimError) return json({ error: `Could not claim Notion mirror lease: ${claimError.message}` }, 500);
    if (!claimed) return json({ ok: true, skipped: 'another Notion sweep is active' });
  }
  const runId = dryRun ? null : await startRun(supabase);

  const dispatchWorkflow = githubDispatch(GH_CONTENT_TOKEN, GH_REPO);
  const opts = {
    token: NOTION_TOKEN,
    databaseId: DATABASE_ID,
    supabaseUrl: SUPABASE_URL,
    dryRun,
    now: new Date(),
    dispatchWorkflow,
    actionOpts: { actor: 'notion', surface: 'notion' as const, dispatchWorkflow },
  };

  try {
    const counts = await sweepNotion(supabase, opts);

    if (dryRun) return json({ ok: true, dry_run: true, would: counts });

    const didWork = counts.created > 0 || counts.patched > 0 || counts.inbound > 0 || counts.blocks > 0;
    await finishRun(supabase, runId, { status: didWork ? 'succeeded' : 'idle', counts });
    await pruneHeartbeats(supabase);
    return json({ ok: true, ...counts });
  } catch (err) {
    console.error('Notion mirror failed:', err);
    await finishRun(supabase, runId, { status: 'failed', error: String((err as Error).message).slice(0, 500) });
    return json({ error: String((err as Error).message) }, 500);
  } finally {
    if (!dryRun) {
      const { error } = await supabase.rpc('release_marketing_notion_mirror', { p_owner: leaseOwner });
      if (error) console.error('Could not release Notion mirror lease:', error);
    }
  }
});
