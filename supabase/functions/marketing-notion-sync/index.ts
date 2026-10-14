/**
 * marketing-notion-sync — optional webhook that wakes the Notion sweep for
 * one page.
 *
 * The sweep (marketing-notion-mirror) is the authority. This exists so a
 * Status edit or a /copy comment is applied when Notion delivers it, instead
 * of on the next five-minute tick. The handler does not trust the payload's
 * property values. It loads the page and runs the same comparison the sweep
 * runs, which ignores a write this system just made. A title and body rewrite
 * from the mirror is not a status change.
 *
 * Notion signs the raw body with the verification token from the subscription
 * handshake (`X-Notion-Signature: sha256=<hex>`). The first delivery is an
 * unsigned `{ "verification_token": "..." }` body. Paste that token into
 * NOTION_WEBHOOK_SECRET. Until the secret is set, event deliveries are
 * refused and the cron sweep still applies edits.
 *
 * verify_jwt is false. Notion does not send a Supabase JWT. The signature is
 * the auth. The verification handshake is the one unsigned body accepted, and
 * it changes nothing.
 *
 * Secrets: NOTION_WEBHOOK_SECRET, NOTION_TOKEN, NOTION_MARKETING_DATABASE_ID.
 * Optional GH_DISPATCH_TOKEN_CONTENT, same as the mirror.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { githubDispatch, syncNotionPage } from '../_shared/notionMirror.js';
import {
  isNotionVerification,
  notionId,
  notionSignatureOk,
  pageIdFromWebhook,
} from '../_shared/notionReview.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const NOTION_TOKEN = Deno.env.get('NOTION_TOKEN') || Deno.env.get('NOTION_API_KEY') || '';
const DATABASE_ID = notionId(Deno.env.get('NOTION_MARKETING_DATABASE_ID') ?? '');
const WEBHOOK_SECRET = Deno.env.get('NOTION_WEBHOOK_SECRET') ?? '';
const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';
const LEGACY_GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';
const GH_CONTENT_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN_CONTENT') || LEGACY_GH_TOKEN;

const HANDLED = new Set([
  'page.properties_updated',
  'page.content_updated',
  'comment.created',
  'comment.updated',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const raw = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  if (isNotionVerification(payload)) {
    console.log('Notion webhook verification token received. Set NOTION_WEBHOOK_SECRET to this value.');
    return json({ ok: true, verification_token: payload.verification_token });
  }

  if (!WEBHOOK_SECRET) {
    console.error('NOTION_WEBHOOK_SECRET is not set — refusing the delivery. The cron sweep still applies edits.');
    return json({ error: 'Not configured' }, 503);
  }
  const signature = req.headers.get('X-Notion-Signature') ?? req.headers.get('x-notion-signature') ?? '';
  if (!await notionSignatureOk(WEBHOOK_SECRET, raw, signature)) {
    return json({ error: 'Bad signature' }, 401);
  }

  if (!NOTION_TOKEN || !DATABASE_ID) {
    return json({ ok: true, skipped: 'Notion is not configured' });
  }

  const type = String(payload.type ?? '');
  if (!HANDLED.has(type)) return json({ ok: true, ignored: type || true });

  const parent = payload.data as { parent?: { type?: string; id?: string } } | undefined;
  if (parent?.parent?.type === 'database' || parent?.parent?.type === 'data_source') {
    if (notionId(parent.parent.id) !== DATABASE_ID) {
      return json({ ok: true, ignored: 'other database' });
    }
  }

  const pageId = pageIdFromWebhook(payload);
  if (!pageId) return json({ ok: true, ignored: 'no page' });

  const supabase = createClient<Database>(SUPABASE_URL, serviceKey());
  const leaseOwner = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc('claim_marketing_notion_mirror', {
    p_owner: leaseOwner,
  });
  if (claimError) return json({ error: `Could not claim Notion mirror lease: ${claimError.message}` }, 500);
  if (!claimed) return json({ ok: true, skipped: 'a sweep is active' });

  const dispatchWorkflow = githubDispatch(GH_CONTENT_TOKEN, GH_REPO);
  try {
    const result = await syncNotionPage(supabase, pageId, {
      token: NOTION_TOKEN,
      databaseId: DATABASE_ID,
      supabaseUrl: SUPABASE_URL,
      dryRun: false,
      now: new Date(),
      dispatchWorkflow,
      forceComments: true,
      actionOpts: { actor: 'notion', surface: 'notion' as const, dispatchWorkflow },
    });
    if (!result) return json({ ok: true, ignored: 'not a mirrored post' });
    return json({ ok: true, page_id: notionId(pageId), ...result });
  } catch (err) {
    console.error('Notion webhook failed:', err);
    return json({ error: 'Internal error' }, 500);
  } finally {
    const { error } = await supabase.rpc('release_marketing_notion_mirror', { p_owner: leaseOwner });
    if (error) console.error('Could not release Notion mirror lease:', error);
  }
});
