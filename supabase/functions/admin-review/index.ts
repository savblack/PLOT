/**
 * admin-review — the marketing control room (served at admin.theplot.tv).
 *
 * Server-rendered HTML, form POSTs back to itself. The view/render helpers live
 * in ./view.js so this file can stay focused on auth, actions, and data reads.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ACTIVE,
  HISTORY,
  mergeCopyValues,
  renderControlDeskPage,
  renderLoginPage,
} from './view.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_TOKEN = Deno.env.get('ADMIN_TOKEN') ?? '';
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') ?? '';
const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';
const GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';
const SITE_URL = 'https://theplot.tv';

const SECRETS = [ADMIN_PASSWORD, ADMIN_TOKEN].filter((value) => value.length > 0);
const validSecret = (value: string | null | undefined): boolean => !!value && SECRETS.includes(value);

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const cookieToken = (req: Request) => {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((chunk) => chunk.startsWith('admin_token='))?.slice('admin_token='.length);
  return raw ? decodeURIComponent(raw) : undefined;
};

const authed = (req: Request, url: URL) =>
  validSecret(url.searchParams.get('key')) || validSecret(cookieToken(req));

const nowIso = () => new Date().toISOString();

const dispatchWorkflow = async (workflow: string): Promise<{ ok: boolean; reason?: string }> => {
  if (!GH_TOKEN) return { ok: false, reason: 'GH_DISPATCH_TOKEN is not set' };
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'plot-control-room',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    console.error(`Workflow dispatch failed for ${workflow}: ${res.status} ${body}`);
    return { ok: false, reason: `GitHub dispatch failed (${res.status})` };
  } catch (err) {
    console.error(`Workflow dispatch errored for ${workflow}:`, err);
    return { ok: false, reason: 'GitHub dispatch errored' };
  }
};

const requeuePubs = (supabase: ReturnType<typeof createClient>, ids: string[]) =>
  supabase.from('marketing_post_publications')
    .update({ status: 'queued', error: null })
    .in('post_id', ids).in('status', ['skipped', 'failed']);

const loadPageData = async (supabase: ReturnType<typeof createClient>) => {
  const [{ data: settings }, { data: activeRows }, { data: historyRows }] = await Promise.all([
    supabase.from('marketing_settings').select('publishing_paused').limit(1).maybeSingle(),
    supabase
      .from('marketing_posts')
      .select('id, post_type, topic_key, scheduled_for, updated_at, copy, media, slug, status, tmdb_refs, payload, marketing_post_publications(id,platform,status,permalink,error)')
      .in('status', ACTIVE)
      .order('scheduled_for'),
    supabase
      .from('marketing_posts')
      .select('id, post_type, scheduled_for, status, marketing_post_publications(id,platform,status,permalink)')
      .in('status', HISTORY)
      .gte('scheduled_for', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('scheduled_for', { ascending: false })
      .limit(20),
  ]);

  const history = historyRows || [];
  const publicationIds = history.flatMap((post) => (post.marketing_post_publications || []).map((publication: Row) => publication.id));
  const metrics = new Map<string, { views: number; likes: number }>();
  if (publicationIds.length) {
    const { data: metricRows } = await supabase
      .from('marketing_metrics')
      .select('publication_id, views, likes, metric_date')
      .in('publication_id', publicationIds)
      .order('metric_date', { ascending: false });
    for (const row of metricRows || []) {
      if (!metrics.has(row.publication_id)) metrics.set(row.publication_id, { views: row.views || 0, likes: row.likes || 0 });
    }
  }

  return {
    paused: !!settings?.publishing_paused,
    active: activeRows || [],
    history,
    metrics,
  };
};

const applyAction = async (
  supabase: ReturnType<typeof createClient>,
  form: FormData,
): Promise<{ flash: string; acted: string }> => {
  const id = String(form.get('id') || '');
  const action = String(form.get('action') || '');
  const acted = id || '';

  if (action === 'pause' || action === 'resume') {
    await supabase.from('marketing_settings')
      .update({ publishing_paused: action === 'pause', updated_at: nowIso() })
      .eq('id', 1);
    return { acted, flash: action === 'pause' ? 'Publishing paused — nothing will be sent until you resume.' : 'Publishing resumed — approved posts can send again.' };
  }

  if (action === 'approve_all') {
    const { data } = await supabase.from('marketing_posts')
      .update({ status: 'approved', updated_at: nowIso() })
      .eq('status', 'needs_review')
      .select('id');
    const ids = (data || []).map((row) => row.id);
    if (ids.length) await requeuePubs(supabase, ids);
    return { acted: '', flash: ids.length ? `Approved for scheduled publishing — ${ids.length} post(s) cleared.` : 'Nothing was waiting for approval.' };
  }

  if (!id) return { acted, flash: '' };

  if (action === 'reject') {
    await supabase.from('marketing_posts').update({ status: 'vetoed', updated_at: nowIso() }).eq('id', id);
    await supabase.from('marketing_post_publications').update({ status: 'skipped' }).eq('post_id', id).eq('status', 'queued');
    return { acted, flash: 'Rejected — this post has been removed from the publish queue.' };
  }

  if (action === 'unapprove') {
    await supabase.from('marketing_posts').update({ status: 'needs_review', updated_at: nowIso() }).eq('id', id);
    return { acted, flash: 'Moved back into review — it will not publish until approved again.' };
  }

  if (action === 'reschedule') {
    const date = String(form.get('scheduled_date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { acted, flash: 'Reschedule needs a valid date.' };
    await supabase.from('marketing_posts')
      .update({ scheduled_for: `${date}T12:00:00.000Z`, updated_at: nowIso() })
      .eq('id', id);
    return { acted, flash: `Rescheduled only — publish timing updated to ${date}.` };
  }

  if (action === 'retry') {
    await supabase.from('marketing_post_publications')
      .update({ status: 'queued', error: null })
      .eq('post_id', id)
      .eq('status', 'failed');
    await supabase.from('marketing_posts')
      .update({ status: 'approved', updated_at: nowIso() })
      .eq('id', id);
    return { acted, flash: 'Retry queued — failed platforms will be picked up on the next publish check.' };
  }

  if (action === 'regenerate') {
    await supabase.from('marketing_posts')
      .update({ status: 'planned', copy: null, updated_at: nowIso() })
      .eq('id', id);
    const triggered = await dispatchWorkflow('marketing-weekly-batch.yml');
    return {
      acted,
      flash: triggered.ok
        ? 'Regenerate queued — the weekly batch was kicked off for a fresh rewrite.'
        : 'Regenerate queued — the next weekly batch will rebuild this post.',
    };
  }

  const { data: current } = await supabase.from('marketing_posts').select('copy').eq('id', id).single();
  const mergedCopy = mergeCopyValues(current?.copy || {}, form);

  if (action === 'publish_now') {
    await supabase.from('marketing_posts')
      .update({ copy: mergedCopy, status: 'approved', scheduled_for: nowIso(), updated_at: nowIso() })
      .eq('id', id);
    await requeuePubs(supabase, [id]);
    const triggered = await dispatchWorkflow('marketing-publish.yml');
    return {
      acted,
      flash: triggered.ok
        ? 'Saved and publishing now — approved copy is being sent to socials.'
        : `Saved and queued for the 5-minute publish runner${triggered.reason ? ` (${triggered.reason})` : ''}.`,
    };
  }

  const patch: Record<string, unknown> = { copy: mergedCopy, updated_at: nowIso() };
  if (action === 'approve') patch.status = 'approved';
  await supabase.from('marketing_posts').update(patch).eq('id', id);
  if (action === 'approve') await requeuePubs(supabase, [id]);
  return {
    acted,
    flash: action === 'approve'
      ? 'Saved and approved for its scheduled slot.'
      : 'Saved only — nothing has been queued to publish.',
  };
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const form = req.method === 'POST' ? await req.formData() : null;
  const submitted = form ? String(form.get('password') || '') : '';
  const passwordOk = validSecret(submitted);

  if (!authed(req, url) && !passwordOk) {
    return new Response(renderLoginPage(!!form && form.has('password')), {
      status: 401,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const sessionSecret = passwordOk ? submitted : (validSecret(url.searchParams.get('key')) ? url.searchParams.get('key')! : '');
  const setCookie = sessionSecret
    ? { 'set-cookie': `admin_token=${encodeURIComponent(sessionSecret)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` }
    : {};

  let flash = '';
  let acted = '';
  if (form && form.get('action')) {
    const result = await applyAction(supabase, form);
    flash = result.flash;
    acted = result.acted;
  }

  const key = url.searchParams.get('key') || cookieToken(req) || (passwordOk ? submitted : '');
  const { paused, active, history, metrics } = await loadPageData(supabase);
  const html = renderControlDeskPage({
    active,
    history,
    metrics,
    paused,
    flash,
    acted,
    key,
    nowIso: nowIso(),
    supabaseUrl: SUPABASE_URL,
    siteUrl: SITE_URL,
  });

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', ...setCookie },
  });
});
