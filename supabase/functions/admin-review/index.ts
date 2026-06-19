/**
 * admin-review — the marketing control room (served at admin.theplot.tv).
 *
 * One token-gated page that makes the whole weekly batch legible and controllable:
 *   • the upcoming week grouped by day, each post showing WHY it was planned, the
 *     rendered cards, the copy, the article link and its per-platform publish state;
 *   • a recent-history section (what published where, with light metrics);
 *   • per-post actions: edit, Approve / Reject / Unapprove, Reschedule, Publish now,
 *     Regenerate (rebuild via the worker), Retry failed; plus top-level
 *     Approve-the-week and a global Pause switch. Card images open full-size.
 *
 * The publish gate is approval-based: only status 'approved' posts are sent to
 * Buffer (by the daily push), on their scheduled day. Silence = never published.
 *
 * Deliberately tiny: server-rendered HTML, form POSTs back to itself, no framework,
 * no client JS. Auth: ?key=<ADMIN_TOKEN> once; a cookie keeps navigation/forms working.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_TOKEN = Deno.env.get('ADMIN_TOKEN') ?? '';
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') ?? '';
// Either secret signs you in: the friendly ADMIN_PASSWORD (typed on the login
// page) or the original ADMIN_TOKEN (also accepted via ?key= for bookmarks).
const SECRETS = [ADMIN_PASSWORD, ADMIN_TOKEN].filter((s) => s.length > 0);
const validSecret = (s: string | null | undefined): boolean => !!s && SECRETS.includes(s);
const SITE_URL = 'https://theplot.tv';

// The week in progress (everything still decidable / editable), oldest first.
// 'planned' is included so a post being regenerated stays visible as "Queued".
const ACTIVE = ['planned', 'needs_review', 'copy_ready', 'generated', 'approved', 'vetoed'];
// Recently resolved, for the read-only history panel.
const HISTORY = ['published', 'partially_published', 'failed'];

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const mediaUrl = (p: string) => `${SUPABASE_URL}/storage/v1/object/public/marketing/${p}`;
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });
const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }); // YYYY-MM-DD, AEST
const compact = (n: number | null | undefined) =>
  n == null ? '–' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

const TYPE_LABELS: Record<string, string> = {
  weekly_slate: 'Upcoming this week',
  trending_chart: 'Trending top 10',
  watch_tonight: 'What to watch tonight',
  hidden_gem: 'Hidden gem',
  on_this_day: 'On this day',
  now_streaming: 'Now streaming',
  countdown: 'Countdown',
  trailer_drop: 'Trailer drop',
  conversation: 'Conversation',
};

// Decode topic_key + payload + refs into a one-line human reason this post exists.
const reason = (p: Row): string => {
  const title = p.tmdb_refs?.[0]?.title || p.payload?.title || p.payload?.topic?.title || '';
  switch (p.post_type) {
    case 'weekly_slate': return 'Monday slate — the week’s most-anticipated titles';
    case 'trending_chart': return 'Friday chart — this week’s trending top 10';
    case 'watch_tonight': return title ? `Trending & streamable now: ${title}` : 'What to watch tonight';
    case 'hidden_gem': return title ? `Highly-rated, lesser-seen: ${title}` : 'Hidden gem of the week';
    case 'on_this_day': return title ? `Anniversary: ${title}` : 'On this day in film/TV';
    case 'now_streaming': return title ? `Hits streaming today: ${title}` : 'New on streaming today';
    case 'countdown': {
      const m = String(p.topic_key || '').match(/:t(\d+):/);
      const n = m ? m[1] : (p.payload?.days ?? '');
      return title ? `T-${n} countdown to ${title}` : `Countdown (T-${n})`;
    }
    case 'trailer_drop': return title ? `New trailer dropped: ${title}` : 'New trailer';
    case 'conversation': return title ? `Conversation about ${title}` : 'Conversation starter';
    default: return p.post_type.replace(/_/g, ' ');
  }
};

const articleLink = (p: Row): string | null => {
  if (p.post_type === 'trending_chart') return `${SITE_URL}/whats-on/chart`;
  return p.slug ? `${SITE_URL}/whats-on/${p.slug}` : null;
};

const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';
const GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';

// Optional: kick the weekly-batch workflow so a regenerated post rebuilds now
// rather than waiting for the Saturday run. Needs a GH_DISPATCH_TOKEN secret
// (a PAT with Actions: write). Without it, regeneration waits for the next batch.
const triggerRegen = async (): Promise<boolean> => {
  if (!GH_TOKEN) return false;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/marketing-weekly-batch.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'plot-control-room',
        },
        body: JSON.stringify({ ref: 'main' }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  planned: { label: 'Queued', cls: 'b-wait' },
  needs_review: { label: 'Needs review', cls: 'b-review' },
  copy_ready: { label: 'Awaiting render', cls: 'b-wait' },
  generated: { label: 'Awaiting render', cls: 'b-wait' },
  approved: { label: 'Approved · will publish', cls: 'b-ok' },
  vetoed: { label: 'Rejected', cls: 'b-no' },
  published: { label: 'Published', cls: 'b-ok' },
  partially_published: { label: 'Partly published', cls: 'b-warn' },
  failed: { label: 'Failed', cls: 'b-no' },
};

const cookieToken = (req: Request) => {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith('admin_token='))?.slice('admin_token='.length);
  return raw ? decodeURIComponent(raw) : undefined;
};

const authed = (req: Request, url: URL) =>
  validSecret(url.searchParams.get('key')) || validSecret(cookieToken(req));

const shell = (body: string) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>PLOT control room</title>
<style>
  :root { --ink:#0c0c0c; --mut:#6b6b70; --line:#e5e3e0; --pink:#E05578; --teal:#0F6E56; --amber:#9a6a00; }
  * { box-sizing:border-box; } body { font-family:'DM Sans',system-ui,sans-serif; color:var(--ink); max-width:920px; margin:0 auto; padding:28px 18px 90px; }
  h1 { font-size:1.4rem; margin:0 0 4px; } .sub { color:var(--mut); font-size:.9rem; margin:0 0 18px; }
  a { color:var(--teal); }
  .bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; background:#faf9f7; border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom:24px; }
  .bar form { display:inline; } .bar .spacer { flex:1; }
  .da.head { font-size:.95rem; font-weight:700; margin:26px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  .post { border:1px solid var(--line); border-radius:14px; padding:18px; margin-bottom:18px; }
  .meta { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:4px; }
  .kind { font-weight:600; } .day { color:var(--mut); font-size:.85rem; }
  .why { color:var(--mut); font-size:.85rem; margin:0 0 12px; }
  .imgs img { height:140px; border-radius:8px; margin:0 8px 8px 0; vertical-align:top; }
  label { display:block; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--mut); margin:12px 0 4px; }
  textarea, input { width:100%; font:inherit; font-size:.92rem; border:1px solid var(--line); border-radius:8px; padding:9px; resize:vertical; }
  input[type=date] { width:auto; }
  .row { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; align-items:center; }
  button { font:inherit; font-weight:600; border:0; border-radius:9999px; padding:9px 18px; cursor:pointer; }
  .save { background:#f0efea; color:var(--ink); } .approve { background:var(--teal); color:#fff; }
  .reject { background:#fff; color:var(--pink); border:1px solid var(--pink); } .ghost { background:#fff; color:var(--mut); border:1px solid var(--line); }
  .pause { background:#fff; color:var(--amber); border:1px solid var(--amber); } .resume { background:var(--teal); color:#fff; }
  .badge { font-size:.7rem; font-weight:700; padding:3px 9px; border-radius:9999px; }
  .b-review { background:#fff4e5; color:var(--amber); } .b-ok { background:#eef7f0; color:var(--teal); }
  .b-no { background:#fdeef2; color:var(--pink); } .b-warn { background:#fff4e5; color:var(--amber); } .b-wait { background:#f0efea; color:var(--mut); }
  .pubs { font-size:.8rem; color:var(--mut); margin-top:10px; line-height:1.7; }
  .pubs b { color:var(--ink); font-weight:600; }
  .empty { color:var(--mut); padding:30px 0; } .flash { background:#eef7f0; color:var(--teal); padding:10px 14px; border-radius:8px; margin-bottom:18px; font-size:.9rem; }
  .flash.err { background:#fdeef2; color:var(--pink); }
  .hist { border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:10px; font-size:.88rem; display:flex; gap:12px; align-items:baseline; flex-wrap:wrap; }
  .paused-note { background:#fff4e5; color:var(--amber); border:1px solid #f0d8a8; padding:10px 14px; border-radius:8px; margin-bottom:18px; font-size:.9rem; font-weight:600; }
  .login { max-width:320px; margin-top:8px; } .login button { margin-top:14px; width:100%; }
</style></head><body>${body}</body></html>`;

// The sign-in page shown when there's no valid session cookie. Just a password
// box (the password is ADMIN_TOKEN); on success we set the cookie and the desk
// loads — no ?key= in the URL needed.
const loginPage = (error = false) => shell(
  `<h1>PLOT control room</h1><p class="sub">Sign in to review and publish.</p>
   <form class="login" method="POST" action="/api/admin">
     ${error ? '<div class="flash err">Incorrect password.</div>' : ''}
     <label>Password</label>
     <input type="password" name="password" autofocus autocomplete="current-password">
     <button class="approve" type="submit">Sign in</button>
   </form>`);

const field = (label: string, name: string, value: string, rows = 2) =>
  `<label>${label}</label><textarea name="${name}" rows="${rows}">${esc(value)}</textarea>`;

const badge = (status: string) => {
  const b = STATUS_BADGE[status] || { label: status, cls: 'b-wait' };
  return `<span class="badge ${b.cls}">${esc(b.label)}</span>`;
};

// Per-platform publish state line.
const pubLine = (pubs: Row[]) => {
  if (!pubs?.length) return '';
  const parts = pubs.map((p) => {
    const name = p.platform === 'x' ? 'X' : p.platform[0].toUpperCase() + p.platform.slice(1);
    if (p.status === 'published' && p.permalink) return `<b>${name}</b>: <a href="${esc(p.permalink)}">live ↗</a>`;
    if (p.status === 'failed') return `<b>${name}</b>: failed${p.error ? ` (${esc(String(p.error).slice(0, 60))})` : ''}`;
    return `<b>${name}</b>: ${esc(p.status)}`;
  });
  return `<div class="pubs">${parts.join(' &nbsp;·&nbsp; ')}</div>`;
};

const postForm = (p: Row, key: string) => {
  const c = p.copy || {};
  const media = (p.media || []) as { portrait_path?: string; landscape_path?: string }[];
  // Each thumbnail links to the full-size image (opens in a new tab).
  const imgs = media.map((m) => {
    const full = m.portrait_path || m.landscape_path;
    return full
      ? `<a href="${esc(mediaUrl(full))}" target="_blank" rel="noopener" title="Open full size"><img src="${esc(mediaUrl(full))}" alt=""></a>`
      : '';
  }).join('');
  const body = Array.isArray(c.page_body) ? c.page_body.join('\n\n') : (c.page_body || '');
  const tags = Array.isArray(c.hashtags) ? c.hashtags.join(', ') : '';
  const isConvo = p.post_type === 'conversation';
  const link = articleLink(p);
  const isVetoed = p.status === 'vetoed';
  const hasCopy = !!(c.x || c.instagram || c.threads || c.page_title);
  const showEdit = !isVetoed && hasCopy; // edit fields + Save/Approve/Regenerate
  return `<form class="post" method="POST" action="/api/admin">
    <input type="hidden" name="key" value="${esc(key)}">
    <input type="hidden" name="id" value="${esc(p.id)}">
    <div class="meta">
      <span class="kind">${esc(TYPE_LABELS[p.post_type] || p.post_type.replace(/_/g, ' '))}</span>
      <span class="day">${esc(fmtTime(p.scheduled_for))}</span>
      ${badge(p.status)}
      ${link ? `<a class="day" href="${esc(link)}" target="_blank">article ↗</a>` : ''}
    </div>
    <p class="why">${esc(reason(p))}${c.cta_variant && c.cta_variant !== 'none' ? ` · CTA: ${esc(c.cta_variant)}` : ''}</p>
    <div class="imgs">${imgs}</div>
    ${showEdit ? `
    ${field('X', 'x', c.x || '')}
    ${isConvo ? '' : field('Instagram', 'instagram', c.instagram || '', 3)}
    ${isConvo ? '' : field('Threads', 'threads', c.threads || '')}
    ${isConvo ? '' : `<label>Hashtags (comma separated)</label><input name="hashtags" value="${esc(tags)}">`}
    ${isConvo ? '' : field('Article title', 'page_title', c.page_title || '')}
    ${isConvo ? '' : field('Article body (blank line between paragraphs)', 'page_body', body, 8)}` : ''}
    ${(c.sources?.length)
      ? `<label>Sources used (article)</label><div class="pubs">${c.sources.map((s: Row) => `<a href="${esc(s.url)}">${esc(s.title)}</a>`).join(' &nbsp;·&nbsp; ')}</div>`
      : ''}
    ${pubLine(p.marketing_post_publications)}
    <div class="row">
      ${showEdit ? `<button class="save" name="action" value="save">Save edits</button>` : ''}
      ${p.status === 'approved'
        ? `<button class="ghost" name="action" value="unapprove">Unapprove</button>`
        : showEdit ? `<button class="approve" name="action" value="approve">Approve</button>` : ''}
      ${showEdit ? `<button class="ghost" name="action" value="regenerate">Regenerate</button>` : ''}
      ${!isVetoed ? `<button class="reject" name="action" value="reject">Reject</button>` : ''}
      ${isVetoed ? `<button class="ghost" name="action" value="unapprove">Restore to review</button>` : ''}
      <span style="flex:1"></span>
      ${!isVetoed ? `<input type="date" name="scheduled_date" value="${esc(dayKey(p.scheduled_for))}">
      <button class="ghost" name="action" value="reschedule">Reschedule</button>` : ''}
      ${p.status === 'approved' ? `<button class="ghost" name="action" value="publish_now">Publish now</button>` : ''}
      ${(p.marketing_post_publications || []).some((x: Row) => x.status === 'failed')
        ? `<button class="ghost" name="action" value="retry">Retry failed</button>` : ''}
    </div>
  </form>`;
};

const histLine = (p: Row, metrics: Map<string, { views: number; likes: number }>) => {
  const live = (p.marketing_post_publications || []).filter((x: Row) => x.permalink);
  const links = live.map((x: Row) => `<a href="${esc(x.permalink)}">${x.platform === 'x' ? 'X' : x.platform}</a>`).join(' · ');
  const agg = (p.marketing_post_publications || []).reduce(
    (acc: { views: number; likes: number }, x: Row) => {
      const m = metrics.get(x.id);
      if (m) { acc.views += m.views || 0; acc.likes += m.likes || 0; }
      return acc;
    }, { views: 0, likes: 0 });
  const stats = (agg.views || agg.likes) ? `<span class="day">👁 ${compact(agg.views)} · ♥ ${compact(agg.likes)}</span>` : '';
  return `<div class="hist">
    <span class="kind">${esc(TYPE_LABELS[p.post_type] || p.post_type.replace(/_/g, ' '))}</span>
    <span class="day">${esc(fmtDay(p.scheduled_for))}</span>
    ${badge(p.status)}
    ${links ? `<span class="day">${links}</span>` : ''}
    ${stats}
  </div>`;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Read the body once: it carries either the sign-in password or a desk action.
  const form = req.method === 'POST' ? await req.formData() : null;
  const submitted = form ? String(form.get('password') || '') : '';
  const passwordOk = validSecret(submitted);

  // No valid session → show the sign-in page (with an error if a wrong password
  // was just submitted). The ?key= shortcut still works for bookmarks.
  if (!authed(req, url) && !passwordOk) {
    return new Response(loginPage(!!form && form.has('password')),
      { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  // On a fresh sign-in (password or ?key=), persist the matched secret as the cookie.
  const sessionSecret = passwordOk ? submitted
    : (validSecret(url.searchParams.get('key')) ? url.searchParams.get('key')! : '');
  const setCookie = sessionSecret
    ? { 'set-cookie': `admin_token=${encodeURIComponent(sessionSecret)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` } : {};
  const now = () => new Date().toISOString();

  let flash = '';
  if (form && form.get('action')) {
    const id = String(form.get('id') || '');
    const action = String(form.get('action') || '');

    if (action === 'pause' || action === 'resume') {
      await supabase.from('marketing_settings')
        .update({ publishing_paused: action === 'pause', updated_at: now() }).eq('id', 1);
      flash = action === 'pause' ? 'Publishing paused — nothing will be sent until you resume.' : 'Publishing resumed.';
    } else if (action === 'approve_all') {
      const { data } = await supabase.from('marketing_posts')
        .update({ status: 'approved', updated_at: now() })
        .eq('status', 'needs_review').select('id');
      flash = `Approved the week — ${data?.length || 0} post(s) cleared to publish.`;
    } else if (id && action === 'reject') {
      await supabase.from('marketing_posts').update({ status: 'vetoed', updated_at: now() }).eq('id', id);
      await supabase.from('marketing_post_publications').update({ status: 'skipped' }).eq('post_id', id).eq('status', 'queued');
      flash = 'Rejected — it will not publish.';
    } else if (id && action === 'unapprove') {
      await supabase.from('marketing_posts').update({ status: 'needs_review', updated_at: now() }).eq('id', id);
      flash = 'Back in review.';
    } else if (id && action === 'reschedule') {
      const d = String(form.get('scheduled_date') || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        // Noon UTC renders as the same calendar date in AEST and is comfortably
        // before the 23:30 UTC publish run, so the post goes out on day `d`.
        await supabase.from('marketing_posts')
          .update({ scheduled_for: `${d}T12:00:00.000Z`, updated_at: now() }).eq('id', id);
        flash = `Rescheduled to ${d}.`;
      } else flash = 'Reschedule needs a valid date.';
    } else if (id && action === 'publish_now') {
      await supabase.from('marketing_posts')
        .update({ status: 'approved', scheduled_for: now(), updated_at: now() }).eq('id', id);
      flash = 'Marked to publish now — it goes out on the next publish run (or dispatch “Marketing — publish”).';
    } else if (id && action === 'retry') {
      await supabase.from('marketing_post_publications')
        .update({ status: 'queued', error: null }).eq('post_id', id).eq('status', 'failed');
      await supabase.from('marketing_posts').update({ status: 'approved', updated_at: now() }).eq('id', id);
      flash = 'Failed platforms re-queued — they retry on the next publish run.';
    } else if (id && action === 'regenerate') {
      // Send it back to the start of the pipeline so the copy worker rewrites it
      // (keep media/slug — the render overwrites them). It stays visible as "Queued".
      await supabase.from('marketing_posts')
        .update({ status: 'planned', copy: null, updated_at: now() }).eq('id', id);
      const triggered = await triggerRegen();
      flash = triggered
        ? 'Regenerating — the worker will rewrite this post. Refresh in a few minutes.'
        : 'Marked for regeneration — it rebuilds on the next weekly batch (or dispatch “Marketing — weekly batch”).';
    } else if (id) {
      const copyPatch: Record<string, unknown> = { x: String(form.get('x') || '') };
      if (form.has('instagram')) copyPatch.instagram = String(form.get('instagram') || '');
      if (form.has('threads')) copyPatch.threads = String(form.get('threads') || '');
      if (form.has('hashtags')) copyPatch.hashtags = String(form.get('hashtags') || '').split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
      if (form.has('page_title')) copyPatch.page_title = String(form.get('page_title') || '');
      if (form.has('page_body')) copyPatch.page_body = String(form.get('page_body') || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      const { data: cur } = await supabase.from('marketing_posts').select('copy').eq('id', id).single();
      const merged = { ...(cur?.copy || {}), ...copyPatch };
      const patch: Record<string, unknown> = { copy: merged, updated_at: now() };
      if (action === 'approve') patch.status = 'approved';
      await supabase.from('marketing_posts').update(patch).eq('id', id);
      flash = action === 'approve' ? 'Approved — it will publish on its day.' : 'Saved.';
    }
  }

  // Embed the authenticating secret in every form so actions stay authed even if
  // the session cookie doesn't survive the proxy. After a password sign-in the
  // cookie isn't in the request yet, so fall back to the just-submitted password.
  const key = url.searchParams.get('key') || cookieToken(req) || (passwordOk ? submitted : '');

  // Settings (pause switch).
  const { data: settings } = await supabase.from('marketing_settings').select('publishing_paused').limit(1).maybeSingle();
  const paused = !!settings?.publishing_paused;

  // The active week + their per-platform publication rows.
  const { data: posts } = await supabase
    .from('marketing_posts')
    .select('id, post_type, topic_key, scheduled_for, copy, media, slug, status, tmdb_refs, payload, marketing_post_publications(platform,status,permalink,error)')
    .in('status', ACTIVE)
    .order('scheduled_for');

  // Recent history (last 14 days) + a single latest-metric lookup per publication.
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: history } = await supabase
    .from('marketing_posts')
    .select('id, post_type, scheduled_for, status, marketing_post_publications(id,platform,status,permalink)')
    .in('status', HISTORY)
    .gte('scheduled_for', since)
    .order('scheduled_for', { ascending: false })
    .limit(20);

  const pubIds = (history || []).flatMap((p) => (p.marketing_post_publications || []).map((x: Row) => x.id));
  const metrics = new Map<string, { views: number; likes: number }>();
  if (pubIds.length) {
    const { data: rows } = await supabase
      .from('marketing_metrics')
      .select('publication_id, views, likes, metric_date')
      .in('publication_id', pubIds)
      .order('metric_date', { ascending: false });
    for (const r of rows || []) {
      if (!metrics.has(r.publication_id)) metrics.set(r.publication_id, { views: r.views || 0, likes: r.likes || 0 });
    }
  }

  const active = posts || [];
  const counts = {
    review: active.filter((p) => p.status === 'needs_review').length,
    approved: active.filter((p) => p.status === 'approved').length,
    rejected: active.filter((p) => p.status === 'vetoed').length,
  };

  // Group active posts by AEST day.
  const byDay = new Map<string, Row[]>();
  for (const p of active) {
    const k = dayKey(p.scheduled_for);
    (byDay.get(k) || byDay.set(k, []).get(k)!).push(p);
  }
  const dayBlocks = [...byDay.entries()].map(([, list]) =>
    `<div class="da head">${esc(fmtDay(list[0].scheduled_for))}</div>${list.map((p) => postForm(p, key)).join('')}`
  ).join('');

  const controls = `<div class="bar">
    <form method="POST" action="/api/admin"><input type="hidden" name="key" value="${esc(key)}">
      <button class="approve" name="action" value="approve_all"${counts.review ? '' : ' disabled style="opacity:.5"'}>Approve the week${counts.review ? ` (${counts.review})` : ''}</button>
    </form>
    <span class="spacer"></span>
    <form method="POST" action="/api/admin"><input type="hidden" name="key" value="${esc(key)}">
      <button class="${paused ? 'resume' : 'pause'}" name="action" value="${paused ? 'resume' : 'pause'}">${paused ? 'Resume publishing' : 'Pause all publishing'}</button>
    </form>
  </div>`;

  const list = active.length ? dayBlocks
    : '<p class="empty">Nothing in the pipeline. The Saturday weekly batch drops the next week’s posts here.</p>';

  const historyHtml = (history || []).length
    ? `<div class="da head">Recently published</div>${(history || []).map((p) => histLine(p, metrics)).join('')}`
    : '';

  const html = shell(
    `<h1>PLOT control room</h1>
     <p class="sub">${counts.review} awaiting review · ${counts.approved} approved · ${counts.rejected} rejected</p>
     ${paused ? '<div class="paused-note">Publishing is paused — approved posts will not be sent until you resume.</div>' : ''}
     ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
     ${controls}
     ${list}
     ${historyHtml}`);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...setCookie } });
});
