const SITE = 'https://theplot.tv';
const APP = 'https://app.theplot.tv';
const REGION = Deno.env.get('MARKETING_REGION') || 'US';
const TMDB_KEY = Deno.env.get('TMDB_API_KEY') || '';
const OMDB_KEY = Deno.env.get('OMDB_API_KEY') || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS = [400, 1200];
const ISSUE_WEEK_OFFSET: Record<string, number> = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const utm = (campaign: string) => `${SITE}?utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}`;
const CHART_URL = `${SITE}/whats-on/chart?utm_source=newsletter&utm_medium=email&utm_campaign=chart`;
const INK = '#0c0c0c';
const MUT = '#6b6b70';
const FAINT = '#a1a1a6';
const PINK = '#E05578';
const HAIR = '#e7e6e3';
const PAPER = '#f4f4f5';
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const addDays = (dateString: string, days: number) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
};

const tzDateParts = (date = new Date(), timeZone = 'Australia/Sydney') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(date);
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${lookup('year')}-${lookup('month')}-${lookup('day')}`,
    weekday: lookup('weekday') || 'Thursday',
  };
};

const str = (s: unknown) => JSON.stringify(String(s ?? ''));
const tmdbImg = (path: string | null, size = 'w185') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : '');
const trim = (s: string, n: number) => {
  const t = String(s || '').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n).replace(/\s+\S*$/, '')}…`;
};
const cleanProvider = (name: string) => {
  const s = String(name).replace(/\s+(Standard|Basic|Premium)?\s*with Ads$/i, '').trim();
  return /^netflix/i.test(s) ? 'Netflix' : s;
};
const normProviders = (names: string[] = []) => [...new Set(names.map(cleanProvider))];
const andList = (names: string[]) => (names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

const fetchTMDB = async (endpoint: string, params: Record<string, string> = {}) => {
  if (!TMDB_KEY) throw new Error('TMDB_API_KEY is not set');
  const query = new URLSearchParams({ language: 'en-US', region: REGION, ...params });
  const headers: Record<string, string> = {};
  if (TMDB_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else query.set('api_key', TMDB_KEY);
  const url = `${TMDB_BASE}/${endpoint.replace(/^\//, '')}?${query}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (RETRY_STATUSES.has(res.status) && attempt < RETRY_DELAYS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
      continue;
    }
    throw new Error(`TMDB ${res.status} for ${endpoint}`);
  }
  return null;
};

const getTrending = async () => {
  const pages = await Promise.all([1, 2].map((page) => fetchTMDB('/trending/all/week', { page: String(page) })));
  return pages.flatMap((page: any) => page?.results || []);
};

const getWatchProviders = async (mediaType: string, id: number) => {
  const data = await fetchTMDB(`/${mediaType}/${id}/watch/providers`);
  const regionData = data?.results?.[REGION] || data?.results?.US;
  return regionData?.flatrate || [];
};

const getTitleDetails = (mediaType: string, id: number) =>
  fetchTMDB(`/${mediaType}/${id}`, { append_to_response: 'external_ids,credits,watch/providers' });

const getRecentPopularTV = async (sinceDate: string) => {
  const data = await fetchTMDB('/discover/tv', {
    'first_air_date.gte': sinceDate,
    'first_air_date.lte': new Date().toISOString().slice(0, 10),
    'vote_count.gte': '30',
    sort_by: 'popularity.desc',
  });
  return (data?.results || []).map((entry: any) => ({ ...entry, media_type: 'tv' }));
};

const getReleasesInWindow = async (fromDate: string, toDate: string) => {
  const movieParams = { 'release_date.gte': fromDate, 'release_date.lte': toDate, sort_by: 'popularity.desc' };
  const [digital, tv] = await Promise.all([
    fetchTMDB('/discover/movie', { ...movieParams, with_release_type: '4' }),
    fetchTMDB('/discover/tv', { 'first_air_date.gte': fromDate, 'first_air_date.lte': toDate, sort_by: 'popularity.desc' }),
  ]);
  return {
    digital: (digital?.results || []).map((entry: any) => ({ ...entry, media_type: 'movie' })),
    tv: (tv?.results || []).map((entry: any) => ({ ...entry, media_type: 'tv' })),
  };
};

const getRatings = async (imdbId: string | null) => {
  if (!OMDB_KEY || !imdbId) return null;
  const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(OMDB_KEY)}&i=${encodeURIComponent(imdbId)}&tomatoes=true`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || data.Response === 'False') return null;
  const fromRatings = (source: string) => data.Ratings?.find((rating: any) => rating.Source === source)?.Value || null;
  const ok = (value: string | null) => (value && value !== 'N/A' ? value : null);
  const ratings = {
    imdb: ok(data.imdbRating),
    rotten_tomatoes: fromRatings('Rotten Tomatoes'),
    metacritic: fromRatings('Metacritic') || (ok(data.Metascore) ? `${data.Metascore}/100` : null),
  };
  if (!ratings.imdb && !ratings.rotten_tomatoes && !ratings.metacritic) return null;
  return ratings;
};

const movementFor = (item: any, rank: number, prior: any[] | null) => {
  if (!prior) return { dir: 'none' };
  const prev = prior.find((entry) => entry.tmdb_id === item.tmdb_id && entry.media_type === item.media_type);
  if (!prev) return { dir: 'new' };
  if (prev.rank === rank) return { dir: 'same' };
  return prev.rank > rank ? { dir: 'up', delta: prev.rank - rank } : { dir: 'down', delta: rank - prev.rank };
};

const withMovement = (items: any[], priorItems: any[] | null) =>
  items.map((item) => {
    const movement = movementFor(item, item.rank, priorItems);
    return { ...item, movement };
  });

const saveUrl = ({ tmdb_id, media_type }: { tmdb_id?: number; media_type?: string }) => {
  const id = Number(tmdb_id);
  if (!Number.isInteger(id) || id <= 0) return '';
  if (media_type !== 'movie' && media_type !== 'tv') return '';
  return `${APP}/save?media_type=${media_type}&tmdb_id=${id}&src=newsletter`;
};

const saveTextLink = (item: any, px = 13) => {
  const url = saveUrl(item);
  return url ? `<a href="${url}" style="font-family:${SANS};font-size:${px}px;font-weight:600;color:${PINK};text-decoration:none;white-space:nowrap;">+ Save</a>` : '';
};

const saveButton = (item: any) => {
  const url = saveUrl(item);
  return url ? `<a href="${url}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-family:${SANS};font-size:14px;font-weight:500;padding:12px 28px;border-radius:9999px;">+ Save to your watchlist</a>` : '';
};

const moveChip = (movement: any) => {
  if (!movement || movement.dir === 'none' || movement.dir === 'same') return '';
  const style = `font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.04em;`;
  if (movement.dir === 'new') return `<span style="${style}color:${PINK};">NEW</span>`;
  if (movement.dir === 'up') return `<span style="${style}color:#0F6E56;">&#9650; ${movement.delta}</span>`;
  if (movement.dir === 'down') return `<span style="${style}color:#B03A5E;">&#9660; ${movement.delta}</span>`;
  return '';
};

const sectionHead = (label: string) => `
  <tr><td style="padding:38px 32px 2px;">
    <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${INK};">${esc(label)}</div>
    <div style="width:30px;height:2px;background:${PINK};margin-top:11px;font-size:0;line-height:0;">&nbsp;</div>
  </td></tr>`;

const chartTwoColumn = (items: any[]) => {
  const cell = (item: any) => {
    const movement = moveChip(item.movement);
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>
      <td width="20" valign="top" style="font-family:${SERIF};font-size:19px;line-height:1;color:${PINK};text-align:center;padding-top:2px;">${item.rank}</td>
      <td width="40" valign="top" style="padding-left:9px;">
        ${item.poster_path ? `<img src="${esc(tmdbImg(item.poster_path, 'w92'))}" width="40" height="60" alt="" style="display:block;width:40px;height:60px;object-fit:cover;border-radius:5px;border:1px solid ${HAIR};background:#ececec;">` : `<div style="width:40px;height:60px;border-radius:5px;background:${INK};"></div>`}
      </td>
      <td valign="middle" style="padding-left:11px;">
        <div style="font-family:${SERIF};font-size:16px;line-height:1.12;color:${INK};">${esc(item.title)}</div>
        <div style="font-family:${SANS};font-size:12px;line-height:1.3;color:${MUT};margin-top:3px;">${item.media_type === 'tv' ? 'TV' : 'Film'}${movement ? ` &middot; ${movement}` : ''}</div>
        ${saveTextLink(item, 12) ? `<div style="margin-top:5px;">${saveTextLink(item, 12)}</div>` : ''}
      </td>
    </tr></table>`;
  };
  const col = (list: any[]) => list.map(cell).join('');
  return `${sectionHead('The top 10')}
    <tr><td style="padding:8px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="50%" valign="top" style="padding-right:14px;">${col(items.slice(0, 5))}</td>
        <td width="50%" valign="top" style="padding-left:14px;">${col(items.slice(5))}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:10px 32px 0;text-align:right;"><a href="${CHART_URL}" style="font-family:${SANS};font-size:13px;font-weight:600;color:${PINK};text-decoration:none;">See the full top 20 &rarr;</a></td></tr>`;
};

const featuredBlock = (featured: any, kicker: string) => {
  const heroImg = tmdbImg(featured.backdrop_path, 'w780') || tmdbImg(featured.poster_path, 'w500');
  const bold = (value: unknown) => `<b style="color:${INK};font-weight:700;">${esc(value)}</b>`;
  const ratings = featured.ratings ? [
    featured.ratings.tmdb ? `TMDB ${bold(featured.ratings.tmdb)}` : null,
    featured.ratings.rotten_tomatoes ? `Rotten Tomatoes ${bold(featured.ratings.rotten_tomatoes)}` : null,
    featured.ratings.metacritic ? `Metacritic ${bold(featured.ratings.metacritic)}` : null,
  ].filter(Boolean).join(' &nbsp;&middot;&nbsp; ') : '';
  const credits = [
    featured.cast?.length ? `Starring ${esc(andList(featured.cast))}` : null,
    featured.director ? `Directed by ${esc(featured.director)}` : null,
  ].filter(Boolean).join(' &middot; ');
  return `
    <tr><td style="padding:28px 32px 0;">
      ${heroImg ? `<img src="${esc(heroImg)}" width="536" alt="" style="display:block;width:100%;height:auto;border-radius:12px;border:1px solid ${HAIR};">` : ''}
      <div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${PINK};margin-top:18px;">${esc(kicker)}</div>
      <div style="font-family:${SERIF};font-size:33px;line-height:1.04;letter-spacing:-0.01em;color:${INK};margin-top:6px;">${esc(featured.title)}</div>
      ${ratings ? `<div style="font-family:${SANS};font-size:13px;color:${MUT};margin-top:12px;">${ratings}</div>` : ''}
      ${featured.overview ? `<div style="font-family:${SANS};font-size:15px;line-height:1.6;color:#27272a;margin-top:14px;">${esc(trim(featured.overview, 280))}</div>` : ''}
      ${credits ? `<div style="font-family:${SANS};font-size:13px;line-height:1.5;color:${MUT};margin-top:12px;">${credits}</div>` : ''}
      ${featured.providers?.length ? `<div style="font-family:${SANS};font-size:13px;color:${MUT};margin-top:16px;">Where to watch: <b style="color:${INK};">${esc(featured.providers.slice(0, 3).join(', '))}</b></div>` : ''}
      ${saveButton(featured) ? `<div style="margin-top:22px;">${saveButton(featured)}</div>` : ''}
    </td></tr>`;
};

const weekendBlock = (picks: any[]) => {
  const card = (pick: any) => `
    <tr><td style="padding:18px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="78" valign="top">
          <img src="${esc(tmdbImg(pick.poster_path, 'w185'))}" width="78" height="117" alt="" style="display:block;width:78px;height:117px;object-fit:cover;border-radius:8px;border:1px solid ${HAIR};background:#ececec;">
        </td>
        <td valign="top" style="padding-left:17px;">
          <div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:${PINK};">${esc(pick.label)}</div>
          <div style="font-family:${SERIF};font-size:21px;line-height:1.12;color:${INK};margin-top:5px;">${esc(pick.title)}</div>
          <div style="font-family:${SANS};font-size:13px;line-height:1.45;color:${MUT};margin-top:7px;">${pick.meta}</div>
          ${saveTextLink(pick) ? `<div style="margin-top:9px;">${saveTextLink(pick)}</div>` : ''}
        </td>
      </tr></table>
    </td></tr>`;
  return `${sectionHead('Weekend watch')}${picks.map(card).join('')}`;
};

const streamingGallery = (items: any[]) => {
  const cell = (item: any) => item ? `
    <td width="33.33%" valign="top" style="padding:16px 6px 0;">
      <img src="${esc(tmdbImg(item.poster_path, 'w342'))}" width="166" height="249" alt="" style="display:block;width:100%;height:249px;object-fit:cover;border-radius:8px;border:1px solid ${HAIR};background:#ececec;">
      <div style="font-family:${SERIF};font-size:17px;line-height:1.12;color:${INK};margin-top:9px;">${esc(item.title)}</div>
      <div style="font-family:${SANS};font-size:12px;line-height:1.4;color:${MUT};margin-top:4px;">${item.vote ? `&#9733; ${item.vote.toFixed(1)} &middot; ` : ''}${esc(item.providers[0])}</div>
      ${saveTextLink(item, 12) ? `<div style="margin-top:6px;">${saveTextLink(item, 12)}</div>` : ''}
    </td>` : '<td width="33.33%" style="font-size:0;line-height:0;">&nbsp;</td>';
  const rows = [];
  for (let index = 0; index < items.length; index += 3) rows.push([items[index], items[index + 1], items[index + 2]]);
  return `${sectionHead('New on streaming')}
    <tr><td style="padding:0 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('')}
      </table>
    </td></tr>`;
};

const buildHtml = ({ dateLabel, featured, kicker, chart, weekend, streaming }: any, unsubscribeUrl: string) => `<!doctype html>
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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${HAIR};border-radius:16px;">
      <tr><td style="padding:44px 32px 0;text-align:center;">
        <div style="font-family:${SERIF};font-size:58px;line-height:0.9;letter-spacing:-0.03em;color:${INK};">PLOT</div>
        <div style="font-family:${SANS};font-size:12px;font-weight:400;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};margin-top:14px;">This week in film &amp; TV &middot; ${esc(dateLabel)}</div>
      </td></tr>
      ${featured ? featuredBlock(featured, kicker) : ''}
      ${chart.length ? chartTwoColumn(chart) : ''}
      ${weekend.length ? weekendBlock(weekend) : ''}
      ${streaming.length ? streamingGallery(streaming) : ''}
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

export const buildOperatorNewsletterPreview = async (supabase: any) => {
  const now = new Date();
  const localIssueDate = tzDateParts(now);
  const weekStart = addDays(localIssueDate.date, -(ISSUE_WEEK_OFFSET[localIssueDate.weekday] ?? 0));

  const { data: currentIssue } = await supabase
    .from('marketing_newsletter_issues')
    .select('week_start, issue_date, subject, html, snapshot, sent_at')
    .eq('week_start', weekStart)
    .maybeSingle();

  if (currentIssue?.html) {
    return {
      subject: currentIssue.subject,
      html: currentIssue.html,
      snapshot: currentIssue.snapshot || null,
      issue_date: currentIssue.issue_date,
      week_start: currentIssue.week_start,
      source: 'saved_issue',
      sent_at: currentIssue.sent_at || null,
    };
  }

  const { data: snapshots } = await supabase
    .from('marketing_trending_snapshots')
    .select('snapshot_date, items')
    .order('snapshot_date', { ascending: false })
    .limit(2);

  const allChart = snapshots?.[0]?.items ? withMovement(snapshots[0].items, snapshots[1]?.items || null) : [];
  const seen = new Set<number>();
  allChart.slice(0, 10).forEach((item: any) => seen.add(item.tmdb_id));

  const lead = allChart[0] || null;
  let featured = null;
  if (lead) {
    const details = await getTitleDetails(lead.media_type, lead.tmdb_id).catch(() => null);
    const omdb = await getRatings(details?.external_ids?.imdb_id || null).catch(() => null);
    const ratings = {
      tmdb: details?.vote_average ? details.vote_average.toFixed(1) : null,
      rotten_tomatoes: omdb?.rotten_tomatoes || null,
      metacritic: omdb?.metacritic || null,
    };
    const cast = (details?.credits?.cast || []).filter((entry: any) => (entry.popularity || 0) >= 6).slice(0, 2).map((entry: any) => entry.name);
    const director = lead.media_type === 'movie'
      ? (details?.credits?.crew || []).find((entry: any) => entry.job === 'Director' && (entry.popularity || 0) >= 4)?.name || null
      : (details?.created_by || [])[0]?.name || null;
    const providers = normProviders((((details?.['watch/providers']?.results?.[REGION] || details?.['watch/providers']?.results?.US)?.flatrate || []).map((provider: any) => provider.provider_name)));
    featured = {
      ...lead,
      overview: details?.overview || '',
      ratings,
      cast,
      director,
      providers,
    };
  }

  const chart = allChart.slice(0, 10);
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const providerNames = async (type: string, id: number) => normProviders((await getWatchProviders(type, id).catch(() => [])).map((provider: any) => provider.provider_name));
  const star = (value: number) => (value ? `&#9733; ${value.toFixed(1)} &middot; ` : '');
  const weekend: any[] = [];

  for (const movie of await getTrending().catch(() => [])) {
    if (movie.media_type !== 'movie' || seen.has(movie.id)) continue;
    const providers = await providerNames('movie', movie.id);
    if (!providers.length) continue;
    seen.add(movie.id);
    weekend.push({ label: "The movie everyone's talking about", title: movie.title || movie.name, poster_path: movie.poster_path, meta: `${star(movie.vote_average)}${esc(providers[0])}`, tmdb_id: movie.id, media_type: 'movie' });
    break;
  }

  for (const series of await getRecentPopularTV(iso(120)).catch(() => [])) {
    if (seen.has(series.id)) continue;
    const details = await fetchTMDB(`/tv/${series.id}`).catch(() => null);
    if (!details) continue;
    const complete = details.status === 'Ended' || details.status === 'Canceled' || !details.next_episode_to_air;
    if (!complete || (details.number_of_episodes || 0) < 6) continue;
    const providers = await providerNames('tv', series.id);
    if (!providers.length) continue;
    seen.add(series.id);
    weekend.push({ label: 'The series to binge', title: series.name || series.title, poster_path: series.poster_path, meta: `${star(details.vote_average)}All ${details.number_of_episodes} episodes on ${esc(providers[0])}`, tmdb_id: series.id, media_type: 'tv' });
    break;
  }

  const releases = await getReleasesInWindow(iso(30), iso(1)).catch(() => ({ digital: [], tv: [] }));
  const releaseDate = (entry: any) => entry.release_date || entry.first_air_date || '';
  const candidates = [...(releases.digital || []), ...(releases.tv || [])]
    .filter((entry: any) => entry.poster_path && (entry.vote_average || 0) > 0 && (entry.vote_count || 0) >= 5)
    .sort((a: any, b: any) => releaseDate(b).localeCompare(releaseDate(a)));
  const streaming: any[] = [];
  for (const candidate of candidates) {
    if (streaming.length >= 3 || seen.has(candidate.id)) continue;
    const providers = await providerNames(candidate.media_type, candidate.id);
    if (!providers.length) continue;
    seen.add(candidate.id);
    streaming.push({
      title: candidate.title || candidate.name,
      poster_path: candidate.poster_path,
      providers,
      vote: candidate.vote_average,
      tmdb_id: candidate.id,
      media_type: candidate.media_type,
    });
  }

  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const snapshot = { dateLabel, featured, kicker: "This week's No.1", chart, weekend, streaming };
  return {
    subject: 'This week in film & TV — PLOT',
    html: buildHtml(snapshot, `${SITE}/?unsubscribe_preview`),
    snapshot,
    issue_date: localIssueDate.date,
    week_start: weekStart,
    source: 'live_preview',
    sent_at: null,
  };
};
