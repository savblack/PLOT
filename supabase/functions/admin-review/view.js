export const ACTIVE = ['planned', 'needs_review', 'copy_ready', 'generated', 'approved', 'vetoed'];
export const HISTORY = ['published', 'partially_published', 'failed'];

export const TYPE_LABELS = {
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

export const PLAT_LABEL = { x: 'X', instagram: 'Instagram', threads: 'Threads' };

const STATUS_BADGE = {
  planned: { label: 'Queued', cls: 'b-wait' },
  needs_review: { label: 'Needs review', cls: 'b-review' },
  copy_ready: { label: 'Rendering', cls: 'b-wait' },
  generated: { label: 'Rendering', cls: 'b-wait' },
  approved: { label: 'Approved', cls: 'b-ok' },
  vetoed: { label: 'Rejected', cls: 'b-no' },
  published: { label: 'Published', cls: 'b-ok' },
  partially_published: { label: 'Partly published', cls: 'b-warn' },
  failed: { label: 'Failed', cls: 'b-no' },
};

const REVIEW_PRIORITY = { needs_review: 0, copy_ready: 1, generated: 2, planned: 3 };

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const compact = (n) => (n == null ? '–' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export const fmtDay = (iso) =>
  new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });

export const dayKey = (iso) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

export const reasonForPost = (post) => {
  const title = post.tmdb_refs?.[0]?.title || post.payload?.title || post.payload?.topic?.title || '';
  switch (post.post_type) {
    case 'upcoming': return 'Monday slate — the week’s most-anticipated titles';
    case 'trending': return 'Friday chart — this week’s trending top 10';
    case 'watch_tonight': return title ? `Trending and streamable now: ${title}` : 'What to watch tonight';
    case 'hidden_gem': return title ? `Highly rated, lesser seen: ${title}` : 'Hidden gem of the week';
    case 'on_this_day': return title ? `Anniversary: ${title}` : 'On this day in film and TV';
    case 'now_streaming': return title ? `Hits streaming today: ${title}` : 'New on streaming today';
    case 'countdown': {
      const match = String(post.topic_key || '').match(/:t(\d+):/);
      const days = match ? match[1] : (post.payload?.days ?? '');
      return title ? `T-${days} countdown to ${title}` : `Countdown (T-${days})`;
    }
    case 'trailer': return title ? `New trailer dropped: ${title}` : 'New trailer';
    case 'question': return 'Generic audience question';
    default: return String(post.post_type || '').replace(/_/g, ' ');
  }
};

const titleForPost = (post) => (
  post.tmdb_refs?.[0]?.title ||
  post.payload?.title ||
  post.payload?.topic?.title ||
  post.copy?.page_title ||
  ''
);

const headlineForPost = (post) => {
  const title = titleForPost(post);
  if (post.post_type === 'trending' || post.post_type === 'upcoming') {
    return `Week of ${new Date(post.scheduled_for).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      timeZone: 'Australia/Sydney',
    })}`;
  }
  if (post.post_type === 'question') return 'Audience question';
  return title || TYPE_LABELS[post.post_type] || String(post.post_type || '').replace(/_/g, ' ');
};

export const articleLinkForPost = (post, siteUrl = 'https://theplot.tv') => {
  if (post.post_type === 'trending') return `${siteUrl}/whats-on/chart`;
  return post.slug ? `${siteUrl}/whats-on/${post.slug}` : null;
};

export const platformsForPost = (post) => {
  const pubs = post.marketing_post_publications || [];
  if (pubs.length) return [...new Set(pubs.map((entry) => entry.platform))];
  return post.post_type === 'question' ? ['x', 'threads'] : ['x', 'instagram', 'threads'];
};

export const buildCopyPatchFromForm = (form) => {
  const patch = { x: String(form.get('x') || '') };
  if (form.has('instagram')) patch.instagram = String(form.get('instagram') || '');
  if (form.has('threads')) patch.threads = String(form.get('threads') || '');
  if (form.has('hashtags')) patch.hashtags = String(form.get('hashtags') || '').split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
  if (form.has('page_title')) patch.page_title = String(form.get('page_title') || '');
  if (form.has('page_body')) patch.page_body = String(form.get('page_body') || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return patch;
};

export const mergeCopyValues = (currentCopy = {}, form) => ({ ...currentCopy, ...buildCopyPatchFromForm(form) });

export const buildCounts = (active = [], history = [], nowIso = new Date().toISOString()) => {
  const reviewQueue = active.filter((post) => post.status !== 'approved' && post.status !== 'vetoed');
  const ready = reviewQueue.filter((post) => post.status === 'needs_review').length;
  const building = reviewQueue.length - ready;
  const approved = active.filter((post) => post.status === 'approved');
  const dueNow = approved.filter((post) =>
    String(post.scheduled_for) <= String(nowIso)
    && !(post.marketing_post_publications || []).some((publication) => publication.status === 'published')).length;
  const failed = active.reduce((count, post) =>
    count + (post.marketing_post_publications || []).filter((publication) => publication.status === 'failed').length, 0);
  return {
    total: active.length,
    reviewQueue: reviewQueue.length,
    ready,
    building,
    approved: approved.length,
    dueNow,
    failed,
    rejected: active.filter((post) => post.status === 'vetoed').length,
    published: history.length,
  };
};

export const groupPostsForDisplay = (posts = []) => {
  const reviewQueue = [...posts]
    .filter((post) => post.status !== 'approved' && post.status !== 'vetoed')
    .sort((a, b) => {
      const rank = (REVIEW_PRIORITY[a.status] ?? 99) - (REVIEW_PRIORITY[b.status] ?? 99);
      if (rank !== 0) return rank;
      return String(a.scheduled_for).localeCompare(String(b.scheduled_for));
    });
  const approved = [...posts]
    .filter((post) => post.status === 'approved')
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
  const rejected = [...posts]
    .filter((post) => post.status === 'vetoed')
    .sort((a, b) => String(b.updated_at || b.scheduled_for).localeCompare(String(a.updated_at || a.scheduled_for)));
  return { reviewQueue, approved, rejected };
};

export const groupByDay = (posts = []) => {
  const map = new Map();
  for (const post of posts) {
    const key = dayKey(post.scheduled_for);
    const list = map.get(key) || [];
    list.push(post);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, list]) => ({ key, label: fmtDay(list[0].scheduled_for), posts: list }));
};

export const publishTimingLabel = (post, nowIso) => {
  if (post.status === 'approved') {
    if ((post.marketing_post_publications || []).some((publication) => publication.status === 'published')) {
      return 'Already sent to at least one channel';
    }
    if (String(post.scheduled_for) <= String(nowIso)) return 'Due now — next 5-minute publish check';
    return `Approved for ${fmtDay(post.scheduled_for)} at ${fmtTime(post.scheduled_for)}`;
  }
  if (post.status === 'needs_review') return 'Ready for a decision';
  if (post.status === 'copy_ready' || post.status === 'generated') return 'Still rendering or syncing — not ready to approve yet';
  if (post.status === 'planned') return 'Waiting on the generation pipeline';
  if (post.status === 'vetoed') return 'Rejected and out of the publish queue';
  return '';
};

const copySummary = (post) => {
  const copy = post.copy || {};
  const articleReady = Array.isArray(copy.page_body) ? copy.page_body.length > 0 : !!copy.page_body;
  if (post.post_type === 'question') {
    return copy.x ? 'Question copy ready' : 'No question copy yet';
  }
  if (copy.x || copy.instagram || copy.threads) {
    return articleReady ? 'Social copy and article are ready' : 'Social copy ready';
  }
  return 'Copy not ready yet';
};

const previewText = (post) => {
  const copy = post.copy || {};
  const value = copy.x || copy.threads || copy.instagram || copy.page_title || '';
  return value.length > 220 ? `${value.slice(0, 217)}…` : value;
};

const articleSummary = (post) => {
  const copy = post.copy || {};
  if (post.post_type === 'question') return 'No article for question posts';
  if (copy.page_title) return copy.page_title;
  return 'Article copy not ready yet';
};

const quickSignalsForPost = (post, nowIso) => {
  const copy = post.copy || {};
  const pubs = post.marketing_post_publications || [];
  const articleReady = Array.isArray(copy.page_body) ? copy.page_body.length > 0 : !!copy.page_body;
  const socialReady = !!(copy.x || copy.instagram || copy.threads);
  const queued = pubs.filter((entry) => entry.status === 'queued').length;
  const failed = pubs.filter((entry) => entry.status === 'failed').length;
  const live = pubs.filter((entry) => entry.status === 'published').length;
  const signals = [];

  if (post.status === 'approved' && String(post.scheduled_for) <= String(nowIso) && !live) {
    signals.push({ label: 'Due now', cls: 'sig-warn' });
  }
  if (socialReady) {
    signals.push({ label: 'Social ready', cls: 'sig-ok' });
  } else if (post.status !== 'vetoed') {
    signals.push({ label: 'No social copy yet', cls: 'sig-bad' });
  }
  if (post.post_type === 'question') {
    signals.push({ label: 'Question only', cls: 'sig-neutral' });
  } else if (articleReady || copy.page_title) {
    signals.push({ label: 'Article ready', cls: 'sig-ok' });
  } else {
    signals.push({ label: 'Article missing', cls: 'sig-bad' });
  }
  if ((post.media || []).length) signals.push({ label: `${post.media.length} image${post.media.length === 1 ? '' : 's'}`, cls: 'sig-neutral' });
  if (copy.sources?.length) signals.push({ label: `${copy.sources.length} source${copy.sources.length === 1 ? '' : 's'}`, cls: 'sig-neutral' });
  if (failed) {
    signals.push({ label: `${failed} failed`, cls: 'sig-bad' });
  } else if (live) {
    signals.push({ label: `${live} live`, cls: 'sig-ok' });
  } else if (queued) {
    signals.push({ label: `${queued} queued`, cls: 'sig-neutral' });
  }
  return signals.slice(0, 5);
};

const badge = (status) => {
  const meta = STATUS_BADGE[status] || { label: status, cls: 'b-wait' };
  return `<span class="badge ${meta.cls}">${esc(meta.label)}</span>`;
};

const mediaUrl = (supabaseUrl, path) => `${supabaseUrl}/storage/v1/object/public/marketing/${path}`;

export const renderPublicationChips = (post) => {
  const pubs = post.marketing_post_publications || [];
  const chips = [];
  if (!pubs.length) {
    for (const platform of platformsForPost(post)) chips.push(`<span class="pchip pchip-none">${esc(PLAT_LABEL[platform] || platform)} not attempted</span>`);
  } else {
    for (const publication of pubs) {
      const name = PLAT_LABEL[publication.platform] || publication.platform;
      if (publication.status === 'published') {
        chips.push(publication.permalink
          ? `<a class="pchip pchip-ok" href="${esc(publication.permalink)}" target="_blank">${esc(name)} live ↗</a>`
          : `<span class="pchip pchip-ok">${esc(name)} published</span>`);
      } else if (publication.status === 'failed') {
        chips.push(`<span class="pchip pchip-no" title="${esc(publication.error || '')}">${esc(name)} failed</span>`);
      } else if (publication.status === 'publishing') {
        chips.push(`<span class="pchip pchip-live">${esc(name)} publishing</span>`);
      } else if (publication.status === 'queued') {
        chips.push(`<span class="pchip pchip-wait">${esc(name)} queued</span>`);
      } else if (publication.status !== 'skipped') {
        chips.push(`<span class="pchip pchip-none">${esc(name)} ${esc(publication.status)}</span>`);
      }
    }
  }
  return `<div class="pubs">${chips.join('')}</div>`;
};

const confirm = (message) => ` onclick="return confirm('${message.replace(/'/g, '')}')"`;

export const STYLE = `
  :root { --ink:#15140f; --mut:#6d6a63; --line:#e7e2d8; --soft:#f5f2eb; --soft-2:#faf8f4; --card:#ffffff; --pink:#c23d63; --teal:#0f6e56; --amber:#8a5a00; --shadow:0 16px 36px rgba(20,18,15,.06); }
  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body { margin:0; font-family:'DM Sans',system-ui,-apple-system,sans-serif; color:var(--ink); background:linear-gradient(180deg,#f7f4ed 0%,#fbfaf8 180px); line-height:1.45; }
  a { color:var(--teal); text-decoration:none; }
  a:hover { text-decoration:underline; }
  button, input, textarea { font:inherit; }
  .shell { max-width:1180px; margin:0 auto; padding:24px 20px 96px; }
  .topbar { position:sticky; top:0; z-index:20; backdrop-filter:blur(12px); background:rgba(251,250,248,.92); border-bottom:1px solid rgba(231,226,216,.9); margin:0 -20px 18px; padding:16px 20px 14px; }
  .toprow { display:flex; align-items:flex-start; gap:16px; }
  .topcopy { flex:1; min-width:0; }
  .topcopy h1 { margin:0; font-size:1.45rem; }
  .topcopy p { margin:6px 0 0; color:var(--mut); font-size:.92rem; }
  .topactions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:16px 0 14px; }
  .summary-card { background:rgba(255,255,255,.85); border:1px solid var(--line); border-radius:16px; padding:14px 16px; box-shadow:var(--shadow); }
  .summary-card.focus { border-color:rgba(15,110,86,.22); box-shadow:0 0 0 3px rgba(15,110,86,.06), var(--shadow); }
  .summary-card strong { display:block; font-size:1.25rem; line-height:1; margin-top:8px; }
  .summary-card span { color:var(--mut); font-size:.78rem; text-transform:uppercase; letter-spacing:.06em; }
  .summary-card p { margin:6px 0 0; color:var(--mut); font-size:.82rem; }
  .summary-card a { display:inline-block; margin-top:10px; font-size:.8rem; font-weight:700; }
  .filters { display:flex; gap:8px; flex-wrap:wrap; }
  .tab { border:1px solid var(--line); background:#fff; color:var(--mut); padding:7px 13px; border-radius:999px; cursor:pointer; font-size:.8rem; font-weight:600; }
  .tab.on { background:var(--ink); color:#fff; border-color:var(--ink); }
  .focus-strip { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:0 0 18px; }
  .focus-note { background:rgba(255,255,255,.78); border:1px solid var(--line); border-radius:14px; padding:12px 14px; }
  .focus-note strong { display:block; font-size:.92rem; }
  .focus-note p { margin:4px 0 0; color:var(--mut); font-size:.84rem; }
  .flash { background:#e8f4ef; color:var(--teal); padding:11px 14px; border-radius:12px; margin:0 0 18px; font-size:.92rem; border:1px solid rgba(15,110,86,.12); }
  .flash.err { background:#fbeaef; color:var(--pink); border-color:rgba(194,61,99,.14); }
  .paused-note { background:#fff2dd; color:var(--amber); border:1px solid #efd7aa; padding:12px 14px; border-radius:12px; margin:0 0 18px; font-size:.92rem; font-weight:600; }
  .section { margin-top:26px; }
  .section-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:14px; }
  .section-head h2 { margin:0; font-size:1.05rem; }
  .section-head p { margin:4px 0 0; color:var(--mut); font-size:.86rem; }
  .section-count { color:var(--mut); font-size:.85rem; white-space:nowrap; }
  .day { margin-top:18px; }
  .dayhead { font-size:.8rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--mut); margin:0 0 10px; }
  .post-grid { display:grid; gap:12px; }
  .post { background:var(--card); border:1px solid var(--line); border-left:5px solid var(--line); border-radius:18px; padding:18px; box-shadow:var(--shadow); }
  .post.p-review { border-left-color:#d8a54e; }
  .post.p-ok { border-left-color:var(--teal); }
  .post.p-no { border-left-color:var(--pink); }
  .post.is-dirty { box-shadow:0 0 0 3px rgba(194,61,99,.08), var(--shadow); }
  .post-top { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }
  .post-copy { flex:1; min-width:0; }
  .post-title { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .kind { font-size:1.03rem; font-weight:700; }
  .headline { margin:10px 0 0; font-size:1rem; font-weight:700; }
  .when { color:var(--mut); font-size:.83rem; }
  .state-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:8px 0 0; }
  .copy-state { font-size:.75rem; font-weight:700; padding:4px 10px; border-radius:999px; background:var(--soft); color:var(--mut); }
  .copy-state[data-state="dirty"] { background:#fbeaef; color:var(--pink); }
  .why, .timing { margin:8px 0 0; color:var(--mut); font-size:.87rem; }
  .signals { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
  .signal { font-size:.75rem; font-weight:700; padding:4px 10px; border-radius:999px; border:1px solid transparent; }
  .sig-ok { background:#e8f4ef; color:var(--teal); }
  .sig-neutral { background:var(--soft); color:#55514a; }
  .sig-warn { background:#fff2dd; color:var(--amber); border-color:#efd7aa; }
  .sig-bad { background:#fbeaef; color:var(--pink); border-color:#e8bfcb; }
  .target-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; }
  .chip { font-size:.74rem; font-weight:600; padding:3px 9px; border-radius:999px; background:var(--soft); color:#55514a; }
  .content-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(260px,.95fr); gap:14px; margin-top:14px; }
  .panel { background:var(--soft-2); border:1px solid var(--line); border-radius:14px; padding:12px 13px; min-width:0; }
  .panel .label { display:block; margin:0 0 6px; color:var(--mut); font-size:.73rem; text-transform:uppercase; letter-spacing:.06em; }
  .preview { font-size:.92rem; white-space:pre-wrap; }
  .panel p { margin:0; font-size:.9rem; }
  .thumbs { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
  .thumbs img { width:auto; height:120px; border-radius:10px; border:1px solid var(--line); display:block; cursor:zoom-in; background:#ece7df; }
  details.edit, details.src { margin-top:14px; }
  details summary { cursor:pointer; list-style:none; color:var(--teal); font-size:.83rem; font-weight:700; }
  details summary::-webkit-details-marker { display:none; }
  details summary::before { content:'▸ '; }
  details[open] summary::before { content:'▾ '; }
  .editor { margin-top:10px; display:grid; gap:12px; }
  .field label { display:block; font-size:.73rem; color:var(--mut); text-transform:uppercase; letter-spacing:.06em; margin:0 0 5px; }
  .cc { float:right; font-size:.8rem; font-weight:600; text-transform:none; letter-spacing:0; color:var(--mut); }
  .cc.over { color:var(--pink); }
  input, textarea { width:100%; border:1px solid var(--line); border-radius:12px; padding:10px 11px; background:#fff; font-size:.92rem; resize:vertical; }
  textarea:focus, input:focus { outline:none; border-color:var(--teal); box-shadow:0 0 0 3px rgba(15,110,86,.12); }
  .pubs { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
  .pchip { font-size:.76rem; font-weight:700; padding:5px 10px; border-radius:999px; border:1px solid transparent; }
  .pchip-ok { background:#e8f4ef; color:var(--teal); }
  .pchip-live { background:#eef3fb; color:#295fb1; }
  .pchip-wait { background:var(--soft); color:#5a554d; }
  .pchip-no { background:#fbeaef; color:var(--pink); }
  .pchip-none { background:#f4f1ea; color:var(--mut); }
  .actions { display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; margin-top:16px; padding-top:14px; border-top:1px solid var(--line); }
  .actions-group { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-start; }
  .actions-main, .actions-side { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .actions-block { display:grid; gap:8px; }
  .actions-label { font-size:.72rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--mut); }
  .actions button { border-radius:999px; padding:9px 14px; border:1px solid transparent; font-size:.84rem; font-weight:700; cursor:pointer; transition:filter .12s; }
  .actions button:hover { filter:brightness(.97); }
  .approve { background:var(--teal); color:#fff; }
  .publish { background:#1d1c18; color:#fff; }
  .save { background:#fff; color:#1d1c18; border-color:var(--line); }
  .save.is-dirty { border-color:rgba(15,110,86,.32); box-shadow:0 0 0 3px rgba(15,110,86,.07); }
  .ghost { background:#fff; color:#5a554d; border-color:var(--line); }
  .danger { background:#fff; color:var(--pink); border-color:#e8bfcb; }
  .pause { background:#fff; color:var(--amber); border-color:#e7cf9a; }
  .resume { background:var(--teal); color:#fff; }
  button[disabled] { opacity:.45; cursor:default; }
  .resched { display:flex; gap:6px; align-items:center; }
  .resched input { width:auto; min-width:160px; }
  .history-list { display:grid; gap:10px; }
  .hist { background:#fff; border:1px solid var(--line); border-radius:14px; padding:12px 14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .hist strong { font-size:.9rem; }
  .small { font-size:.8rem; color:var(--mut); }
  .login { max-width:340px; margin:80px auto 0; background:#fff; border:1px solid var(--line); border-radius:18px; padding:24px; box-shadow:var(--shadow); }
  .login h1 { margin:0; font-size:1.3rem; }
  .login p { margin:8px 0 0; color:var(--mut); }
  .login button { margin-top:16px; width:100%; }
  .empty { color:var(--mut); border:1px dashed var(--line); border-radius:14px; padding:18px; background:rgba(255,255,255,.45); }
  #lightbox { position:fixed; inset:0; z-index:50; background:rgba(20,18,14,.86); display:none; align-items:center; justify-content:center; padding:24px; cursor:zoom-out; }
  #lightbox.on { display:flex; }
  #lightbox img { max-width:100%; max-height:100%; border-radius:12px; }
  @keyframes hi { 0% { background:#fff7e3; } 100% { background:#fff; } }
  .post.hi { animation:hi 2.2s ease-out; }
  @media (max-width:960px) {
    .summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .focus-strip { grid-template-columns:1fr; }
    .content-grid { grid-template-columns:1fr; }
  }
  @media (max-width:720px) {
    .shell { padding:18px 14px 82px; }
    .topbar { margin:0 -14px 16px; padding:14px; }
    .toprow { flex-direction:column; }
    .topactions { width:100%; }
    .summary { grid-template-columns:1fr; }
    .actions { flex-direction:column; align-items:stretch; }
    .actions-main, .actions-side { width:100%; }
    .actions button { width:100%; justify-content:center; }
    .resched { width:100%; flex-direction:column; align-items:stretch; }
    .resched input { width:100%; min-width:0; }
  }
`;

export const SCRIPT = `
(function(){
  document.querySelectorAll('textarea[data-max]').forEach(function(field){
    var max = +field.getAttribute('data-max');
    var out = field.closest('.field') && field.closest('.field').querySelector('.cc');
    if (!out) return;
    function updateCount(){
      var n = field.value.length;
      out.textContent = n + '/' + max;
      out.classList.toggle('over', n > max);
    }
    field.addEventListener('input', updateCount);
    updateCount();
  });
  document.querySelectorAll('.post').forEach(function(form){
    var fields = [].slice.call(form.querySelectorAll('[data-track-dirty="copy"]'));
    if (!fields.length) return;
    var marker = form.querySelector('[data-dirty-state]');
    var saveButton = form.querySelector('[data-save-label]');
    var baseline = JSON.stringify(fields.map(function(field){ return [field.name, field.value]; }));
    function syncDirty(){
      var current = JSON.stringify(fields.map(function(field){ return [field.name, field.value]; }));
      var dirty = current !== baseline;
      form.classList.toggle('is-dirty', dirty);
      if (marker) {
        marker.textContent = dirty ? 'Unsaved edits' : marker.getAttribute('data-clean-label') || 'Saved';
        marker.setAttribute('data-state', dirty ? 'dirty' : 'clean');
      }
      if (saveButton) {
        saveButton.textContent = dirty ? 'Save edits' : 'Save';
        saveButton.classList.toggle('is-dirty', dirty);
      }
    }
    fields.forEach(function(field){
      field.addEventListener('input', syncDirty);
      field.addEventListener('change', syncDirty);
    });
    syncDirty();
  });
  var lightbox = document.getElementById('lightbox');
  var image = lightbox && lightbox.querySelector('img');
  if (lightbox) {
    document.querySelectorAll('img.lb').forEach(function(thumb){
      thumb.addEventListener('click', function(){
        image.src = thumb.getAttribute('data-full') || thumb.src;
        lightbox.classList.add('on');
      });
    });
    lightbox.addEventListener('click', function(){
      lightbox.classList.remove('on');
      image.src = '';
    });
    document.addEventListener('keydown', function(event){
      if (event.key === 'Escape') {
        lightbox.classList.remove('on');
        image.src = '';
      }
    });
  }
  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  var validFilters = ['review', 'approved', 'rejected', 'history', 'all'];
  function applyFilter(show){
    document.querySelectorAll('.section[data-filter-target]').forEach(function(section){
      var filter = section.getAttribute('data-filter-target');
      section.style.display = (show === 'all' || filter === show) ? '' : 'none';
    });
    tabs.forEach(function(tab){
      tab.classList.toggle('on', tab.getAttribute('data-show') === show);
    });
  }
  tabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      var show = tab.getAttribute('data-show');
      if (show) location.hash = show;
      applyFilter(show);
    });
  });
  window.addEventListener('hashchange', function(){
    var show = location.hash.replace('#', '');
    applyFilter(validFilters.indexOf(show) >= 0 ? show : 'review');
  });
  var start = validFilters.indexOf(location.hash.replace('#', '')) >= 0 ? location.hash.replace('#', '') : 'review';
  applyFilter(start);
  var acted = document.getElementById('acted');
  if (acted) {
    var target = document.getElementById(acted.getAttribute('data-target'));
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.classList.add('hi');
    }
  }
})();
`;

const shell = (body) => `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>PLOT control room</title>
<style>${STYLE}</style></head><body>${body}<div id="lightbox"><img alt="full size card"></div><script>${SCRIPT}</script></body></html>`;

export const renderLoginPage = (error = false) => shell(
  `<div class="shell"><div class="login"><h1>PLOT control room</h1><p>Sign in to review and publish.</p>
   <form method="POST" action="/api/admin">
     ${error ? '<div class="flash err" style="margin-top:16px">Incorrect password.</div>' : ''}
     <label style="display:block;font-size:.76rem;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;margin:18px 0 6px;">Password</label>
     <input type="password" name="password" autofocus autocomplete="current-password">
     <button class="approve" type="submit">Sign in</button>
   </form></div></div>`);

const renderPostCard = (post, key, nowIso, supabaseUrl, siteUrl) => {
  const copy = post.copy || {};
  const media = post.media || [];
  const articleLink = articleLinkForPost(post, siteUrl);
  const isQuestion = post.post_type === 'question';
  const isVetoed = post.status === 'vetoed';
  const preview = previewText(post);
  const article = articleSummary(post);
  const headline = headlineForPost(post);
  const signals = quickSignalsForPost(post, nowIso).map((entry) =>
    `<span class="signal ${entry.cls}">${esc(entry.label)}</span>`).join('');
  const targetChips = platformsForPost(post).map((platform) => `<span class="chip">${esc(PLAT_LABEL[platform] || platform)}</span>`).join('');
  const images = media.map((item) => {
    const fullPath = item.portrait_path || item.landscape_path;
    return fullPath ? `<img class="lb" src="${esc(mediaUrl(supabaseUrl, fullPath))}" data-full="${esc(mediaUrl(supabaseUrl, fullPath))}" alt="${esc(copy.alt_text || '')}" loading="lazy">` : '';
  }).join('');
  const tags = Array.isArray(copy.hashtags) ? copy.hashtags.join(', ') : '';
  const body = Array.isArray(copy.page_body) ? copy.page_body.join('\n\n') : (copy.page_body || '');
  const canEdit = !isVetoed && !!(copy.x || copy.instagram || copy.threads || copy.page_title);
  const hasFailed = (post.marketing_post_publications || []).some((entry) => entry.status === 'failed');
  const cleanLabel = post.status === 'approved' ? 'Approved copy' : copySummary(post);
  return `<form id="p-${esc(post.id)}" data-status="${esc(post.status)}" class="post ${post.status === 'approved' ? 'p-ok' : post.status === 'vetoed' ? 'p-no' : 'p-review'}" method="POST" action="/api/admin">
    <input type="hidden" name="key" value="${esc(key)}">
    <input type="hidden" name="id" value="${esc(post.id)}">
    <div class="post-top">
      <div class="post-copy">
        <div class="post-title">
          <span class="kind">${esc(TYPE_LABELS[post.post_type] || String(post.post_type || '').replace(/_/g, ' '))}</span>
          <span class="when">${esc(fmtDay(post.scheduled_for))} · ${esc(fmtTime(post.scheduled_for))}</span>
        </div>
        <p class="headline">${esc(headline)}</p>
        <div class="state-row">
          ${badge(post.status)}
          <span class="copy-state" data-dirty-state data-clean-label="${esc(cleanLabel)}" data-state="clean">${esc(cleanLabel)}</span>
        </div>
        <p class="why">${esc(reasonForPost(post))}</p>
        <p class="timing">${esc(publishTimingLabel(post, nowIso))}</p>
        ${signals ? `<div class="signals">${signals}</div>` : ''}
        <div class="target-row">
          ${isVetoed ? '<span class="chip">Won’t publish</span>' : targetChips}
          ${articleLink ? `<a class="chip" href="${esc(articleLink)}" target="_blank">article ↗</a>` : ''}
        </div>
      </div>
    </div>
    <div class="content-grid">
      <div class="panel">
        <span class="label">Social preview</span>
        <div class="preview">${esc(preview || 'No social copy yet')}</div>
      </div>
      <div class="panel">
        <span class="label">${isQuestion ? 'Article' : 'Article title'}</span>
        <p>${esc(article)}</p>
      </div>
    </div>
    ${images ? `<div class="thumbs">${images}</div>` : ''}
    ${canEdit ? `<details class="edit"${post.status === 'needs_review' ? ' open' : ''}><summary>Edit copy and article</summary>
      <div class="editor">
        <div class="field"><label>X <span class="cc"></span></label><textarea name="x" rows="2" data-max="280" data-track-dirty="copy">${esc(copy.x || '')}</textarea></div>
        ${isQuestion ? '' : `<div class="field"><label>Instagram <span class="cc"></span></label><textarea name="instagram" rows="3" data-max="2200" data-track-dirty="copy">${esc(copy.instagram || '')}</textarea></div>`}
        ${isQuestion ? '' : `<div class="field"><label>Threads <span class="cc"></span></label><textarea name="threads" rows="2" data-max="500" data-track-dirty="copy">${esc(copy.threads || '')}</textarea></div>`}
        ${isQuestion ? '' : `<div class="field"><label>Hashtags (comma separated)</label><input name="hashtags" value="${esc(tags)}" data-track-dirty="copy"></div>`}
        ${isQuestion ? '' : `<div class="field"><label>Article title</label><input name="page_title" value="${esc(copy.page_title || '')}" data-track-dirty="copy"></div>`}
        ${isQuestion ? '' : `<div class="field"><label>Article body (blank line between paragraphs)</label><textarea name="page_body" rows="8" data-track-dirty="copy">${esc(body)}</textarea></div>`}
      </div>
    </details>` : ''}
    ${copy.sources?.length ? `<details class="src"><summary>Sources (${copy.sources.length})</summary><div class="pubs">${copy.sources.map((source) => `<a class="pchip pchip-none" href="${esc(source.url)}" target="_blank">${esc(source.title)}</a>`).join('')}</div></details>` : ''}
    ${renderPublicationChips(post)}
    <div class="actions">
      <div class="actions-group">
        <div class="actions-block">
          <span class="actions-label">Decide</span>
          <div class="actions-main">
            ${canEdit && post.status !== 'approved' ? `<button class="approve" name="action" value="approve">Approve</button>` : ''}
            ${canEdit ? `<button class="publish" name="action" value="publish_now"${confirm('Publish now? It goes straight to your socials.')}>Publish now</button>` : ''}
            ${canEdit ? `<button class="save" data-save-label="1" name="action" value="save">Save</button>` : ''}
            ${post.status === 'approved' ? `<button class="ghost" name="action" value="unapprove">Unapprove</button>` : ''}
            ${hasFailed ? `<button class="ghost" name="action" value="retry">Retry failed</button>` : ''}
            ${!isVetoed ? `<button class="danger" name="action" value="reject"${confirm('Reject this post? It will not publish.')}>Reject</button>` : `<button class="ghost" name="action" value="unapprove">Restore</button>`}
          </div>
        </div>
      </div>
      <div class="actions-group">
        <div class="actions-block">
          <span class="actions-label">Adjust</span>
          <div class="actions-side">
            ${!isVetoed ? `<span class="resched"><input type="date" name="scheduled_date" value="${esc(dayKey(post.scheduled_for))}"><button class="ghost" name="action" value="reschedule">Reschedule</button></span>` : ''}
            ${canEdit ? `<button class="ghost" name="action" value="regenerate"${confirm('Regenerate? This replaces the current copy with a fresh version.')}>Regenerate</button>` : ''}
          </div>
        </div>
      </div>
    </div>
  </form>`;
};

const renderHistoryLine = (post, metrics) => {
  const live = (post.marketing_post_publications || []).filter((entry) => entry.permalink);
  const links = live.map((entry) => `<a href="${esc(entry.permalink)}" target="_blank">${esc(PLAT_LABEL[entry.platform] || entry.platform)}</a>`).join(' · ');
  const totals = (post.marketing_post_publications || []).reduce((acc, entry) => {
    const metric = metrics.get(entry.id);
    if (metric) {
      acc.views += metric.views || 0;
      acc.likes += metric.likes || 0;
    }
    return acc;
  }, { views: 0, likes: 0 });
  const stats = (totals.views || totals.likes) ? `<span class="small">Views ${compact(totals.views)} · Likes ${compact(totals.likes)}</span>` : '';
  return `<div class="hist">
    <strong>${esc(TYPE_LABELS[post.post_type] || String(post.post_type || '').replace(/_/g, ' '))}</strong>
    <span class="small">${esc(fmtDay(post.scheduled_for))}</span>
    ${badge(post.status)}
    <span class="small">${links || 'No live links captured'}</span>
    ${stats}
  </div>`;
};

const renderSection = ({ filter, title, subtitle, posts, key, nowIso, supabaseUrl, siteUrl, emptyMessage, countLabel }) => {
  const dayGroups = groupByDay(posts);
  const body = dayGroups.length
    ? dayGroups.map((day) => `<div class="day"><div class="dayhead">${esc(day.label)}</div><div class="post-grid">${day.posts.map((post) => renderPostCard(post, key, nowIso, supabaseUrl, siteUrl)).join('')}</div></div>`).join('')
    : `<p class="empty">${esc(emptyMessage)}</p>`;
  return `<section class="section" data-filter-target="${esc(filter)}">
    <div class="section-head">
      <div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
      <div class="section-count">${esc(countLabel)}</div>
    </div>
    ${body}
  </section>`;
};

export const renderControlDeskPage = ({ active, history, metrics, paused, flash, acted, key, nowIso, supabaseUrl, siteUrl = 'https://theplot.tv' }) => {
  const counts = buildCounts(active, history, nowIso);
  const sections = groupPostsForDisplay(active);
  const topbar = `<div class="topbar">
    <div class="toprow">
      <div class="topcopy">
        <h1>PLOT control room</h1>
        <p>Review the queue, save edits, and publish approved posts. The publish worker checks every 5 minutes.</p>
      </div>
      <div class="topactions">
        <form method="POST" action="/api/admin"><input type="hidden" name="key" value="${esc(key)}"><button class="approve" name="action" value="approve_all"${counts.ready ? confirm(`Approve all ${counts.ready} posts awaiting review?`) : ' disabled'}>Approve week${counts.ready ? ` (${counts.ready})` : ''}</button></form>
        <form method="POST" action="/api/admin"><input type="hidden" name="key" value="${esc(key)}"><button class="${paused ? 'resume' : 'pause'}" name="action" value="${paused ? 'resume' : 'pause'}"${paused ? '' : confirm('Pause all publishing? Approved posts will not be sent until you resume.')}>${paused ? 'Resume' : 'Pause'}</button></form>
      </div>
    </div>
    <div class="summary">
      <div class="summary-card focus"><span>Needs review</span><strong>${counts.ready}</strong><p>${counts.reviewQueue} in the queue overall · ${counts.building} still processing</p><a href="#review">Open review queue</a></div>
      <div class="summary-card"><span>Due now</span><strong>${counts.dueNow}</strong><p>Approved posts waiting on the next publish check</p><a href="#approved">Jump to approved</a></div>
      <div class="summary-card"><span>Failures</span><strong>${counts.failed}</strong><p>Platform sends that still need a retry or review</p><a href="#approved">Check publish state</a></div>
      <div class="summary-card"><span>Published recently</span><strong>${counts.published}</strong><p>Resolved posts with links and captured metrics</p><a href="#history">Open log</a></div>
    </div>
    <div class="focus-strip">
      <div class="focus-note"><strong>Start in Needs review</strong><p>This view now opens on the active queue so approvals do not compete with history and cleanup.</p></div>
      <div class="focus-note"><strong>Publish now saves edits first</strong><p>Use it when the copy is final and should go out straight away. Scheduled publishing still checks every 5 minutes.</p></div>
      <div class="focus-note"><strong>Watch the status chips</strong><p>Queued, publishing, live, and failed states are shown per channel so send problems are easier to catch.</p></div>
    </div>
    <div class="filters">
      <button type="button" class="tab on" data-show="review">Needs review</button>
      <button type="button" class="tab" data-show="approved">Approved</button>
      <button type="button" class="tab" data-show="rejected">Rejected</button>
      <button type="button" class="tab" data-show="history">Published</button>
      <button type="button" class="tab" data-show="all">All queues</button>
    </div>
  </div>`;
  const sectionsHtml = [
    renderSection({
      filter: 'review',
      title: 'Needs review',
      subtitle: 'Posts waiting for a decision or still moving through generation.',
      posts: sections.reviewQueue,
      key,
      nowIso,
      supabaseUrl,
      siteUrl,
      emptyMessage: 'Nothing is waiting in the review queue right now.',
      countLabel: `${counts.reviewQueue} post${counts.reviewQueue === 1 ? '' : 's'}`,
    }).replace('<section class="section"', '<section id="review" class="section"'),
    renderSection({
      filter: 'approved',
      title: 'Approved',
      subtitle: 'Posts already cleared for their scheduled slots or ready for the next publish check.',
      posts: sections.approved,
      key,
      nowIso,
      supabaseUrl,
      siteUrl,
      emptyMessage: 'No posts are currently approved.',
      countLabel: `${counts.approved} post${counts.approved === 1 ? '' : 's'}`,
    }).replace('<section class="section"', '<section id="approved" class="section"'),
    renderSection({
      filter: 'rejected',
      title: 'Rejected',
      subtitle: 'Posts removed from the queue but still available to restore.',
      posts: sections.rejected,
      key,
      nowIso,
      supabaseUrl,
      siteUrl,
      emptyMessage: 'No rejected posts at the moment.',
      countLabel: `${counts.rejected} post${counts.rejected === 1 ? '' : 's'}`,
    }).replace('<section class="section"', '<section id="rejected" class="section"'),
  ].join('');
  const historyHtml = history.length
    ? `<section id="history" class="section" data-filter-target="history"><div class="section-head"><div><h2>Published recently</h2><p>Compact operator log of the last resolved posts.</p></div><div class="section-count">${history.length} entries</div></div><div class="history-list">${history.map((post) => renderHistoryLine(post, metrics)).join('')}</div></section>`
    : '';
  return shell(`<div class="shell">${topbar}
    ${paused ? '<div class="paused-note">Publishing is paused — approved posts will not be sent until you resume.</div>' : ''}
    ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
    ${acted ? `<span id="acted" data-target="p-${esc(acted)}"></span>` : ''}
    ${sectionsHtml}
    ${historyHtml}
  </div>`);
};
