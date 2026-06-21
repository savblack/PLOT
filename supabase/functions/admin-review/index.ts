/**
 * admin-review — the marketing control room (served at admin.theplot.tv).
 *
 * A token-gated page that makes the whole weekly batch legible and controllable:
 *   • the upcoming week grouped by day; each post shows WHY it was planned, which
 *     platforms it targets, the cards (click to zoom), the copy (collapsible
 *     editor), the article link and its per-platform publish state;
 *   • a recent-history panel (what published where, with light metrics);
 *   • per-post actions: edit, Approve / Reject / Unapprove, Reschedule, Publish
 *     now, Regenerate, Retry; plus top-level Approve-the-week and a global Pause.
 *
 * Publish gate is approval-based: only status 'approved' posts are sent to Buffer
 * (by the daily push), on their scheduled day. Silence = never published.
 *
 * Server-rendered HTML, form POSTs back to itself. A tiny inline script adds the
 * lightbox / character counter / confirmations as progressive enhancement — the
 * page works fully without it. Auth: password (ADMIN_PASSWORD) or ?key= bookmark.
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
  upcoming: 'Upcoming this week',
  trending: 'Trending top 10',
  watch_tonight: 'What to watch tonight',
  hidden_gem: 'Hidden gem',
  on_this_day: 'On this day',
  now_streaming: 'Now streaming',
  countdown: 'Countdown',
  trailer: 'Trailer drop',
  question: 'Question',
};
const PLAT_LABEL: Record<string, string> = { x: 'X', instagram: 'Instagram', threads: 'Threads' };

// Decode topic_key + payload + refs into a one-line human reason this post exists.
const reason = (p: Row): string => {
  const title = p.tmdb_refs?.[0]?.title || p.payload?.title || p.payload?.topic?.title || '';
  switch (p.post_type) {
    case 'upcoming': return 'Monday slate — the week’s most-anticipated titles';
    case 'trending': return 'Friday chart — this week’s trending top 10';
    case 'watch_tonight': return title ? `Trending & streamable now: ${title}` : 'What to watch tonight';
    case 'hidden_gem': return title ? `Highly-rated, lesser-seen: ${title}` : 'Hidden gem of the week';
    case 'on_this_day': return title ? `Anniversary: ${title}` : 'On this day in film/TV';
    case 'now_streaming': return title ? `Hits streaming today: ${title}` : 'New on streaming today';
    case 'countdown': {
      const m = String(p.topic_key || '').match(/:t(\d+):/);
      const n = m ? m[1] : (p.payload?.days ?? '');
      return title ? `T-${n} countdown to ${title}` : `Countdown (T-${n})`;
    }
    case 'trailer': return title ? `New trailer dropped: ${title}` : 'New trailer';
    case 'question': return 'Generic audience question';
    default: return p.post_type.replace(/_/g, ' ');
  }
};

const articleLink = (p: Row): string | null => {
  if (p.post_type === 'trending') return `${SITE_URL}/whats-on/chart`;
  return p.slug ? `${SITE_URL}/whats-on/${p.slug}` : null;
};

// Which platforms this post targets (from its publication rows, else the default
// fan-out — conversations are text-only on X + Threads).
const platformsFor = (p: Row): string[] => {
  const pubs = (p.marketing_post_publications || []) as Row[];
  if (pubs.length) return [...new Set(pubs.map((x) => x.platform))];
  return p.post_type === 'question' ? ['x', 'threads'] : ['x', 'instagram', 'threads'];
};

const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';
const GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';

// Optional: dispatch a GitHub Actions workflow so an action takes effect now
// instead of waiting for its cron — Regenerate kicks the weekly batch, Publish
// now kicks the publish run. Needs a GH_DISPATCH_TOKEN secret (a PAT with
// Actions: write). Without it, the action just waits for the scheduled run.
const dispatchWorkflow = async (workflow: string): Promise<boolean> => {
  if (!GH_TOKEN) return false;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${workflow}/dispatches`,
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
  copy_ready: { label: 'Rendering…', cls: 'b-wait' },
  generated: { label: 'Rendering…', cls: 'b-wait' },
  approved: { label: 'Approved', cls: 'b-ok' },
  vetoed: { label: 'Rejected', cls: 'b-no' },
  published: { label: 'Published', cls: 'b-ok' },
  partially_published: { label: 'Partly published', cls: 'b-warn' },
  failed: { label: 'Failed', cls: 'b-no' },
};
// Status -> left-accent class on the card, so action-needed posts stand out.
const ACCENT: Record<string, string> = {
  needs_review: 'p-review', approved: 'p-ok', vetoed: 'p-no',
};

const cookieToken = (req: Request) => {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith('admin_token='))?.slice('admin_token='.length);
  return raw ? decodeURIComponent(raw) : undefined;
};

const authed = (req: Request, url: URL) =>
  validSecret(url.searchParams.get('key')) || validSecret(cookieToken(req));

const STYLE = `
  :root { --ink:#15140f; --mut:#76746c; --line:#e7e3dc; --soft:#f7f5f1; --pink:#c23d63; --teal:#0F6E56; --amber:#9a6a00; }
  * { box-sizing:border-box; } html { -webkit-text-size-adjust:100%; }
  body { font-family:'DM Sans',system-ui,-apple-system,sans-serif; color:var(--ink); background:#fbfaf8; max-width:860px; margin:0 auto; padding:0 16px 96px; line-height:1.45; }
  a { color:var(--teal); text-decoration:none; } a:hover { text-decoration:underline; }
  h1 { font-size:1.25rem; margin:0; font-weight:700; }
  .topbar { position:sticky; top:0; z-index:20; background:rgba(251,250,248,.92); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); padding:14px 0 12px; margin-bottom:22px; }
  .toprow { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .toprow .spacer { flex:1; }
  .stats { display:flex; gap:7px; flex-wrap:wrap; margin-top:8px; }
  .stat { font-size:.78rem; font-weight:600; padding:3px 10px; border-radius:9999px; background:var(--soft); color:var(--mut); }
  .stat.has-review { background:#fff2dd; color:var(--amber); }
  .flash { background:#eaf5ef; color:var(--teal); padding:11px 14px; border-radius:10px; margin-bottom:16px; font-size:.9rem; }
  .flash.err { background:#fbeaef; color:var(--pink); }
  .paused-note { background:#fff2dd; color:var(--amber); border:1px solid #f0d8a8; padding:11px 14px; border-radius:10px; margin-bottom:16px; font-size:.9rem; font-weight:600; }
  .dayhead { font-size:.8rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--mut); margin:30px 0 12px; }
  .post { background:#fff; border:1px solid var(--line); border-left:4px solid var(--line); border-radius:14px; padding:16px 18px; margin-bottom:14px; }
  .post.p-review { border-left-color:var(--amber); } .post.p-ok { border-left-color:var(--teal); } .post.p-no { border-left-color:var(--pink); opacity:.75; }
  .phead { display:flex; align-items:flex-start; gap:10px; }
  .ptitle { flex:1; min-width:0; } .kind { font-weight:700; font-size:1rem; } .when { color:var(--mut); font-size:.82rem; margin-left:8px; }
  .why { color:var(--mut); font-size:.85rem; margin:4px 0 0; }
  .targets { font-size:.8rem; color:var(--mut); margin:10px 0 0; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .chip { font-size:.72rem; font-weight:600; padding:2px 8px; border-radius:6px; background:var(--soft); color:#56544d; }
  .thumbs { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 4px; }
  .thumbs img { height:128px; width:auto; border-radius:8px; border:1px solid var(--line); cursor:zoom-in; display:block; }
  .preview { font-size:.9rem; background:var(--soft); border-radius:9px; padding:10px 12px; margin:12px 0 0; white-space:pre-wrap; }
  details.edit, details.src { margin-top:12px; } details.edit > summary, details.src > summary { cursor:pointer; font-size:.8rem; font-weight:600; color:var(--teal); list-style:none; }
  details > summary::-webkit-details-marker { display:none; } details > summary::before { content:'▸ '; } details[open] > summary::before { content:'▾ '; }
  label { display:block; font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; color:var(--mut); margin:12px 0 4px; }
  .cc { float:right; font-weight:600; letter-spacing:0; text-transform:none; color:var(--mut); } .cc.over { color:var(--pink); }
  textarea, input { width:100%; font:inherit; font-size:.92rem; border:1px solid var(--line); border-radius:9px; padding:9px 10px; background:#fff; resize:vertical; }
  textarea:focus, input:focus { outline:none; border-color:var(--teal); box-shadow:0 0 0 3px rgba(15,110,86,.12); }
  input[type=date] { width:auto; }
  .pubs { font-size:.8rem; color:var(--mut); margin-top:12px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .pchip { padding:2px 9px; border-radius:6px; font-weight:600; font-size:.74rem; }
  .pchip.ok { background:#eaf5ef; color:var(--teal); } .pchip.no { background:#fbeaef; color:var(--pink); } .pchip.wait { background:var(--soft); color:#56544d; }
  .actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; align-items:center; padding-top:14px; border-top:1px solid var(--line); }
  .actions .spacer { flex:1; }
  button { font:inherit; font-size:.85rem; font-weight:600; border:0; border-radius:9999px; padding:9px 16px; cursor:pointer; transition:filter .12s; }
  button:hover { filter:brightness(.96); }
  .approve { background:var(--teal); color:#fff; } .save { background:var(--ink); color:#fff; }
  .ghost { background:#fff; color:#56544d; border:1px solid var(--line); } .danger { background:#fff; color:var(--pink); border:1px solid #e7b9c6; }
  .pause { background:#fff; color:var(--amber); border:1px solid #e7cf9a; } .resume { background:var(--teal); color:#fff; }
  button[disabled] { opacity:.45; cursor:default; }
  .resched { display:inline-flex; gap:6px; align-items:center; }
  .badge { font-size:.7rem; font-weight:700; padding:4px 10px; border-radius:9999px; white-space:nowrap; }
  .b-review { background:#fff2dd; color:var(--amber); } .b-ok { background:#eaf5ef; color:var(--teal); }
  .b-no { background:#fbeaef; color:var(--pink); } .b-warn { background:#fff2dd; color:var(--amber); } .b-wait { background:var(--soft); color:#56544d; }
  .empty { color:var(--mut); padding:34px 0; text-align:center; }
  .hist { background:#fff; border:1px solid var(--line); border-radius:10px; padding:11px 14px; margin-bottom:9px; font-size:.85rem; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .hist .spacer { flex:1; }
  .small { font-size:.8rem; color:var(--mut); }
  .login { max-width:320px; margin:60px auto 0; } .login button { margin-top:14px; width:100%; }
  #lightbox { position:fixed; inset:0; z-index:50; background:rgba(20,18,14,.86); display:none; align-items:center; justify-content:center; padding:24px; cursor:zoom-out; }
  #lightbox.on { display:flex; } #lightbox img { max-width:100%; max-height:100%; border-radius:10px; }
  .tabs { display:flex; gap:6px; margin-top:11px; flex-wrap:wrap; }
  .tab { font:inherit; font-size:.76rem; font-weight:600; padding:5px 12px; border-radius:9999px; background:var(--soft); color:var(--mut); border:0; cursor:pointer; }
  .tab.on { background:var(--ink); color:#fff; }
  @keyframes hi { 0%{ background:#fff7e3; } 100%{ background:#fff; } }
  .post.hi { animation:hi 2.4s ease-out; }
  @media (max-width:560px) {
    body { padding:0 12px 80px; }
    h1 { font-size:1.1rem; } .when { display:block; margin:2px 0 0; }
    .actions, .toprow { gap:6px; } button { padding:9px 13px; }
    .resched, .resched input { width:auto; }
  }
`;

const SCRIPT = `
(function(){
  document.querySelectorAll('textarea[data-max]').forEach(function(t){
    var max=+t.getAttribute('data-max'); var out=t.closest('.field')&&t.closest('.field').querySelector('.cc'); if(!out)return;
    function upd(){ var n=t.value.length; out.textContent=n+'/'+max; out.classList.toggle('over', n>max); }
    t.addEventListener('input',upd); upd();
  });
  var lb=document.getElementById('lightbox'), img=lb&&lb.querySelector('img');
  if(lb){
    document.querySelectorAll('img.lb').forEach(function(t){
      t.addEventListener('click',function(){ img.src=t.getAttribute('data-full')||t.src; lb.classList.add('on'); });
    });
    lb.addEventListener('click',function(){ lb.classList.remove('on'); img.src=''; });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ lb.classList.remove('on'); img.src=''; } });
  }
  // Filter tabs: show only posts in the chosen state, and hide day sections that
  // end up empty. Pure display toggling — no reload, degrades to "show all".
  var tabs=[].slice.call(document.querySelectorAll('.tab'));
  function filter(show){
    document.querySelectorAll('.post').forEach(function(p){
      var s=p.getAttribute('data-status');
      var ok = show==='all' || (show==='review'&&s==='needs_review') || (show==='approved'&&s==='approved') || (show==='rejected'&&s==='vetoed');
      p.style.display = ok ? '' : 'none';
    });
    document.querySelectorAll('section.day').forEach(function(sec){
      var vis=[].some.call(sec.querySelectorAll('.post'), function(p){ return p.style.display!=='none'; });
      sec.style.display = vis ? '' : 'none';
    });
    tabs.forEach(function(t){ t.classList.toggle('on', t.getAttribute('data-show')===show); });
  }
  tabs.forEach(function(t){ t.addEventListener('click', function(){ filter(t.getAttribute('data-show')); }); });
  // Jump back to the post you just acted on (the page reloads to the top on POST).
  var acted=document.getElementById('acted');
  if(acted){ var el=document.getElementById(acted.getAttribute('data-target')); if(el){ el.scrollIntoView({block:'center'}); el.classList.add('hi'); } }
})();
`;

const shell = (body: string) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>PLOT control room</title>
<style>${STYLE}</style></head><body>${body}<div id="lightbox"><img alt="full size card"></div><script>${SCRIPT}</script></body></html>`;

// The sign-in page shown when there's no valid session. The password is
// ADMIN_PASSWORD (or the ADMIN_TOKEN); on success we set a 30-day cookie.
const loginPage = (error = false) => shell(
  `<div class="login"><h1>PLOT control room</h1><p class="small" style="margin:6px 0 0">Sign in to review and publish.</p>
   <form method="POST" action="/api/admin">
     ${error ? '<div class="flash err" style="margin-top:14px">Incorrect password.</div>' : ''}
     <label>Password</label>
     <input type="password" name="password" autofocus autocomplete="current-password">
     <button class="approve" type="submit">Sign in</button>
   </form></div>`);

const field = (label: string, name: string, value: string, rows = 2) =>
  `<div class="field"><label>${label}</label><textarea name="${name}" rows="${rows}">${esc(value)}</textarea></div>`;

const badge = (status: string) => {
  const b = STATUS_BADGE[status] || { label: status, cls: 'b-wait' };
  return `<span class="badge ${b.cls}">${esc(b.label)}</span>`;
};

// Per-platform publish state as chips (only meaningful once there are rows that
// have actually been attempted/sent).
const pubChips = (pubs: Row[]) => {
  const shown = (pubs || []).filter((p) => p.status !== 'queued');
  if (!shown.length) return '';
  const chips = shown.map((p) => {
    const name = PLAT_LABEL[p.platform] || p.platform;
    if (p.status === 'published') {
      return p.permalink
        ? `<a class="pchip ok" href="${esc(p.permalink)}" target="_blank">${name} live ↗</a>`
        : `<span class="pchip ok">${name} published</span>`;
    }
    if (p.status === 'failed') return `<span class="pchip no" title="${esc(p.error || '')}">${name} failed</span>`;
    return `<span class="pchip wait">${name} ${esc(p.status)}</span>`;
  }).join('');
  return `<div class="pubs">${chips}</div>`;
};

const confirm = (msg: string) => ` onclick="return confirm('${msg.replace(/'/g, '')}')"`;

const postForm = (p: Row, key: string) => {
  const c = p.copy || {};
  const media = (p.media || []) as { portrait_path?: string; landscape_path?: string }[];
  const imgs = media.map((m) => {
    const full = m.portrait_path || m.landscape_path;
    return full ? `<img class="lb" src="${esc(mediaUrl(full))}" data-full="${esc(mediaUrl(full))}" alt="${esc(c.alt_text || '')}" loading="lazy">` : '';
  }).join('');
  const body = Array.isArray(c.page_body) ? c.page_body.join('\n\n') : (c.page_body || '');
  const tags = Array.isArray(c.hashtags) ? c.hashtags.join(', ') : '';
  const isConvo = p.post_type === 'question';
  const link = articleLink(p);
  const isVetoed = p.status === 'vetoed';
  const hasCopy = !!(c.x || c.instagram || c.threads || c.page_title);
  const showEdit = !isVetoed && hasCopy;
  const hasFailed = (p.marketing_post_publications || []).some((x: Row) => x.status === 'failed');
  const plats = platformsFor(p).map((s) => `<span class="chip">${PLAT_LABEL[s] || s}</span>`).join('');
  const preview = c.x || c.instagram || c.threads || '';
  return `<form id="p-${esc(p.id)}" data-status="${esc(p.status)}" class="post ${ACCENT[p.status] || 'p-wait'}" method="POST" action="/api/admin">
    <input type="hidden" name="key" value="${esc(key)}">
    <input type="hidden" name="id" value="${esc(p.id)}">
    <div class="phead">
      <div class="ptitle">
        <span class="kind">${esc(TYPE_LABELS[p.post_type] || p.post_type.replace(/_/g, ' '))}</span>
        <span class="when">${esc(fmtTime(p.scheduled_for))}</span>
        <p class="why">${esc(reason(p))}${c.cta_variant && c.cta_variant !== 'none' ? ` · CTA: ${esc(c.cta_variant)}` : ''}</p>
      </div>
      ${badge(p.status)}
    </div>
    <div class="targets">${isVetoed ? '<span>Won’t publish</span>' : `Publishes to ${plats}`}${link ? ` <span class="spacer"></span><a href="${esc(link)}" target="_blank">article ↗</a>` : ''}</div>
    ${imgs ? `<div class="thumbs">${imgs}</div>` : ''}
    ${preview && !showEdit ? `<div class="preview">${esc(preview)}</div>` : ''}
    ${showEdit ? `<details class="edit"${p.status === 'needs_review' ? ' open' : ''}><summary>Edit copy</summary>
      <div class="field"><label>X <span class="cc"></span></label><textarea name="x" rows="2" data-max="280">${esc(c.x || '')}</textarea></div>
      ${isConvo ? '' : `<div class="field"><label>Instagram <span class="cc"></span></label><textarea name="instagram" rows="3" data-max="2200">${esc(c.instagram || '')}</textarea></div>`}
      ${isConvo ? '' : `<div class="field"><label>Threads <span class="cc"></span></label><textarea name="threads" rows="2" data-max="500">${esc(c.threads || '')}</textarea></div>`}
      ${isConvo ? '' : `<div class="field"><label>Hashtags (comma separated)</label><input name="hashtags" value="${esc(tags)}"></div>`}
      ${isConvo ? '' : field('Article title', 'page_title', c.page_title || '')}
      ${isConvo ? '' : field('Article body (blank line between paragraphs)', 'page_body', body, 8)}
    </details>` : ''}
    ${(c.sources?.length)
      ? `<details class="src"><summary>Sources (${c.sources.length})</summary><div class="pubs">${c.sources.map((s: Row) => `<a href="${esc(s.url)}" target="_blank">${esc(s.title)}</a>`).join(' · ')}</div></details>`
      : ''}
    ${pubChips(p.marketing_post_publications)}
    <div class="actions">
      ${p.status === 'approved'
        ? `<button class="ghost" name="action" value="unapprove">Unapprove</button>`
        : showEdit ? `<button class="approve" name="action" value="approve">Approve</button>` : ''}
      ${showEdit ? `<button class="save" name="action" value="save">Save</button>` : ''}
      ${showEdit ? `<button class="ghost" name="action" value="publish_now"${confirm('Publish now? It goes straight to your socials.')}>Publish now</button>` : ''}
      ${showEdit ? `<button class="ghost" name="action" value="regenerate"${confirm('Regenerate? This replaces the current copy with a fresh version.')}>Regenerate</button>` : ''}
      ${hasFailed ? `<button class="ghost" name="action" value="retry">Retry failed</button>` : ''}
      <span class="spacer"></span>
      ${!isVetoed ? `<span class="resched"><input type="date" name="scheduled_date" value="${esc(dayKey(p.scheduled_for))}"><button class="ghost" name="action" value="reschedule">Reschedule</button></span>` : ''}
      ${isVetoed
        ? `<button class="ghost" name="action" value="unapprove">Restore</button>`
        : `<button class="danger" name="action" value="reject"${confirm('Reject this post? It will not publish.')}>Reject</button>`}
    </div>
  </form>`;
};

const histLine = (p: Row, metrics: Map<string, { views: number; likes: number }>) => {
  const live = (p.marketing_post_publications || []).filter((x: Row) => x.permalink);
  const links = live.map((x: Row) => `<a href="${esc(x.permalink)}" target="_blank">${PLAT_LABEL[x.platform] || x.platform}</a>`).join(' · ');
  const agg = (p.marketing_post_publications || []).reduce(
    (acc: { views: number; likes: number }, x: Row) => {
      const m = metrics.get(x.id);
      if (m) { acc.views += m.views || 0; acc.likes += m.likes || 0; }
      return acc;
    }, { views: 0, likes: 0 });
  const stats = (agg.views || agg.likes) ? `<span class="small">👁 ${compact(agg.views)} · ♥ ${compact(agg.likes)}</span>` : '';
  return `<div class="hist">
    <span style="font-weight:600">${esc(TYPE_LABELS[p.post_type] || p.post_type.replace(/_/g, ' '))}</span>
    <span class="small">${esc(fmtDay(p.scheduled_for))}</span>
    ${badge(p.status)}
    <span class="spacer"></span>
    ${links ? `<span class="small">${links}</span>` : ''}
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
  // Re-arm a post's publication rows so the publisher will actually send them.
  // Rejecting a post sets its rows to 'skipped'; re-approving must reset them to
  // 'queued' (the publisher only sends 'queued'), or it silently does nothing.
  const requeuePubs = (ids: string[]) =>
    supabase.from('marketing_post_publications')
      .update({ status: 'queued', error: null })
      .in('post_id', ids).in('status', ['skipped', 'failed']);

  let flash = '';
  let acted = ''; // the post just acted on — we scroll back to it after the reload
  if (form && form.get('action')) {
    const id = String(form.get('id') || '');
    const action = String(form.get('action') || '');
    if (id) acted = id;

    if (action === 'pause' || action === 'resume') {
      await supabase.from('marketing_settings')
        .update({ publishing_paused: action === 'pause', updated_at: now() }).eq('id', 1);
      flash = action === 'pause' ? 'Publishing paused — nothing will be sent until you resume.' : 'Publishing resumed.';
    } else if (action === 'approve_all') {
      const { data } = await supabase.from('marketing_posts')
        .update({ status: 'approved', updated_at: now() })
        .eq('status', 'needs_review').select('id');
      const ids = (data || []).map((d) => d.id);
      if (ids.length) await requeuePubs(ids);
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
      // Approve + bring the schedule forward so the publisher will pick it up,
      // then kick the publish run so it sends within minutes (if a token is set).
      await supabase.from('marketing_posts')
        .update({ status: 'approved', scheduled_for: now(), updated_at: now() }).eq('id', id);
      await requeuePubs([id]);
      const triggered = await dispatchWorkflow('marketing-publish.yml');
      flash = triggered
        ? 'Publishing now — sending approved copy to X / Instagram / Threads; it’ll show as published in a few minutes.'
        : 'Approved and queued — it sends on the next publish run. Set GH_DISPATCH_TOKEN for instant send, or dispatch “Marketing — publish”.';
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
      const triggered = await dispatchWorkflow('marketing-weekly-batch.yml');
      flash = triggered
        ? 'Regenerating — the Codex weekly worker will rewrite this post. Refresh in a few minutes.'
        : 'Marked for regeneration — it rebuilds on the next weekly batch.';
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
      if (action === 'approve') await requeuePubs([id]);
      flash = action === 'approve' ? 'Approved — it will publish on its day.' : 'Saved.';
    }
  }

  // Embed the authenticating secret in every form so actions stay authed even if
  // the session cookie doesn't survive the proxy. After a password sign-in the
  // cookie isn't in the request yet, so fall back to the just-submitted password.
  const key = url.searchParams.get('key') || cookieToken(req) || (passwordOk ? submitted : '');

  const { data: settings } = await supabase.from('marketing_settings').select('publishing_paused').limit(1).maybeSingle();
  const paused = !!settings?.publishing_paused;

  const { data: posts } = await supabase
    .from('marketing_posts')
    .select('id, post_type, topic_key, scheduled_for, copy, media, slug, status, tmdb_refs, payload, marketing_post_publications(platform,status,permalink,error)')
    .in('status', ACTIVE)
    .order('scheduled_for');

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
    `<section class="day"><div class="dayhead">${esc(fmtDay(list[0].scheduled_for))}</div>${list.map((p) => postForm(p, key)).join('')}</section>`
  ).join('');

  const keyInput = `<input type="hidden" name="key" value="${esc(key)}">`;
  const topbar = `<div class="topbar">
    <div class="toprow">
      <h1>PLOT control room</h1>
      <span class="spacer"></span>
      <form method="POST" action="/api/admin">${keyInput}
        <button class="approve" name="action" value="approve_all"${counts.review ? confirm(`Approve all ${counts.review} posts awaiting review?`) : ' disabled'}>Approve week${counts.review ? ` (${counts.review})` : ''}</button>
      </form>
      <form method="POST" action="/api/admin">${keyInput}
        <button class="${paused ? 'resume' : 'pause'}" name="action" value="${paused ? 'resume' : 'pause'}"${paused ? '' : confirm('Pause all publishing? Approved posts will not be sent until you resume.')}>${paused ? 'Resume' : 'Pause'}</button>
      </form>
    </div>
    <div class="tabs">
      <button type="button" class="tab on" data-show="all">All ${active.length}</button>
      <button type="button" class="tab" data-show="review">Needs review ${counts.review}</button>
      <button type="button" class="tab" data-show="approved">Approved ${counts.approved}</button>
      <button type="button" class="tab" data-show="rejected">Rejected ${counts.rejected}</button>
    </div>
  </div>`;

  const list = active.length ? dayBlocks
    : '<p class="empty">Nothing in the pipeline yet.<br>The Saturday weekly batch drops the next week’s posts here.</p>';

  const historyHtml = (history || []).length
    ? `<div class="dayhead">Recently published</div>${(history || []).map((p) => histLine(p, metrics)).join('')}`
    : '';

  const html = shell(
    `${topbar}
     ${paused ? '<div class="paused-note">⏸ Publishing is paused — approved posts will not be sent until you resume.</div>' : ''}
     ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
     ${acted ? `<span id="acted" data-target="p-${esc(acted)}"></span>` : ''}
     ${list}
     ${historyHtml}`);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...setCookie } });
});
