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
 * page works fully without it. Auth: password (ADMIN_PASSWORD or ADMIN_TOKEN),
 * checked in constant time; a derived, non-reversible token is then stored in an
 * HttpOnly session cookie. Sign-ins are throttled per IP against brute force.
 *
 * Visual design follows PLOT's real cross-platform tokens (packages/core/tokens.js)
 * rather than an ad hoc palette — see the :root / .deck token blocks below.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../_shared/database.types.ts';

// Db is the *default* instantiation
// (SupabaseClient<unknown, …, never, never>), so every row came back `never` and
// the real client was not even assignable to it. Bind it to the schema instead.
type Db = SupabaseClient<Database>;

// A jsonb column arrives as Json, which includes strings and arrays; only the
// object case is a copy record. Anything else is treated as absent.
function jsonObject(value: Json | null | undefined): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
import { serviceKey } from '../_shared/serviceKey.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = serviceKey();
const ADMIN_TOKEN = Deno.env.get('ADMIN_TOKEN') ?? '';
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') ?? '';
// Either secret signs you in: the friendly ADMIN_PASSWORD (typed on the login
// page) or the original ADMIN_TOKEN. Both are compared in constant time.
const SECRETS = [ADMIN_PASSWORD, ADMIN_TOKEN].filter((s) => s.length > 0);

// Constant-time compare — avoids leaking the secret via response timing.
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}
const matchesSecret = (s: string | null | undefined): boolean =>
  !!s && SECRETS.some((secret) => timingSafeEqual(s, secret));

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// The session cookie holds THIS derived token, never the raw password — a leaked
// cookie can't be replayed as the master secret elsewhere, and rotating
// ADMIN_PASSWORD / ADMIN_TOKEN invalidates every existing session.
const SESSION_TOKEN = await sha256Hex(`plot-admin-review::v1::${ADMIN_PASSWORD}::${ADMIN_TOKEN}`);

// Brute-force throttle on sign-ins, keyed by client IP. Persisted in
// `auth_fail_attempts` (not an in-isolate Map) so it holds across Deno
// isolate cycles and requests spread across isolates. A successful sign-in
// clears the row.
const LOGIN_SCOPE = 'admin-review-login';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;
const clientIp = (req: Request): string =>
  req.headers.get('cf-connecting-ip') || 'unknown';
// deno-lint-ignore no-explicit-any
async function loginBlocked(supabase: any, ip: string): Promise<boolean> {
  const { data } = await supabase
    .from('auth_fail_attempts')
    .select('fail_count, window_start')
    .eq('scope', LOGIN_SCOPE)
    .eq('ip', ip)
    .maybeSingle();
  if (!data) return false;
  if (Date.now() - new Date(data.window_start).getTime() > LOGIN_WINDOW_MS) return false;
  return data.fail_count >= LOGIN_MAX_FAILS;
}
// deno-lint-ignore no-explicit-any
async function noteLoginFail(supabase: any, ip: string): Promise<void> {
  await supabase.rpc('auth_note_fail', { p_scope: LOGIN_SCOPE, p_ip: ip, p_window_ms: LOGIN_WINDOW_MS });
}
// deno-lint-ignore no-explicit-any
async function clearLoginFails(supabase: any, ip: string): Promise<void> {
  await supabase.from('auth_fail_attempts').delete().eq('scope', LOGIN_SCOPE).eq('ip', ip);
}
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
// Add `days` calendar days to an AEST day-key, returning the new day-key —
// used to build the Monday-anchored week strip without pulling in a date lib.
const addDaysToKey = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12)); // noon UTC avoids DST/rounding edge cases
  return dayKey(dt.toISOString());
};

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
  guide: 'SEO guide',
};
const PLAT_LABEL: Record<string, string> = { x: 'X', instagram: 'Instagram', threads: 'Threads' };

// One small line-icon per post type, so the week's variety is legible at a
// glance and not just from the label text. Same 24x24 viewBox throughout.
const TYPE_ICON: Record<string, string> = {
  upcoming: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18M8 5v4M16 5v4" stroke="currentColor" stroke-width="1.8"/>',
  trending: '<path d="M4 20V10M9 20V6M14 20v-9M19 20V4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  watch_tonight: '<rect x="3" y="4" width="18" height="13" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M9 20h6M12 17v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  hidden_gem: '<path d="M12 3l2.6 5.6 6 .7-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.2 6-.7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  on_this_day: '<rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/>',
  now_streaming: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/>',
  countdown: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  trailer: '<path d="M5 4l14 8-14 8V4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  question: '<path d="M8 9h.01M12 9h.01M16 9h.01M6 4h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 3v-3H6a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  guide: '<path d="M6 3h9l3 3v15H6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
};
const typeIcon = (postType: string) =>
  `<svg viewBox="0 0 24 24" fill="none">${TYPE_ICON[postType] || TYPE_ICON.upcoming}</svg>`;

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
    case 'guide': return p.copy?.page_title ? `Long-form guide: ${p.copy.page_title}` : 'Long-form SEO guide';
    default: return p.post_type.replace(/_/g, ' ');
  }
};

const articleLink = (p: Row): string | null => {
  if (p.post_type === 'trending') return `${SITE_URL}/whats-on/chart`;
  return p.slug ? `${SITE_URL}/whats-on/${p.slug}` : null;
};
const articleLinkLabel = (p: Row): string => (p.post_type === 'trending' ? 'chart ↗' : 'article ↗');

// Which platforms this post targets (from its publication rows, else the default
// fan-out — conversations are text-only on X + Threads; guides are web-only
// articles and never get publication rows at all).
const platformsFor = (p: Row): string[] => {
  const pubs = (p.marketing_post_publications || []) as Row[];
  if (pubs.length) return [...new Set(pubs.map((x) => x.platform))];
  if (p.post_type === 'guide') return [];
  return p.post_type === 'question' ? ['x', 'threads'] : ['x', 'instagram', 'threads'];
};

const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';
const GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';

// Optional: dispatch a GitHub Actions workflow so an action takes effect now
// instead of waiting for its cron — Regenerate kicks the weekly batch, Publish
// now kicks the publish run. Needs a GH_DISPATCH_TOKEN secret (a PAT with
// Actions: write). Without it, the action just waits for the scheduled run.
const dispatchWorkflow = async (workflow: string): Promise<{ ok: boolean; reason?: string }> => {
  if (!GH_TOKEN) return { ok: false, reason: 'GH_DISPATCH_TOKEN is not set' };
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
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    console.error(`Workflow dispatch failed for ${workflow}: ${res.status} ${body}`);
    return { ok: false, reason: `GitHub dispatch failed (${res.status})` };
  } catch (err) {
    console.error(`Workflow dispatch errored for ${workflow}:`, err);
    return { ok: false, reason: 'GitHub dispatch errored' };
  }
};

const mergeCopyFromForm = async (supabase: Db, postId: string, form: FormData) => {
  // Json, not unknown: this is merged into marketing_posts.copy, a jsonb column.
  const copyPatch: Record<string, Json> = { x: String(form.get('x') || '') };
  if (form.has('instagram')) copyPatch.instagram = String(form.get('instagram') || '');
  if (form.has('threads')) copyPatch.threads = String(form.get('threads') || '');
  if (form.has('hashtags')) copyPatch.hashtags = String(form.get('hashtags') || '').split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
  if (form.has('page_title')) copyPatch.page_title = String(form.get('page_title') || '');
  if (form.has('page_body')) copyPatch.page_body = String(form.get('page_body') || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const { data: cur } = await supabase.from('marketing_posts').select('copy').eq('id', postId).single();
  const before = jsonObject(cur?.copy);
  return { before, after: { ...before, ...copyPatch } };
};

// Append-only audit trail (marketing_review_events). actor is always
// 'web_desk' here — the conversational marketing-week skill bypasses this
// file entirely and writes its own rows directly (see marketing/REVIEW.md).
// Wrapped so a logging failure can never block the real action it describes.
const logEvent = async (
  supabase: Db,
  entry: { postId?: string | null; action: string; before?: Json; after?: Json },
) => {
  try {
    await supabase.from('marketing_review_events').insert({
      post_id: entry.postId ?? null,
      actor: 'web_desk',
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  } catch (err) {
    console.error('Failed to log review event:', err);
  }
};

// Last-run status for a workflow, for the topbar's health chips. Read-only
// counterpart to dispatchWorkflow() — same auth, same repo. Time-boxed so a
// slow GitHub API can't stall the whole page; returns null on any failure
// (including no GH_TOKEN) rather than breaking the page for a diagnostic.
const workflowStatus = async (workflow: string): Promise<{ conclusion: string; url: string } | null> => {
  if (!GH_TOKEN) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${workflow}/runs?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'plot-control-room',
        },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return null;
    const body = await res.json();
    const run = body.workflow_runs?.[0];
    if (!run) return null;
    return { conclusion: run.status === 'in_progress' ? 'running' : (run.conclusion || run.status), url: run.html_url };
  } catch {
    return null;
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
// Status -> badge dot color, reused for the badge itself and the week-strip dots.
const DOT_COLOR: Record<string, string> = {
  needs_review: 'var(--warn)', approved: 'var(--good)', vetoed: 'var(--danger)',
  published: 'var(--good)', partially_published: 'var(--warn)', failed: 'var(--danger)',
};

const cookieToken = (req: Request) => {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith('admin_token='))?.slice('admin_token='.length);
  return raw ? decodeURIComponent(raw) : undefined;
};

// Cookie-only session auth. The ?key= URL param was removed — it leaked the
// secret into proxy logs, browser history and Referer headers.
const authed = (req: Request): boolean => {
  const c = cookieToken(req);
  return !!c && timingSafeEqual(c, SESSION_TOKEN);
};

const STYLE = `
/* PLOT's real cross-platform design tokens (packages/core/tokens.js) —
   not an ad hoc palette. .deck below scopes the same variable names to
   the matching dark-token set for everything inside the header. */
:root {
  --bg: #F4F4F5;
  --surface: #FFFFFF;
  --surface-raised: #FAFAFA;
  --surface-sunken: #EBEBEC;
  --text: #09090B;
  --text-secondary: #52525B;
  --text-muted: #A1A1AA;
  --border: rgba(0,0,0,0.07);
  --border-strong: rgba(0,0,0,0.14);
  --accent: #E05578;
  --accent-dim: rgba(224,85,120,0.12);
  --good: #059669;
  --good-dim: rgba(5,150,105,0.12);
  --warn: #D97706;
  --warn-dim: rgba(217,119,6,0.12);
  --danger: #B9384A;
  --danger-dim: rgba(185,56,74,0.1);
  --danger-border: rgba(185,56,74,0.22);
  --shadow-sm: 0 1px 2px rgba(9,9,11,.05);
  --shadow: 0 1px 2px rgba(9,9,11,.04), 0 6px 16px rgba(9,9,11,.06);
  --shadow-md: 0 4px 10px rgba(9,9,11,.06), 0 12px 28px rgba(9,9,11,.10);
  --radius: 14px;
  --radius-lg: 18px;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body {
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  color: var(--text); background: var(--bg); margin: 0; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1160px; margin: 0 auto; padding: 0 24px 100px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
svg { display: block; }

/* ================= Command deck (dark header) ================= */
.deck {
  --bg: #0c0c0c; --surface: #191919; --surface-raised: #242424;
  --text: #f0efe8; --text-secondary: #a8a69c; --text-muted: #6b6a63;
  --border: rgba(240,239,232,0.08); --border-strong: rgba(240,239,232,0.16);
  --accent: #F06A88; --accent-dim: rgba(240,106,136,0.15);
  --danger: #F18997; --danger-dim: rgba(241,137,151,0.16); --danger-border: rgba(241,137,151,0.26);
  background: var(--bg); color: #fff; position: sticky; top: 0; z-index: 20;
  border-bottom: 1px solid var(--border);
}
.deck-inner { max-width: 1160px; margin: 0 auto; padding: 16px 24px 14px; }
.toprow { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.toprow .spacer { flex: 1; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(140deg, #F06A88, var(--accent) 60%, #a83f56);
  display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1px rgba(255,255,255,.06) inset;
}
.brand-mark svg { width: 16px; height: 16px; color: #fff; }
h1 { font-size: 1.22rem; margin: 0; font-weight: 800; letter-spacing: -.01em; text-wrap: balance; color: #fff; }
.sub { font-size: .76rem; color: var(--text-secondary); margin: 1px 0 0; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: .76rem; color: var(--text-secondary); font-weight: 600; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 3px var(--good-dim); animation: pulse 2.4s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } .post { animation: none !important; } }
@media (max-width: 700px) { .live { display: none; } }

button {
  font: inherit; font-size: .84rem; font-weight: 650; border: 0; border-radius: 10px;
  padding: 9px 15px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  transition: filter .12s, box-shadow .12s, transform .06s, background .12s, color .12s;
}
button:active { transform: translateY(1px); }
button svg { width: 14px; height: 14px; flex-shrink: 0; }
.btn-primary { background: var(--accent); color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.btn-primary:hover { filter: brightness(1.12); }
.btn-dark { background: var(--text); color: #fff; }
.btn-dark:hover { filter: brightness(1.25); }
.btn-ghost { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--surface-sunken); color: var(--text); }
.btn-text-danger { background: transparent; color: var(--danger); padding: 9px 12px; }
.btn-text-danger:hover { background: var(--danger-dim); }
.btn-on-deck { background: var(--surface); color: #fff; border: 1px solid var(--border); }
.btn-on-deck:hover { background: var(--surface-raised); }
.btn-pause-deck { background: var(--surface); color: var(--warn); border: 1px solid var(--border); }
.btn-pause-deck:hover { background: var(--surface-raised); }
.btn-resume-deck { background: var(--good); color: #fff; border: 1px solid transparent; }
.btn-resume-deck:hover { filter: brightness(1.1); }
button[disabled] { opacity: .4; cursor: default; pointer-events: none; }

/* Week strip: instant visual pulse of the whole week */
.weekstrip { display: flex; gap: 6px; margin-top: 16px; }
.wday {
  flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 8px 6px 9px; text-align: center; text-decoration: none; transition: background .12s, border-color .12s;
  min-width: 0;
}
.wday:hover { background: var(--surface-raised); }
.wday-label { font-size: .66rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-secondary); }
.wday-count { font-size: .95rem; font-weight: 800; color: #fff; margin-top: 3px; font-variant-numeric: tabular-nums; }
.wday-dots { display: flex; justify-content: center; gap: 3px; margin-top: 5px; min-height: 5px; }
.wday-dots .d { width: 5px; height: 5px; border-radius: 50%; }
.wday.empty { opacity: .35; cursor: default; }
.wday.today { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }

/* KPI + progress ring row */
.statsrow { display: flex; gap: 10px; margin-top: 14px; align-items: stretch; flex-wrap: wrap; }
.ring-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 12px 16px; display: flex; align-items: center; gap: 12px; flex-shrink: 0;
}
.ring-label { font-size: .74rem; color: var(--text-secondary); font-weight: 650; line-height: 1.3; max-width: 90px; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(90px,1fr)); gap: 8px; flex: 1; }
.kpi {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 11px 14px; display: flex; flex-direction: column; gap: 1px;
  transition: border-color .15s, transform .12s; text-decoration: none;
}
.kpi:hover { border-color: var(--border-strong); transform: translateY(-1px); }
.kpi-num { font-size: 1.5rem; font-weight: 800; letter-spacing: -.02em; line-height: 1; font-variant-numeric: tabular-nums; color: #fff; }
.kpi-label { font-size: .72rem; color: var(--text-secondary); font-weight: 600; }
.kpi.hero .kpi-num { color: var(--warn); }
.kpi.hero { border-color: rgba(217,119,6,.35); }

@media (max-width: 780px) { .statsrow { flex-direction: column; } .kpis { grid-template-columns: repeat(4,1fr); } }
@media (max-width: 620px) { .kpis { grid-template-columns: repeat(2,1fr); } .weekstrip { flex-wrap: wrap; } .wday { min-width: 40px; } }

/* Tabs */
.tabbar { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.segmented { display: inline-flex; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 3px; gap: 2px; }
.tab {
  font: inherit; font-size: .8rem; font-weight: 650; padding: 6px 13px; border-radius: 8px;
  background: transparent; color: var(--text-secondary); border: 0; cursor: pointer;
  transition: background .15s, color .15s; font-variant-numeric: tabular-nums;
}
.tab.on { background: var(--accent); color: #fff; }
.tabbar .spacer { flex: 1; }

/* ================= Content area ================= */
.content { padding-top: 26px; }
.flash { background: var(--good-dim); color: var(--good); padding: 12px 15px; border-radius: 12px; margin-bottom: 16px; font-size: .9rem; font-weight: 550; }
.flash.err { background: var(--danger-dim); color: var(--danger); }
.paused-note {
  background: var(--warn-dim); color: var(--warn); border: 1px solid rgba(217,119,6,.3);
  padding: 12px 15px; border-radius: 12px; margin-bottom: 16px; font-size: .9rem; font-weight: 650;
  display: flex; align-items: center; gap: 8px;
}
.empty { color: var(--text-muted); padding: 48px 0; text-align: center; font-size: .95rem; }

.dayhead {
  font-size: .78rem; font-weight: 750; letter-spacing: .03em;
  color: var(--text); margin: 34px 0 12px; display: flex; align-items: baseline; gap: 10px;
  scroll-margin-top: 210px;
}
.dayhead .n { color: var(--text-muted); font-weight: 600; font-variant-numeric: tabular-nums; }
.dayhead::after { content: ''; flex: 1; height: 1px; background: var(--border); align-self: center; }
.today-pill { background: var(--good-dim); color: var(--good); font-size: .68rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase; letter-spacing: .04em; }

.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; align-items: start; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }

.post {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 0; box-shadow: var(--shadow-sm); transition: box-shadow .15s, transform .15s;
  animation: rise .35s ease-out backwards; display: flex; flex-direction: column;
}
.post:hover { box-shadow: var(--shadow-md); }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.post-top { display: flex; gap: 0; align-items: stretch; }
.post-media { width: 96px; min-height: 128px; flex-shrink: 0; position: relative; overflow: hidden; border-radius: var(--radius-lg) 0 0 0; }
.post-media img { width: 96px; height: 128px; object-fit: cover; display: block; cursor: zoom-in; transition: transform .2s; }
.post-media img:hover { transform: scale(1.04); }
.post-media .type-icon {
  position: absolute; top: 8px; left: 8px; width: 24px; height: 24px; border-radius: 7px;
  background: rgba(20,20,15,.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center;
}
.post-media .type-icon svg { width: 13px; height: 13px; color: #fff; }
.post-media.no-img { background: var(--surface-sunken); display: flex; align-items: center; justify-content: center; height: 100%; }
.post-media.no-img svg { width: 26px; height: 26px; color: var(--text-muted); }

.post-body { flex: 1; min-width: 0; padding: 14px 16px 0; }
.phead { display: flex; align-items: flex-start; gap: 10px; }
.ptitle { flex: 1; min-width: 0; }
.kind { font-weight: 750; font-size: .98rem; letter-spacing: -.005em; }
.when { color: var(--text-muted); font-size: .78rem; margin-left: 7px; font-weight: 600; font-variant-numeric: tabular-nums; }
.why { color: var(--text-muted); font-size: .82rem; margin: 3px 0 0; line-height: 1.4; }

.badge {
  font-size: .68rem; font-weight: 700; padding: 4px 9px 4px 7px; border-radius: 9999px;
  white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
}
.badge .dot { width: 6px; height: 6px; border-radius: 50%; }
.b-review { background: var(--warn-dim); color: var(--warn); }
.b-ok { background: var(--good-dim); color: var(--good); }
.b-no { background: var(--danger-dim); color: var(--danger); }
.b-warn { background: var(--warn-dim); color: var(--warn); }
.b-wait { background: var(--surface-sunken); color: var(--text-secondary); }

.targets { font-size: .78rem; color: var(--text-muted); margin: 10px 0 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.targets svg { width: 12px; height: 12px; }
.chip { font-size: .7rem; font-weight: 650; padding: 3px 8px; border-radius: 6px; background: var(--surface-sunken); color: var(--text-secondary); }

.preview { font-size: .88rem; background: var(--surface-sunken); border-radius: 10px; padding: 11px 13px; margin: 12px 0 0; white-space: pre-wrap; color: var(--text-secondary); }

details.edit, details.src { margin: 12px 0 0; }
details.edit > summary, details.src > summary {
  cursor: pointer; font-size: .8rem; font-weight: 650; color: var(--accent); list-style: none;
  display: flex; align-items: center; gap: 5px;
}
details > summary::-webkit-details-marker { display: none; }
details > summary svg { width: 12px; height: 12px; transition: transform .15s; }
details[open] > summary svg { transform: rotate(90deg); }

label { display: block; font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); margin: 11px 0 4px; font-weight: 650; }
.cc { float: right; font-weight: 650; letter-spacing: 0; text-transform: none; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.cc.over { color: var(--danger); }
textarea, input {
  width: 100%; font: inherit; font-size: .88rem; border: 1px solid var(--border); border-radius: 10px;
  padding: 9px 10px; background: var(--surface); resize: vertical; color: var(--text);
}
textarea:focus, input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
input[type=date] { width: auto; }

/* Tabbed per-platform copy editor — one focused field at a time instead of a
   tall stack, so "Edit copy" doesn't dominate the card. */
.edit-tabs { display: flex; gap: 3px; margin-top: 10px; background: var(--surface-sunken); border-radius: 9px; padding: 3px; width: fit-content; flex-wrap: wrap; }
.edit-tab {
  font: inherit; font-size: .75rem; font-weight: 650; padding: 5px 12px; border-radius: 7px;
  background: transparent; color: var(--text-secondary); border: 0; cursor: pointer; transition: background .12s, color .12s;
}
.edit-tab.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
.edit-panel { margin-top: 9px; }
.edit-panel textarea { font-size: .87rem; }
.counter { display: flex; align-items: center; gap: 9px; margin-top: 6px; }
.counter-track { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.counter-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width .15s, background .15s; }
.counter.over .counter-fill { background: var(--danger); }
.counter-n { font-size: .72rem; color: var(--text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.counter.over .counter-n { color: var(--danger); font-weight: 650; }
.article-fields > * + * { margin-top: 4px; }

.pubs { font-size: .78rem; color: var(--text-muted); margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pchip { padding: 3px 9px; border-radius: 6px; font-weight: 650; font-size: .72rem; }
.pchip.ok { background: var(--good-dim); color: var(--good); }
.pchip.no { background: var(--danger-dim); color: var(--danger); }
.pchip.wait { background: var(--surface-sunken); color: var(--text-secondary); }

.actions { display: flex; gap: 6px; margin: 14px 0 0; flex-wrap: wrap; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border); }
.actions .spacer { flex: 1; }

/* Overflow menu — Publish now / Regenerate / Retry / Reschedule tucked away
   so the row shows a few things at once instead of six. */
.menu { position: relative; display: inline-flex; }
.menu-panel {
  position: absolute; bottom: calc(100% + 6px); left: 0; min-width: 190px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: var(--shadow-md); padding: 5px; z-index: 10; display: flex; flex-direction: column; gap: 1px;
}
.menu-item {
  font: inherit; font-size: .83rem; font-weight: 600; text-align: left; background: transparent; border: 0;
  border-radius: 8px; padding: 8px 10px; cursor: pointer; display: flex; align-items: center; gap: 8px;
  color: var(--text-secondary); width: 100%;
}
.menu-item:hover { background: var(--surface-sunken); color: var(--text); }
.menu-item svg { width: 14px; height: 14px; flex-shrink: 0; }
.resched-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px; cursor: default; }
.resched-item input { width: auto; padding: 5px 7px; font-size: .8rem; }

/* ============ History / activity / runs ============ */
details.collapsible { margin-top: 8px; }
details.collapsible > summary {
  cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px;
  font-size: .74rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--text-muted); margin: 34px 0 12px; padding: 0;
}
details.collapsible > summary::after { content: ''; flex: 1; height: 1px; background: var(--border); margin-left: 4px; }
details.collapsible > summary::-webkit-details-marker { display: none; }
details.collapsible > summary svg { width: 11px; height: 11px; transition: transform .15s; flex-shrink: 0; }
details.collapsible[open] > summary svg { transform: rotate(90deg); }

.hist {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 14px; margin-bottom: 6px; font-size: .84rem; display: flex; gap: 10px;
  align-items: center; flex-wrap: wrap; transition: background .1s;
}
.hist:hover { background: var(--surface-sunken); }
.hist .spacer { flex: 1; }
.small { font-size: .79rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }

/* ================= Login ================= */
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.login-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: 32px 28px; max-width: 340px; width: 100%; text-align: center;
}
.login-card .brand-mark { width: 40px; height: 40px; border-radius: 12px; margin: 0 auto 16px; }
.login-card .brand-mark svg { width: 20px; height: 20px; }
.login-card h1 { color: var(--text); font-size: 1.3rem; }
.login-card p { color: var(--text-muted); font-size: .85rem; margin: 6px 0 0; }
.login-card form { margin-top: 22px; text-align: left; }
.login-card button { width: 100%; justify-content: center; padding: 11px; margin-top: 14px; }

@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
@media (max-width: 560px) {
  .wrap { padding: 0 14px 84px; }
  h1 { font-size: 1.08rem; }
  .post-top { flex-direction: column; }
  .post-media, .post-media img { width: 100%; height: 150px; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
}
`;

const SCRIPT = `
(function(){
  // Per-platform copy tabs: click a tab, show its panel, hide the rest —
  // scoped to the enclosing details element so each card's tabs are independent.
  function selectTab(tab){
    var group = tab.closest('.edit'); if (!group) return;
    group.querySelectorAll('.edit-tab').forEach(function(t){ t.classList.toggle('on', t === tab); });
    var field = tab.getAttribute('data-field');
    group.querySelectorAll('.edit-panel').forEach(function(p){ p.hidden = p.getAttribute('data-field') !== field; });
  }
  // Overflow "More" menu: one open at a time, closes on outside click or Escape.
  function closeAllMenus(except){
    document.querySelectorAll('.menu-panel').forEach(function(panel){
      if (panel === except) return;
      panel.hidden = true;
      var trigger = panel.previousElementSibling;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function(e){
    var tab = e.target.closest('.edit-tab');
    if (tab) { selectTab(tab); return; }
    var trigger = e.target.closest('.menu-trigger');
    if (trigger) {
      var panel = trigger.nextElementSibling;
      var willOpen = panel.hidden;
      closeAllMenus();
      panel.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
      return;
    }
    if (!e.target.closest('.menu-panel')) closeAllMenus();
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeAllMenus(); });

  // Live character counters: update the bar + number as you type.
  document.querySelectorAll('textarea[data-max]').forEach(function(t){
    var max=+t.getAttribute('data-max');
    var counter=t.parentElement.querySelector('.counter');
    var fill=counter&&counter.querySelector('.counter-fill');
    var num=counter&&counter.querySelector('.counter-n');
    function upd(){
      var n=t.value.length, over=n>max;
      if(fill) fill.style.width=Math.min(100,(n/max)*100)+'%';
      if(num) num.textContent=n+'/'+max;
      if(counter) counter.classList.toggle('over', over);
    }
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

  // Filter tabs: show only posts in the chosen state, and hide day sections
  // that end up empty. Pure display toggling — no reload, degrades to "show all".
  var tabs=[].slice.call(document.querySelectorAll('.tab[data-show]'));
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

const brandMark = () => `<div class="brand-mark"><svg viewBox="0 0 24 24" fill="none">${TYPE_ICON.upcoming}</svg></div>`;

// The sign-in page shown when there's no valid session. The password is
// ADMIN_PASSWORD (or the ADMIN_TOKEN); on success we set a 30-day cookie.
const loginPage = (error = false, rateLimited = false) => shell(
  `<div class="login-wrap"><div class="login-card">
     ${brandMark()}
     <h1>Control room</h1>
     <p>Sign in to review and publish.</p>
     <form method="POST" action="/api/admin">
       ${rateLimited
         ? '<div class="flash err" style="margin-top:14px">Too many attempts. Wait a few minutes and try again.</div>'
         : error ? '<div class="flash err" style="margin-top:14px">Incorrect password.</div>' : ''}
       <label>Password</label>
       <input type="password" name="password" autofocus autocomplete="current-password">
       <button class="btn-primary" type="submit">Sign in</button>
     </form>
   </div></div>`);

const badge = (status: string) => {
  const b = STATUS_BADGE[status] || { label: status, cls: 'b-wait' };
  const dot = DOT_COLOR[status];
  return `<span class="badge ${b.cls}">${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${esc(b.label)}</span>`;
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

const ghChip = (label: string, status: { conclusion: string; url: string } | null) => {
  if (!status) return `<span class="sys" title="No GH_DISPATCH_TOKEN, or no runs yet"><span class="dot" style="background:var(--text-muted)"></span>${esc(label)}: —</span>`;
  const dot = status.conclusion === 'success' ? 'var(--good)' : status.conclusion === 'running' ? 'var(--warn)' : 'var(--danger)';
  return `<a class="sys" href="${esc(status.url)}" target="_blank" title="${esc(label)} — click for the run"><span class="dot" style="background:${dot}"></span>${esc(label)}: ${esc(status.conclusion)}</a>`;
};

// Conversation/question posts only ever exposed an X field in the original
// editor (Instagram/Threads/Article were all hidden for them) — matched
// exactly here rather than expanded, since Threads copy for a question post
// may be assumed identical to X by the copy worker, not independently editable.
const editTabs = (c: Row, isConvo: boolean) => {
  const body = Array.isArray(c.page_body) ? c.page_body.join('\n\n') : (c.page_body || '');
  const tags = Array.isArray(c.hashtags) ? c.hashtags.join(', ') : '';
  const counted = (name: string, value: string, max: number, rows: number) =>
    `<textarea name="${name}" rows="${rows}" data-max="${max}">${esc(value)}</textarea>
     <div class="counter"><div class="counter-track"><div class="counter-fill"></div></div><span class="counter-n"></span></div>`;

  if (isConvo) {
    // A single field: no tab chrome needed, just the field itself.
    return `<div class="edit-panel" data-field="x">${counted('x', c.x || '', 280, 2)}</div>`;
  }

  const tabs = [{ id: 'x', label: 'X' }, { id: 'instagram', label: 'Instagram' }, { id: 'threads', label: 'Threads' }, { id: 'article', label: 'Article' }];
  const panel = (id: string, inner: string) => `<div class="edit-panel" data-field="${id}"${id === 'x' ? '' : ' hidden'}>${inner}</div>`;
  const panels = [
    panel('x', counted('x', c.x || '', 280, 2)),
    panel('instagram', counted('instagram', c.instagram || '', 2200, 3)),
    panel('threads', counted('threads', c.threads || '', 500, 2)),
    panel('article', `
       <div class="article-fields">
         <div><label>Hashtags (comma separated)</label><input name="hashtags" value="${esc(tags)}"></div>
         <div><label>Article title</label><textarea name="page_title" rows="2">${esc(c.page_title || '')}</textarea></div>
         <div><label>Article body (blank line between paragraphs)</label><textarea name="page_body" rows="8">${esc(body)}</textarea></div>
       </div>`),
  ].join('');
  return `<div class="edit-tabs">${tabs.map((t, i) => `<button type="button" class="edit-tab${i === 0 ? ' on' : ''}" data-field="${t.id}">${esc(t.label)}</button>`).join('')}</div>${panels}`;
};

const postForm = (p: Row) => {
  const c = p.copy || {};
  const media = (p.media || []) as { portrait_path?: string; landscape_path?: string }[];
  const firstMedia = media.find((m) => m.portrait_path || m.landscape_path);
  const isConvo = p.post_type === 'question';
  const link = articleLink(p);
  const isVetoed = p.status === 'vetoed';
  const hasCopy = !!(c.x || c.instagram || c.threads || c.page_title);
  const showEdit = !isVetoed && hasCopy;
  const hasFailed = (p.marketing_post_publications || []).some((x: Row) => x.status === 'failed');
  const platformList = platformsFor(p);
  const plats = platformList.map((s) => `<span class="chip">${PLAT_LABEL[s] || s}</span>`).join('');
  const preview = c.x || c.instagram || c.threads || '';

  const mediaHtml = firstMedia
    ? `<div class="post-media">
         <img class="lb" src="${esc(mediaUrl(firstMedia.portrait_path || firstMedia.landscape_path!))}" data-full="${esc(mediaUrl(firstMedia.portrait_path || firstMedia.landscape_path!))}" alt="${esc(c.alt_text || '')}" loading="lazy">
         <span class="type-icon">${typeIcon(p.post_type)}</span>
       </div>`
    : `<div class="post-media no-img">${typeIcon(p.post_type)}</div>`;

  // Every remaining card image (beyond the one shown in post-top) is still
  // click-to-zoom via the same lightbox, just not shown inline in the header.
  const extraImgs = media.slice(1).map((m) => {
    const full = m.portrait_path || m.landscape_path;
    return full ? `<img class="lb" src="${esc(mediaUrl(full))}" data-full="${esc(mediaUrl(full))}" alt="${esc(c.alt_text || '')}" loading="lazy" style="display:none">` : '';
  }).join('');

  return `<form id="p-${esc(p.id)}" data-status="${esc(p.status)}" class="post" method="POST" action="/api/admin">
    <input type="hidden" name="id" value="${esc(p.id)}">
    <div class="post-top">
      ${mediaHtml}
      <div class="post-body">
        <div class="phead">
          <div class="ptitle">
            <span class="kind">${esc(TYPE_LABELS[p.post_type] || p.post_type.replace(/_/g, ' '))}</span>
            <span class="when">${esc(fmtTime(p.scheduled_for))}</span>
            <p class="why">${esc(reason(p))}${c.cta_variant && c.cta_variant !== 'none' ? ` · CTA: ${esc(c.cta_variant)}` : ''}</p>
          </div>
          ${badge(p.status)}
        </div>
        <div class="targets">${isVetoed ? '<span>Won’t publish</span>' : platformList.length ? `<svg viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2v12" stroke="currentColor" stroke-width="1.4"/></svg>Publishes to ${plats}` : '<span>Web article only</span>'}${link ? ` <span class="spacer"></span><a href="${esc(link)}" target="_blank">${articleLinkLabel(p)}</a>` : ''}</div>
        ${preview && !showEdit ? `<div class="preview">${esc(preview)}</div>` : ''}
        ${showEdit ? `<details class="edit"${p.status === 'needs_review' ? ' open' : ''}>
          <summary><svg viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Edit copy</summary>
          ${editTabs(c, isConvo)}
        </details>` : ''}
        ${(c.sources?.length)
          ? `<details class="src"><summary><svg viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Sources (${c.sources.length})</summary><div class="pubs">${c.sources.map((s: Row) => `<a href="${esc(s.url)}" target="_blank">${esc(s.title)}</a>`).join(' · ')}</div></details>`
          : ''}
        ${pubChips(p.marketing_post_publications)}
      </div>
    </div>
    ${extraImgs}
    <div class="actions">
      ${p.status === 'approved'
        ? `<button class="btn-ghost" name="action" value="unapprove">Unapprove</button>`
        : showEdit ? `<button class="btn-primary" name="action" value="approve"><svg viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Approve</button>` : ''}
      ${showEdit ? `<button class="btn-dark" name="action" value="save">Save</button>` : ''}
      ${(showEdit || hasFailed || !isVetoed) ? `<div class="menu">
        <button type="button" class="btn-ghost menu-trigger" aria-haspopup="true" aria-expanded="false">
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>More
        </button>
        <div class="menu-panel" hidden>
          ${showEdit ? `<button type="submit" class="menu-item" name="action" value="publish_now"${confirm('Publish now? It goes straight to your socials.')}><svg viewBox="0 0 16 16" fill="none"><path d="M2 8l5-5v3c5 0 7 2 7 6-1.5-2-3.5-2.5-7-2.5v3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>Publish now</button>` : ''}
          ${showEdit ? `<button type="submit" class="menu-item" name="action" value="regenerate"${confirm('Regenerate? This replaces the current copy with a fresh version.')}><svg viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 113.5 5.5M3 2v3.5h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Regenerate</button>` : ''}
          ${hasFailed ? `<button type="submit" class="menu-item" name="action" value="retry"><svg viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 113.5 5.5M3 2v3.5h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Retry failed</button>` : ''}
          ${!isVetoed ? `<div class="resched-item"><span>Reschedule to</span><input type="date" name="scheduled_date" value="${esc(dayKey(p.scheduled_for))}"></div>
            <button type="submit" class="menu-item" name="action" value="reschedule"><svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Confirm reschedule</button>` : ''}
        </div>
      </div>` : ''}
      <span class="spacer"></span>
      ${isVetoed
        ? `<button class="btn-ghost" name="action" value="unapprove">Restore</button>`
        : `<button class="btn-text-danger" name="action" value="reject"${confirm('Reject this post? It will not publish.')}>Reject</button>`}
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
    <span style="font-weight:650">${esc(TYPE_LABELS[p.post_type] || p.post_type.replace(/_/g, ' '))}</span>
    <span class="small">${esc(fmtDay(p.scheduled_for))}</span>
    ${badge(p.status)}
    <span class="spacer"></span>
    ${links ? `<span class="small">${links}</span>` : ''}
    ${stats}
  </div>`;
};

const ACTOR_LABEL: Record<string, string> = { web_desk: 'Web desk', marketing_week_skill: 'Marketing-week skill' };

const eventLine = (e: Row) => `<div class="hist">
  <span class="small">${esc(fmtDay(e.occurred_at))} ${esc(fmtTime(e.occurred_at))}</span>
  <span style="font-weight:650">${esc(e.action)}</span>
  <span class="spacer"></span>
  <span class="small">${esc(ACTOR_LABEL[e.actor] || e.actor)}</span>
</div>`;

const runLine = (r: Row) => {
  const cls = r.status === 'succeeded' ? 'b-ok' : r.status === 'failed' ? 'b-no' : 'b-wait';
  const dot = r.status === 'succeeded' ? 'var(--good)' : r.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)';
  return `<div class="hist">
    <span class="small">${esc(fmtDay(r.started_at))} ${esc(fmtTime(r.started_at))}</span>
    <span style="font-weight:650">${esc(r.run_type)}</span>
    <span class="badge ${cls}"><span class="dot" style="background:${dot}"></span>${esc(r.status)}</span>
    <span class="spacer"></span>
    <span class="small" title="${esc(r.error || '')}">${esc(JSON.stringify(r.counts || {}))}</span>
  </div>`;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Read the body once: it carries either the sign-in password or a desk action.
  const form = req.method === 'POST' ? await req.formData() : null;
  const submitted = form ? String(form.get('password') || '') : '';
  const isLoginAttempt = !!form && form.has('password');
  const ip = clientIp(req);
  const supabase = createClient<Database>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Throttle brute force before checking the password at all.
  if (isLoginAttempt && await loginBlocked(supabase, ip)) {
    return new Response(loginPage(true, true),
      { status: 429, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '900' } });
  }

  const passwordOk = matchesSecret(submitted);
  if (isLoginAttempt) { if (passwordOk) await clearLoginFails(supabase, ip); else await noteLoginFail(supabase, ip); }

  // No valid session cookie and no valid password → show the sign-in page.
  if (!authed(req) && !passwordOk) {
    return new Response(loginPage(isLoginAttempt),
      { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  // On a fresh password sign-in, set the derived session cookie (never the raw secret).
  // Record<string, string>, not an inferred literal: spreading a union of
  // `{ 'set-cookie': string }` and `{}` produces a union that is not a HeadersInit.
  const setCookie: Record<string, string> = passwordOk
    ? { 'set-cookie': `admin_token=${SESSION_TOKEN}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` } : {};

  // Readable week sheet: the weekly batch pre-builds week.html and stores it in
  // the private `marketing-review` bucket. Supabase serves stored HTML as
  // text/plain (anti-XSS), so it won't render if opened directly — we proxy it
  // through here as real text/html (auth-gated, since it holds unpublished copy).
  if (url.searchParams.get('view') === 'sheet') {
    const dl = await supabase.storage.from('marketing-review').download('week.html');
    if (dl.error || !dl.data) {
      return new Response('<!doctype html><meta charset=utf-8><p style="font-family:sans-serif;padding:40px">The week sheet hasn’t been generated yet — it’s built by the weekly batch.</p>',
        { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', ...setCookie } });
    }
    return new Response(await dl.data.text(), { headers: { 'content-type': 'text/html; charset=utf-8', ...setCookie } });
  }

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
      await logEvent(supabase, { action });
    } else if (action === 'approve_all') {
      const { data } = await supabase.from('marketing_posts')
        .update({ status: 'approved', updated_at: now() })
        .eq('status', 'needs_review').select('id');
      const ids = (data || []).map((d) => d.id);
      if (ids.length) await requeuePubs(ids);
      flash = `Approved the week — ${data?.length || 0} post(s) cleared to publish.`;
      await logEvent(supabase, { action, after: { post_ids: ids } });
    } else if (id && action === 'reject') {
      await supabase.from('marketing_posts').update({ status: 'vetoed', updated_at: now() }).eq('id', id);
      await supabase.from('marketing_post_publications').update({ status: 'skipped' }).eq('post_id', id).eq('status', 'queued');
      flash = 'Rejected — it will not publish.';
      await logEvent(supabase, { postId: id, action });
    } else if (id && action === 'unapprove') {
      await supabase.from('marketing_posts').update({ status: 'needs_review', updated_at: now() }).eq('id', id);
      flash = 'Back in review.';
      await logEvent(supabase, { postId: id, action });
    } else if (id && action === 'reschedule') {
      const d = String(form.get('scheduled_date') || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        // Noon UTC renders as the same calendar date in AEST and is comfortably
        // before the 23:30 UTC publish run, so the post goes out on day `d`.
        await supabase.from('marketing_posts')
          .update({ scheduled_for: `${d}T12:00:00.000Z`, updated_at: now() }).eq('id', id);
        flash = `Rescheduled to ${d}.`;
        await logEvent(supabase, { postId: id, action, after: { scheduled_date: d } });
      } else flash = 'Reschedule needs a valid date.';
    } else if (id && action === 'publish_now') {
      // Approve + bring the schedule forward so the publisher will pick it up,
      // then kick the publish run so it sends within minutes (if a token is set).
      const { before, after: merged } = await mergeCopyFromForm(supabase, id, form);
      await supabase.from('marketing_posts')
        .update({ copy: merged, status: 'approved', scheduled_for: now(), updated_at: now() }).eq('id', id);
      await requeuePubs([id]);
      const triggered = await dispatchWorkflow('marketing-publish.yml');
      flash = triggered.ok
        ? 'Saved edits and publishing now — sending approved copy to X / Instagram / Threads; it’ll show as published in a few minutes.'
        : `Approved and queued — the 5-minute publish runner will pick it up automatically. Instant trigger did not fire${triggered.reason ? ` (${triggered.reason})` : ''}.`;
      await logEvent(supabase, { postId: id, action, before: { copy: before }, after: { copy: merged, triggered: triggered.ok } });
    } else if (id && action === 'retry') {
      await supabase.from('marketing_post_publications')
        .update({ status: 'queued', error: null }).eq('post_id', id).eq('status', 'failed');
      await supabase.from('marketing_posts').update({ status: 'approved', updated_at: now() }).eq('id', id);
      flash = 'Failed platforms re-queued — they retry on the next publish run.';
      await logEvent(supabase, { postId: id, action });
    } else if (id && action === 'regenerate') {
      // Send it back to the start of the pipeline so the copy worker rewrites it
      // (keep media/slug — the render overwrites them). It stays visible as "Queued".
      await supabase.from('marketing_posts')
        .update({ status: 'planned', copy: null, updated_at: now() }).eq('id', id);
      const triggered = await dispatchWorkflow('marketing-weekly-batch.yml');
      flash = triggered.ok
        ? 'Regenerating — the Codex weekly worker will rewrite this post. Refresh in a few minutes.'
        : 'Marked for regeneration — it rebuilds on the next weekly batch.';
      await logEvent(supabase, { postId: id, action, after: { triggered: triggered.ok } });
    } else if (id) {
      const { before, after: merged } = await mergeCopyFromForm(supabase, id, form);
      const patch: Database['public']['Tables']['marketing_posts']['Update'] = { copy: merged, updated_at: now() };
      if (action === 'approve') patch.status = 'approved';
      await supabase.from('marketing_posts').update(patch).eq('id', id);
      if (action === 'approve') await requeuePubs([id]);
      flash = action === 'approve' ? 'Approved — it will publish on its day.' : 'Saved.';
      await logEvent(supabase, { postId: id, action, before: { copy: before }, after: { copy: merged } });
    }
  }

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

  // In-product observability: recent audit-log events, recent batch runs, and
  // last-run status for the marketing GitHub Actions workflows. All purely
  // additive/read-only — none of this can affect the actions above.
  const { data: recentEvents } = await supabase
    .from('marketing_review_events')
    .select('actor, action, post_id, occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(20);

  const { data: recentRuns } = await supabase
    .from('marketing_batch_runs')
    .select('run_type, status, started_at, finished_at, counts, error')
    .order('started_at', { ascending: false })
    .limit(10);

  const WORKFLOWS = [
    { id: 'marketing-weekly-batch.yml', label: 'Weekly batch' },
    { id: 'marketing-publish.yml', label: 'Publish' },
    { id: 'marketing-learning-prep.yml', label: 'Learning prep' },
  ];
  const workflowStatuses = await Promise.all(WORKFLOWS.map((w) => workflowStatus(w.id)));

  const active = posts || [];
  const counts = {
    review: active.filter((p) => p.status === 'needs_review').length,
    approved: active.filter((p) => p.status === 'approved').length,
    rejected: active.filter((p) => p.status === 'vetoed').length,
  };
  const decidedPct = active.length ? Math.round(((counts.approved + counts.rejected) / active.length) * 100) : 0;
  const RING_C = 2 * Math.PI * 21;

  // Group active posts by AEST day.
  const byDay = new Map<string, Row[]>();
  for (const p of active) {
    const k = dayKey(p.scheduled_for);
    (byDay.get(k) || byDay.set(k, []).get(k)!).push(p);
  }
  const sortedDayKeys = [...byDay.keys()].sort();

  const dayLabel = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });
  const dayShortLabel = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
  const dayDateLabel = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const todayKey = dayKey(now());

  const dayBlocks = sortedDayKeys.map((k) => {
    const list = byDay.get(k)!;
    const isToday = k === todayKey;
    return `<section class="day"><div class="dayhead" id="day-${k}">${esc(dayLabel(k))} <span class="n">${esc(dayDateLabel(k))}</span>${isToday ? ' <span class="today-pill">Today</span>' : ''}</div><div class="grid">${list.map((p) => postForm(p)).join('')}</div></section>`;
  }).join('');

  // Week strip: a Monday-anchored 7-day view (from the earliest active post's
  // week, or this week if the pipeline is empty), so the header gives an
  // instant visual pulse even for days with nothing scheduled yet.
  const firstKey = sortedDayKeys[0] || todayKey;
  const firstDate = new Date(`${firstKey}T12:00:00Z`);
  const isoDow = firstDate.getUTCDay() === 0 ? 7 : firstDate.getUTCDay(); // Mon=1..Sun=7
  const weekStartKey = addDaysToKey(firstKey, -(isoDow - 1));
  const weekStrip = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStartKey, i)).map((k) => {
    const list = byDay.get(k) || [];
    const dots = list.map((p) => `<span class="d" style="background:${DOT_COLOR[p.status] || 'var(--text-muted)'}"></span>`).join('');
    const classes = ['wday', !list.length && 'empty', k === todayKey && 'today'].filter(Boolean).join(' ');
    return `<a class="${classes}" href="${list.length ? `#day-${k}` : '#'}">
      <div class="wday-label">${esc(dayShortLabel(k))}</div>
      <div class="wday-count">${list.length}</div>
      <div class="wday-dots">${dots}</div>
    </a>`;
  }).join('');

  const topbar = `<div class="deck"><div class="deck-inner">
    <div class="toprow">
      <div class="brand">
        ${brandMark()}
        <div>
          <h1>Control room</h1>
          <p class="sub">Weekly marketing review · ${esc(dayDateLabel(weekStartKey))}–${esc(dayDateLabel(addDaysToKey(weekStartKey, 6)))}</p>
        </div>
      </div>
      <span class="spacer"></span>
      <span class="live"><span class="live-dot"></span>Updated just now</span>
      <a class="btn-on-deck" href="?view=sheet">
        <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        Sheet view
      </a>
      <form method="POST" action="/api/admin" style="display:inline-flex">
        <button class="btn-primary" name="action" value="approve_all"${counts.review ? confirm(`Approve all ${counts.review} posts awaiting review?`) : ' disabled'}>
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Approve week${counts.review ? ` (${counts.review})` : ''}
        </button>
      </form>
      <form method="POST" action="/api/admin" style="display:inline-flex">
        <button class="${paused ? 'btn-resume-deck' : 'btn-pause-deck'}" name="action" value="${paused ? 'resume' : 'pause'}"${paused ? '' : confirm('Pause all publishing? Approved posts will not be sent until you resume.')}>
          <svg viewBox="0 0 16 16" fill="none"><rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor"/></svg>
          ${paused ? 'Resume' : 'Pause'}
        </button>
      </form>
    </div>

    <div class="weekstrip">${weekStrip}</div>

    <div class="statsrow">
      <div class="ring-card">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="21" fill="none" stroke="var(--border-strong)" stroke-width="6"/>
          <circle cx="26" cy="26" r="21" fill="none" stroke="var(--good)" stroke-width="6"
            stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${(RING_C * (1 - decidedPct / 100)).toFixed(1)}"
            stroke-linecap="round" transform="rotate(-90 26 26)"/>
          <text x="26" y="30" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" font-family="DM Sans, sans-serif">${decidedPct}%</text>
        </svg>
        <div class="ring-label">of active posts decided</div>
      </div>
      <div class="kpis">
        <span class="kpi hero"><span class="kpi-num">${counts.review}</span><span class="kpi-label">Needs review</span></span>
        <span class="kpi"><span class="kpi-num">${counts.approved}</span><span class="kpi-label">Approved</span></span>
        <span class="kpi"><span class="kpi-num">${counts.rejected}</span><span class="kpi-label">Rejected</span></span>
        <span class="kpi"><span class="kpi-num">${active.length}</span><span class="kpi-label">Total active</span></span>
      </div>
    </div>

    <div class="tabbar">
      <div class="segmented">
        <button type="button" class="tab on" data-show="all">All ${active.length}</button>
        <button type="button" class="tab" data-show="review">Needs review ${counts.review}</button>
        <button type="button" class="tab" data-show="approved">Approved ${counts.approved}</button>
        <button type="button" class="tab" data-show="rejected">Rejected ${counts.rejected}</button>
      </div>
      <span class="spacer"></span>
    </div>
    <div class="statsrow" style="margin-top:10px">${WORKFLOWS.map((w, i) => ghChip(w.label, workflowStatuses[i])).join('')}</div>
  </div></div>`;

  const list = active.length ? dayBlocks
    : '<p class="empty">Nothing in the pipeline yet.<br>The Saturday weekly batch drops the next week’s posts here.</p>';

  const historyHtml = (history || []).length
    ? `<details class="collapsible" open><summary><svg viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Recently published (${history!.length})</summary>${(history || []).map((p) => histLine(p, metrics)).join('')}</details>`
    : '';

  // Secondary/diagnostic info, collapsed by default so it doesn't compete
  // with the primary review flow above.
  const activityHtml = (recentEvents || []).length
    ? `<details class="collapsible"><summary><svg viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Recent activity (${recentEvents!.length})</summary>${(recentEvents || []).map((e) => eventLine(e)).join('')}</details>`
    : '';
  const runsHtml = (recentRuns || []).length
    ? `<details class="collapsible"><summary><svg viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Recent batch runs (${recentRuns!.length})</summary>${(recentRuns || []).map((r) => runLine(r)).join('')}</details>`
    : '';

  const html = shell(
    `${topbar}
     <div class="wrap"><div class="content">
     ${paused ? '<div class="paused-note">⏸ Publishing is paused — approved posts will not be sent until you resume.</div>' : ''}
     ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
     ${acted ? `<span id="acted" data-target="p-${esc(acted)}"></span>` : ''}
     ${list}
     ${historyHtml}
     ${activityHtml}
     ${runsHtml}
     </div></div>`);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...setCookie } });
});
