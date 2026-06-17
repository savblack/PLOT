// Weekly subscriber digest (Thursday). A designed HTML email:
//   • a rich featured title (#1 on the chart) with ratings, cast, blurb, quote,
//     and where to watch
//   • the rest of the chart (ranks 2–5)
//   • weekend watch — highly-rated recent streaming releases
//   • new on streaming — titles that hit a platform in the last week
// Titles are de-duped across sections; every row carries a poster + a platform.
import { getSupabase, supabaseUrl } from '../lib/supabase.mjs';
import { sendBatch, FROM_MARKETING } from '../lib/email.mjs';
import { recentSnapshots, withMovement } from '../lib/trending.mjs';
import { tmdb } from '../lib/tmdb.mjs';
import { getRatings } from '../lib/omdb.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SITE = 'https://theplot.tv';
const APP = 'https://app.theplot.tv';
const REGION = 'US';
const utm = (campaign) => `${SITE}?utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}`;
const CHART_URL = `${SITE}/whats-on/chart?utm_source=newsletter&utm_medium=email&utm_campaign=chart`;
const DRY_RUN = process.env.DRY_RUN === '1'; // build + print the HTML, send to no one

const tmdbImg = (path, size = 'w185') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : '');
const andList = (names) => (names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const trim = (s, n) => { const t = String(s || '').trim(); if (t.length <= n) return t; return `${t.slice(0, n).replace(/\s+\S*$/, '')}…`; };
// Normalise provider names: collapse Netflix tiers to plain "Netflix" and drop
// "… with Ads" variants, then de-dupe (so we never show "Netflix Standard with Ads").
const cleanProvider = (n) => {
  const s = String(n).replace(/\s+(Standard|Basic|Premium)?\s*with Ads$/i, '').trim();
  return /^netflix/i.test(s) ? 'Netflix' : s;
};
const normProviders = (names) => [...new Set((names || []).map(cleanProvider))];

const providersOf = (details) => {
  const r = details?.['watch/providers']?.results || {};
  return normProviders(((r[REGION] || r.US)?.flatrate || []).map(p => p.provider_name));
};

// ── brand tokens ──
const INK = '#0c0c0c', MUT = '#6b6b70', FAINT = '#a1a1a6', PINK = '#E05578';
const HAIR = '#e7e6e3', PAPER = '#f4f4f5';
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// One-click "Save to watchlist" deep link. Returns '' for anything that isn't a
// valid movie/tv title, so callers can drop it in unconditionally. Logged-out
// readers are routed through login and the save completes on return (handled by
// the app's /save route). `src=newsletter` tags the PostHog event.
const saveUrl = ({ tmdb_id, media_type } = {}) => {
  const id = Number(tmdb_id);
  if (!Number.isInteger(id) || id <= 0) return '';
  if (media_type !== 'movie' && media_type !== 'tv') return '';
  return `${APP}/save?media_type=${media_type}&tmdb_id=${id}&src=newsletter`;
};
// Small inline "+ Save" text link for compact rows.
const saveTextLink = (item, px = 13) => {
  const u = saveUrl(item);
  return u ? `<a href="${u}" style="font-family:${SANS};font-size:${px}px;font-weight:600;color:${PINK};text-decoration:none;white-space:nowrap;">+ Save</a>` : '';
};
// Filled pill button for the featured title.
const saveButton = (item) => {
  const u = saveUrl(item);
  return u ? `<a href="${u}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-family:${SANS};font-size:14px;font-weight:500;padding:12px 28px;border-radius:9999px;">+ Save to your watchlist</a>` : '';
};

const moveChip = (m) => {
  if (!m || m.dir === 'none' || m.dir === 'same') return '';
  const s = `font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.04em;`;
  if (m.dir === 'new') return `<span style="${s}color:${PINK};">NEW</span>`;
  if (m.dir === 'up') return `<span style="${s}color:#0F6E56;">&#9650; ${m.delta}</span>`;
  if (m.dir === 'down') return `<span style="${s}color:#B03A5E;">&#9660; ${m.delta}</span>`;
  return '';
};

const sectionHead = (label) => `
  <tr><td style="padding:38px 32px 2px;">
    <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${INK};">${esc(label)}</div>
    <div style="width:30px;height:2px;background:${PINK};margin-top:11px;font-size:0;line-height:0;">&nbsp;</div>
  </td></tr>`;

// Ranks 2–10 as two compact columns (2–5 left, 6–10 right).
const chartTwoColumn = (items) => {
  const cell = (i) => {
    const mv = moveChip(i.movement);
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>
      <td width="20" valign="top" style="font-family:${SERIF};font-size:19px;line-height:1;color:${PINK};text-align:center;padding-top:2px;">${i.rank}</td>
      <td width="40" valign="top" style="padding-left:9px;">
        ${i.poster_path ? `<img src="${esc(tmdbImg(i.poster_path, 'w92'))}" width="40" height="60" alt="" style="display:block;width:40px;height:60px;object-fit:cover;border-radius:5px;border:1px solid ${HAIR};background:#ececec;">` : `<div style="width:40px;height:60px;border-radius:5px;background:${INK};"></div>`}
      </td>
      <td valign="middle" style="padding-left:11px;">
        <div style="font-family:${SERIF};font-size:16px;line-height:1.12;color:${INK};">${esc(i.title)}</div>
        <div style="font-family:${SANS};font-size:12px;line-height:1.3;color:${MUT};margin-top:3px;">${i.media_type === 'tv' ? 'TV' : 'Film'}${mv ? ` &middot; ${mv}` : ''}</div>
        ${saveTextLink(i, 12) ? `<div style="margin-top:5px;">${saveTextLink(i, 12)}</div>` : ''}
      </td>
    </tr></table>`;
  };
  const col = (list) => list.map(cell).join('');
  return `${sectionHead('The top 10')}
    <tr><td style="padding:8px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="50%" valign="top" style="padding-right:14px;">${col(items.slice(0, 5))}</td>
        <td width="50%" valign="top" style="padding-left:14px;">${col(items.slice(5))}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:10px 32px 0;text-align:right;"><a href="${CHART_URL}" style="font-family:${SANS};font-size:13px;font-weight:600;color:${PINK};text-decoration:none;">See the full top 20 &rarr;</a></td></tr>`;
};

const featuredBlock = (f, kicker) => {
  const heroImg = tmdbImg(f.backdrop_path, 'w780') || tmdbImg(f.poster_path, 'w500');
  const b = (v) => `<b style="color:${INK};font-weight:700;">${esc(v)}</b>`;
  const ratings = f.ratings ? [
    f.ratings.tmdb ? `TMDB ${b(f.ratings.tmdb)}` : null,
    f.ratings.rottenTomatoes ? `Rotten Tomatoes ${b(f.ratings.rottenTomatoes)}` : null,
    f.ratings.metacritic ? `Metacritic ${b(f.ratings.metacritic)}` : null,
  ].filter(Boolean).join(' &nbsp;&middot;&nbsp; ') : '';
  const credits = [
    f.cast?.length ? `Starring ${esc(andList(f.cast))}` : null,
    f.director ? `Directed by ${esc(f.director)}` : null,
  ].filter(Boolean).join(' &middot; ');
  return `
    <tr><td style="padding:28px 32px 0;">
      ${heroImg ? `<img src="${esc(heroImg)}" width="536" alt="" style="display:block;width:100%;height:auto;border-radius:12px;border:1px solid ${HAIR};">` : ''}
      <div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${PINK};margin-top:18px;">${esc(kicker)}</div>
      <div style="font-family:${SERIF};font-size:33px;line-height:1.04;letter-spacing:-0.01em;color:${INK};margin-top:6px;">${esc(f.title)}</div>
      ${ratings ? `<div style="font-family:${SANS};font-size:13px;color:${MUT};margin-top:12px;">${ratings}</div>` : ''}
      ${f.overview ? `<div style="font-family:${SANS};font-size:15px;line-height:1.6;color:#27272a;margin-top:14px;">${esc(trim(f.overview, 280))}</div>` : ''}
      ${credits ? `<div style="font-family:${SANS};font-size:13px;line-height:1.5;color:${MUT};margin-top:12px;">${credits}</div>` : ''}
      ${f.providers?.length ? `<div style="font-family:${SANS};font-size:13px;color:${MUT};margin-top:16px;">Where to watch: <b style="color:${INK};">${esc(f.providers.slice(0, 3).join(', '))}</b></div>` : ''}
      ${saveButton(f) ? `<div style="margin-top:22px;">${saveButton(f)}</div>` : ''}
    </td></tr>`;
};

// Three curated weekend picks, each a labelled mini-feature (larger poster).
const weekendBlock = (picks) => {
  const card = (p) => `
    <tr><td style="padding:18px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="78" valign="top">
          <img src="${esc(tmdbImg(p.poster_path, 'w185'))}" width="78" height="117" alt="" style="display:block;width:78px;height:117px;object-fit:cover;border-radius:8px;border:1px solid ${HAIR};background:#ececec;">
        </td>
        <td valign="top" style="padding-left:17px;">
          <div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:${PINK};">${esc(p.label)}</div>
          <div style="font-family:${SERIF};font-size:21px;line-height:1.12;color:${INK};margin-top:5px;">${esc(p.title)}</div>
          <div style="font-family:${SANS};font-size:13px;line-height:1.45;color:${MUT};margin-top:7px;">${p.meta}</div>
          ${saveTextLink(p) ? `<div style="margin-top:9px;">${saveTextLink(p)}</div>` : ''}
        </td>
      </tr></table>
    </td></tr>`;
  return `${sectionHead('Weekend watch')}${picks.map(card).join('')}`;
};

// "New on streaming" as a poster gallery (3 across) — the email-safe stand-in
// for a carousel — each with its star rating and platform.
const streamingGallery = (items) => {
  const cell = (t) => t ? `
    <td width="33.33%" valign="top" style="padding:16px 6px 0;">
      <img src="${esc(tmdbImg(t.poster_path, 'w342'))}" width="166" height="249" alt="" style="display:block;width:100%;height:249px;object-fit:cover;border-radius:8px;border:1px solid ${HAIR};background:#ececec;">
      <div style="font-family:${SERIF};font-size:17px;line-height:1.12;color:${INK};margin-top:9px;">${esc(t.title)}</div>
      <div style="font-family:${SANS};font-size:12px;line-height:1.4;color:${MUT};margin-top:4px;">${t.vote ? `&#9733; ${t.vote.toFixed(1)} &middot; ` : ''}${esc(t.providers[0])}</div>
      ${saveTextLink(t, 12) ? `<div style="margin-top:6px;">${saveTextLink(t, 12)}</div>` : ''}
    </td>` : '<td width="33.33%" style="font-size:0;line-height:0;">&nbsp;</td>';
  const rows = [];
  for (let i = 0; i < items.length; i += 3) rows.push([items[i], items[i + 1], items[i + 2]]);
  return `${sectionHead('New on streaming')}
    <tr><td style="padding:0 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}
      </table>
    </td></tr>`;
};

const buildHtml = ({ dateLabel, featured, kicker, chart, weekend, streaming }, unsubscribeUrl) => {
  const chartRows = chart.length ? chartTwoColumn(chart) : '';

  const streamingRows = streaming.length ? streamingGallery(streaming) : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap" rel="stylesheet">
<title>This week in film &amp; TV</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:30px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${HAIR};border-radius:16px;">
      <tr><td style="padding:44px 32px 0;text-align:center;">
        <div style="font-family:${SERIF};font-size:58px;line-height:0.9;letter-spacing:-0.03em;color:${INK};">PLOT</div>
        <div style="font-family:${SANS};font-size:12px;font-weight:400;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};margin-top:14px;">This week in film &amp; TV &middot; ${esc(dateLabel)}</div>
      </td></tr>
      ${featured ? featuredBlock(featured, kicker) : ''}
      ${chartRows}
      ${weekend.length ? weekendBlock(weekend) : ''}
      ${streamingRows}
      <tr><td style="padding:36px 32px 38px;text-align:center;">
        <a href="${utm('weekly_digest')}" style="display:inline-block;background:transparent;color:${INK};border:1px solid ${INK};text-decoration:none;font-family:${SANS};font-size:14px;font-weight:400;padding:13px 34px;border-radius:9999px;">Build your watchlist &rarr;</a>
      </td></tr>
      <tr><td style="padding:22px 32px 26px;border-top:1px solid ${HAIR};background:#fafafa;border-radius:0 0 16px 16px;">
        <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${FAINT};">
          You're receiving this because you subscribed at theplot.tv.
          <a href="${unsubscribeUrl}" style="color:${FAINT};text-decoration:underline;">Unsubscribe</a><br>
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
};

const main = async () => {
  const supabase = getSupabase();
  const now = new Date();

  // Chart from the latest snapshot (top 5, movement vs the prior week).
  const snaps = await recentSnapshots(supabase, 2);
  const allChart = snaps[0]?.items ? withMovement(snaps[0].items, snaps[1]?.items || null) : [];

  const seen = new Set();
  allChart.slice(0, 10).forEach(i => seen.add(i.tmdb_id));

  // Featured = #1 on the chart, enriched with TMDB + OMDb.
  const lead = allChart[0] || null;
  let featured = null;
  if (lead) {
    const d = await tmdb.getTitleDetails(lead.media_type, lead.tmdb_id).catch(() => null);
    const omdb = await getRatings(d?.external_ids?.imdb_id).catch(() => null);
    // TMDB is almost always present; Rotten Tomatoes + Metacritic come from OMDb.
    const ratings = {
      tmdb: d?.vote_average ? d.vote_average.toFixed(1) : null,
      rottenTomatoes: omdb?.rotten_tomatoes || null,
      metacritic: omdb?.metacritic || null,
    };
    const cast = (d?.credits?.cast || []).filter(c => (c.popularity || 0) >= 6).slice(0, 2).map(c => c.name);
    let director = null;
    if (lead.media_type === 'movie') {
      director = (d?.credits?.crew || []).find(c => c.job === 'Director' && (c.popularity || 0) >= 4)?.name || null;
    } else {
      director = (d?.created_by || [])[0]?.name || null;
    }
    featured = {
      ...lead,
      overview: d?.overview || '',
      ratings,
      cast,
      director,
      providers: providersOf(d),
    };
  }

  // The top 10, two columns (1–5 / 6–10). #1 is also the featured block above;
  // repeating it here keeps the two columns equal length.
  const chart = allChart.slice(0, 10);

  // Weekend watch: three curated picks, each de-duped and with a named platform.
  const iso = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const providerNames = (type, id) => tmdb.getWatchProviders(type, id).then(a => a.map(x => x.provider_name)).catch(() => []);
  const star = (v) => (v ? `&#9733; ${v.toFixed(1)} &middot; ` : '');
  const weekend = [];

  // 1) The most talked-about movie: trending this week, streamable.
  for (const m of await tmdb.getTrending('movie', 'week').catch(() => [])) {
    if (seen.has(m.id)) continue;
    const provs = await providerNames('movie', m.id);
    if (!provs.length) continue;
    seen.add(m.id);
    weekend.push({ label: "The movie everyone's talking about", title: m.title || m.name, poster_path: m.poster_path, meta: `${star(m.vote_average)}${esc(provs[0])}`, tmdb_id: m.id, media_type: 'movie' });
    break;
  }

  // 2) The series to binge: a recent show with all episodes out, streamable.
  for (const s of await tmdb.getRecentPopularTV(iso(120)).catch(() => [])) {
    if (seen.has(s.id)) continue;
    const det = await tmdb.getDetails('tv', s.id).catch(() => null);
    if (!det) continue;
    const complete = det.status === 'Ended' || det.status === 'Canceled' || !det.next_episode_to_air;
    if (!complete || (det.number_of_episodes || 0) < 6) continue;
    const provs = await providerNames('tv', s.id);
    if (!provs.length) continue;
    seen.add(s.id);
    weekend.push({ label: 'The series to binge', title: s.name || s.title, poster_path: s.poster_path, meta: `${star(det.vote_average)}All ${det.number_of_episodes} episodes on ${esc(provs[0])}`, tmdb_id: s.id, media_type: 'tv' });
    break;
  }

  // New on streaming: recent digital/TV releases, newest first, that have a
  // real rating and a named platform. Skipping unrated brand-new titles means
  // reaching a little further back, so we look over the last few weeks.
  const rel = await tmdb.getReleasesInWindow(iso(30), iso(1)).catch(() => ({ digital: [], tv: [] }));
  const relDate = (c) => c.release_date || c.first_air_date || '';
  const candidates = [...(rel.digital || []), ...(rel.tv || [])]
    .filter(c => c.poster_path && (c.vote_average || 0) > 0 && (c.vote_count || 0) >= 5)
    .sort((a, b) => relDate(b).localeCompare(relDate(a))); // newest first
  const streaming = [];
  for (const c of candidates) {
    if (streaming.length >= 3) break;
    if (seen.has(c.id)) continue;
    const provs = await providerNames(c.media_type, c.id);
    if (!provs.length) continue;
    seen.add(c.id);
    streaming.push({ title: c.title || c.name, poster_path: c.poster_path, providers: provs, vote: c.vote_average, tmdb_id: c.id, media_type: c.media_type });
  }

  if (!featured && !chart.length && !weekend.length && !streaming.length) {
    console.log('No content this week — skipping newsletter.');
    return;
  }

  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const data = { dateLabel, featured, kicker: "This week's No.1", chart, weekend, streaming };

  if (DRY_RUN) {
    process.stdout.write(buildHtml(data, `${SITE}/?unsubscribe_preview`));
    return;
  }

  const { data: subscribers } = await supabase
    .from('marketing_subscribers')
    .select('email, unsubscribe_token')
    .eq('status', 'active');

  if (!subscribers?.length) {
    console.log('No active subscribers — skipping newsletter.');
    return;
  }

  const messages = subscribers.map(sub => {
    const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-subscribe?action=unsubscribe&token=${sub.unsubscribe_token}`;
    return {
      from: FROM_MARKETING,
      to: [sub.email],
      subject: 'This week in film & TV — PLOT',
      html: buildHtml(data, unsubscribeUrl),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  });

  for (let i = 0; i < messages.length; i += 100) {
    await sendBatch(messages.slice(i, i + 100));
  }
  console.log(`Newsletter sent to ${messages.length} subscriber(s).`);
};

main().catch((err) => { console.error(err); process.exit(1); });
