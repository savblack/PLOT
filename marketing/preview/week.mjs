// Weekly review sheet: one readable HTML page with every active post's full copy
// (X / Instagram / Threads / article), its card images, and the rendered
// subscriber newsletter embedded at the bottom. Read-only — pulls live state via
// the Supabase REST API and the newsletter builder. Used by the /marketing-week
// skill as the preview surface. Run from a checkout on `main`:
//   node --env-file=.env marketing/preview/week.mjs   ->  marketing/preview/out/week.html
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const SB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env)'); process.exit(1); }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Newsletter HTML (dry-run build) -> out/newsletter.html, embedded via iframe.
// execFileSync (no shell) with a fixed command — no injection surface.
let nlOk = true;
try {
  const nl = execFileSync('node', ['marketing/newsletter/send-digest.mjs'], {
    cwd: ROOT, env: { ...process.env, DRY_RUN: '1' }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  writeFileSync(join(OUT, 'newsletter.html'), nl);
} catch { nlOk = false; }

const TL = { weekly_slate: 'Upcoming this week', trending_chart: 'Trending top 10', watch_tonight: 'What to watch tonight', hidden_gem: 'Hidden gem', on_this_day: 'On this day', now_streaming: 'Now streaming', countdown: 'Countdown', trailer_drop: 'Trailer drop', conversation: 'Conversation' };
const BADGE = { planned: ['Queued', '#6b6b70', '#f1efe8'], needs_review: ['Needs review', '#9a6a00', '#fff2dd'], copy_ready: ['Rendering', '#6b6b70', '#f1efe8'], generated: ['Rendering', '#6b6b70', '#f1efe8'], approved: ['Approved', '#0F6E56', '#eaf5ef'], vetoed: ['Rejected', '#c23d63', '#fbeaef'], published: ['Published', '#0F6E56', '#eaf5ef'] };
const day = (iso) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
const time = (iso) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });
const dkey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const title = (p) => p.tmdb_refs?.[0]?.title || p.payload?.title || p.payload?.topic?.title || '';
const field = (l, v) => (v ? `<div class=f><div class=l>${esc(l)}</div><div class=v>${esc(v)}</div></div>` : '');
const img = (m) => (m.portrait_path ? `<a href="${SB}/storage/v1/object/public/marketing/${m.portrait_path}" target=_blank><img src="${SB}/storage/v1/object/public/marketing/${m.portrait_path}" loading=lazy></a>` : '');

const sel = 'id,post_type,scheduled_for,status,slug,copy,media,payload,tmdb_refs,topic_key,marketing_post_publications(platform,status,permalink)';
const res = await fetch(`${SB}/rest/v1/marketing_posts?status=in.(planned,needs_review,copy_ready,generated,approved,vetoed)&select=${sel}&order=scheduled_for`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const rows = await res.json();

const post = (p) => {
  const c = p.copy || {};
  const b = BADGE[p.status] || ['?', '#000', '#eee'];
  const body = Array.isArray(c.page_body) ? c.page_body.join('\n\n') : (c.page_body || '');
  const tags = (c.hashtags || []).map((t) => '#' + t).join(' ');
  const pubs = (p.marketing_post_publications || []).map((x) => `${x.platform}: ${x.status}${x.permalink ? ` (<a href="${esc(x.permalink)}" target=_blank>link</a>)` : ''}`).join(' · ');
  const imgs = (p.media || []).some((m) => m.portrait_path) ? `<div class=imgs>${(p.media || []).map(img).join('')}</div>` : '';
  return `<div class=post>
    <div class=ph><span class=kind>${esc(TL[p.post_type] || p.post_type)}</span><span class=meta>${esc(time(p.scheduled_for))}</span><span class=badge style="color:${b[1]};background:${b[2]}">${b[0]}</span>${title(p) ? `<span class=meta>${esc(title(p))}</span>` : ''}</div>
    ${imgs}
    ${field('X', c.x)}${field('Instagram', c.instagram)}${tags ? field('Hashtags', tags) : ''}${field('Threads', c.threads)}${field('Article title', c.page_title)}${body ? `<div class=f><div class=l>Article body</div><div class="v art">${esc(body)}</div></div>` : ''}${c.cta_variant && c.cta_variant !== 'none' ? field('CTA', c.cta_variant) : ''}${pubs ? `<div class=f><div class=l>Publish status</div><div class=v>${pubs}</div></div>` : ''}
  </div>`;
};

const byday = {};
for (const p of rows) (byday[dkey(p.scheduled_for)] = byday[dkey(p.scheduled_for)] || []).push(p);
const days = Object.keys(byday).sort().map((d) => `<h2>${esc(day(byday[d][0].scheduled_for))}</h2>${byday[d].map(post).join('')}`).join('');
const n = (s) => rows.filter((p) => p.status === s).length;

const html = `<!doctype html><meta charset=utf-8><title>PLOT — week review</title><style>
body{font-family:'DM Sans',system-ui,sans-serif;color:#15140f;max-width:760px;margin:0 auto;padding:24px 18px 80px;background:#fbfaf8}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:#76746c;margin:30px 0 12px;border-bottom:1px solid #e7e3dc;padding-bottom:6px}
.sub{color:#76746c;margin:0 0 8px}
.post{background:#fff;border:1px solid #e7e3dc;border-radius:14px;padding:16px 18px;margin-bottom:14px}
.ph{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.kind{font-weight:700}.meta{color:#76746c;font-size:.85rem}
.badge{font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:9999px}
.imgs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.imgs img{height:170px;border-radius:8px;border:1px solid #e7e3dc;cursor:zoom-in}
.f{margin:10px 0}.l{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#76746c;margin-bottom:3px}
.v{font-size:.95rem;line-height:1.55;white-space:pre-wrap;background:#f7f5f1;border-radius:8px;padding:9px 11px}
.art{background:#fff;border:1px solid #eee;font-size:.9rem}
iframe{width:100%;height:760px;border:1px solid #e7e3dc;border-radius:12px;background:#fff}
a{color:#0F6E56}
</style>
<h1>PLOT — week review</h1>
<p class=sub>${rows.length} posts · ${n('needs_review')} need review · ${n('approved')} approved · ${n('vetoed')} rejected</p>
${days || '<p class=sub>Nothing in the pipeline yet.</p>'}
<h2>Subscriber newsletter</h2>
${nlOk ? '<iframe src="newsletter.html"></iframe>' : '<p class=sub>Newsletter preview unavailable (run from a checkout on main).</p>'}`;
writeFileSync(join(OUT, 'week.html'), html);
console.log(`Wrote ${join(OUT, 'week.html')} (${rows.length} posts). Open it in a browser.`);
