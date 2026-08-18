// Keeps the marketing site's timeline showing new and trending titles.
//
// The timeline is a growing watch history, so this appends rather than
// replaces: newly trending titles join the end, the oldest scroll off, and an
// entry that already has a hand-written note is never rewritten. Poster artwork
// is not stored in this repo: the markup points at TMDB's image CDN, and this
// script keeps each entry's poster_path current so those URLs stay valid. The
// markup in index.html is regenerated from apps/website/data/timeline.json.
//
// Usage — from the repo root:
//   node --env-file=.env scripts/refresh-timeline.mjs              # refresh
//   node --env-file=.env scripts/refresh-timeline.mjs --dry-run    # report only
//   node --env-file=.env scripts/refresh-timeline.mjs --no-append  # art + markup only, same lineup
//
// New entries land with an empty note. That is deliberate: the notes are
// title-specific jokes ("That's all." for The Devil Wears Prada 2) that no
// generator produces well, so the run reports which entries need one and the
// weekly PR is where a human writes it before merging.
//
// Talks to api.themoviedb.org directly, like every other server-side script
// here. The tmdb-proxy Edge Function is not an option: it only answers requests
// carrying TMDB_PROXY_SHARED_SECRET, which the Cloudflare Worker adds as the
// admission-control boundary for browser traffic.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;
// Poster size used in the generated markup. w342 matches the artwork these
// surfaces shipped with before they moved to the CDN, so nothing changes size.
const IMG = 'https://image.tmdb.org/t/p/w342';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'apps', 'website', 'data', 'timeline.json');
const INDEX_HTML = path.join(ROOT, 'apps', 'website', 'index.html');

const DRY_RUN = process.argv.includes('--dry-run');
const NO_APPEND = process.argv.includes('--no-append'); // refresh art and markup, leave the lineup alone

const MAX_CARDS = 15;     // keeps the horizontal scroll the length it was designed for
const MAX_APPEND = 1;     // per run: at 2/week the whole curated timeline turns over in under two months
// This section is taste-signalling next to Oppenheimer and Severance, so the bar
// is deliberately high. Most weeks nothing clears it, which is the intent: the
// timeline should gain a title when something genuinely lands, not every Monday.
const MIN_VOTES = 250;
const MIN_SCORE = 7.0;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fetchTMDB = async (endpoint, params = {}) => {
  const url = new URL(`${BASE}/${endpoint.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries({ language: 'en-US', ...params })) url.searchParams.set(k, v);
  const headers = {};
  // v4 read tokens are JWTs (Bearer header); v3 keys go in the query string.
  if (TMDB_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${endpoint}`);
  return res.json();
};

const releaseDate = (item) => item.release_date || item.first_air_date || '';
const displayTitle = (item) => item.title || item.name || '';
const dateLabel = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const sortKey = (entry) => {
  const [mon, year] = entry.date_label.split(' ');
  return `${year}-${String(MONTHS.indexOf(mon) + 1).padStart(2, '0')}`;
};

// Titles come from TMDB and reach the page as markup: "Minions & Monsters" has
// to be escaped. Notes are hand-authored and left alone.
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const slug = (title) => title.toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// Titles trending this week that the timeline hasn't covered, newest last. The
// trending list is already curated by TMDB, so this only has to filter out what
// is already present, undated, or too obscure to read as a recognisable title.
async function findCandidates(entries) {
  const known = new Set(entries.map(e => e.tmdb_id));
  // By slug as well as id: a film and the series it spawned are two TMDB ids
  // under one name, and the timeline should never print that name twice.
  const knownSlugs = new Set(entries.map(e => e.slug));
  const newest = entries.map(sortKey).sort().at(-1) ?? '0000-00';
  const data = await fetchTMDB('/trending/all/week');

  return (data.results || [])
    .filter(item =>
      ['movie', 'tv'].includes(item.media_type) &&
      item.poster_path &&
      releaseDate(item) &&
      !known.has(item.id) &&
      !knownSlugs.has(slug(displayTitle(item))) &&
      (item.vote_count ?? 0) >= MIN_VOTES &&
      (item.vote_average ?? 0) >= MIN_SCORE &&
      // Only ever extends forward, but same-month is fair game: the newest entry
      // being July must not hide a bigger July title released days later.
      releaseDate(item).slice(0, 7) >= newest)
    // Biggest title first, not earliest: only one is appended per run, and the
    // entries are date-sorted into position afterwards, so chronology costs
    // nothing while picking by date would seat a minor title ahead of a major one.
    .sort((a, b) => b.popularity - a.popularity);
}

// Year headings come from the entries themselves, so a title that opens a new
// year needs no special case.
function renderTimeline(entries) {
  const lines = ['']; // blank line under the opening marker, as the page has it
  let year = null;
  for (const entry of entries) {
    const entryYear = entry.date_label.slice(-4);
    if (entryYear !== year) {
      year = entryYear;
      lines.push(
        '        <div class="tl-year">',
        `          <span class="tl-year-label">${year}</span>`,
        '          <div class="tl-year-line"></div>',
        '        </div>',
        '');
    }
    lines.push(
      '        <div class="tl-card">',
      `          <div class="tl-poster" data-bg='${IMG}${entry.poster_path}'></div>`,
      `          <div class="tl-date">${entry.date_label}</div>`,
      `          <div class="tl-title">${esc(entry.title)}</div>`);
    if (entry.note) lines.push(`          <div class="tl-note">${entry.note}</div>`);
    lines.push('        </div>', '');
  }
  lines.pop(); // trailing blank line: the closing marker supplies its own
  return lines.join('\n');
}

// The app mockup's hero card advertises "TRENDING #1" and carries no
// hand-written copy, so it is regenerated wholesale every run.
//
// Only this card. The Discover panel further down looks like the same job but
// is not: an inline script hydrates its hero and both rows from /api/discover
// on load, keeping the committed images purely as a pre-hydration fallback.
// Generating that markup here too would mean two systems writing the same
// pixels, with weekly image churn for content the browser replaces anyway.
async function fetchTrending() {
  const all = await fetchTMDB('/trending/all/week');
  const item = (all.results || [])
    .find(r => r.poster_path && releaseDate(r) && ['movie', 'tv'].includes(r.media_type));
  if (!item) return null;
  return {
    hero: {
      slug: slug(displayTitle(item)),
      tmdb_id: item.id,
      media_type: item.media_type,
      poster_path: item.poster_path,
      title: displayTitle(item),
      year: releaseDate(item).slice(0, 4),
    },
  };
}

const KIND = { movie: 'Film', tv: 'Series' };

const renderHeroCard = (hero) => [
  '',
  `            <div class="af-card af-hero" style="background-image:url('${IMG}${hero.poster_path}')">`,
  '              <span class="af-badge">TRENDING #1</span>',
  `              <div class="af-cap">${esc(hero.title)}<small>${hero.year} &middot; ${KIND[hero.media_type]}</small></div>`,
  '            </div>',
].join('\n');

function replaceBlock(html, name, body, indent = '        ') {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1) throw new Error(`Missing ${start} / ${end} markers in index.html`);
  return `${html.slice(0, from + start.length)}\n${body}\n${indent}${html.slice(to)}`;
}

if (!TMDB_KEY) {
  console.error('TMDB_API_KEY is not set. Run from the repo root: node --env-file=.env scripts/refresh-timeline.mjs');
  process.exit(1);
}

const data = JSON.parse(await readFile(DATA_FILE, 'utf8'));
let entries = [...data.entries];

// 1. Extend the timeline with what is trending now.
const candidates = NO_APPEND ? [] : await findCandidates(entries);
const appended = candidates.slice(0, MAX_APPEND).map(item => ({
  slug: slug(displayTitle(item)),
  tmdb_id: item.id,
  media_type: item.media_type,
  poster_path: item.poster_path,
  title: displayTitle(item),
  date_label: dateLabel(releaseDate(item)),
  note: '',
}));
entries.push(...appended);
entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

// 2. Trim the oldest so the scroll stays the length the section was designed for.
// "pinned": true in timeline.json keeps an anchor title (an Oppenheimer) from
// ageing off the front; everything else is a rolling window.
const overBy = Math.max(0, entries.length - MAX_CARDS);
const trimmed = [];
for (const entry of entries) {
  if (trimmed.length === overBy) break;
  if (!entry.pinned) trimmed.push(entry);
}
entries = entries.filter(entry => !trimmed.includes(entry));

// 3. Re-point poster URLs for everything that survived. TMDB occasionally swaps
// a title's primary artwork; the markup is generated from poster_path, so
// picking the change up here is what keeps the CDN URLs from 404ing.
let refreshed = 0;
for (const entry of entries) {
  const details = await fetchTMDB(`/${entry.media_type}/${entry.tmdb_id}`).catch(() => null);
  // A failed lookup leaves the known-good path alone rather than dropping it.
  const currentPath = details?.poster_path || entry.poster_path;
  if (currentPath !== entry.poster_path) {
    refreshed++;
    console.log(`  poster  ${entry.slug.padEnd(38)} ${entry.title}`);
  }
  entry.poster_path = currentPath;
}

// 4. Refresh the trending surfaces: app mockup hero, Discover hero and rows.
// --no-append holds the timeline lineup steady; trending always refreshes,
// since it carries no hand-written copy and going stale is the whole failure
// mode these surfaces have ("TRENDING #1" on a title from eight months ago).
const previousTrending = data.trending ?? {};
// A failed lookup leaves the committed hero in place rather than blanking it.
const trending = (await fetchTrending()) ?? previousTrending;
if (trending.hero && trending.hero.poster_path !== previousTrending.hero?.poster_path) {
  refreshed++;
  console.log(`  trend   ${trending.hero.slug.padEnd(38)} ${trending.hero.title}`);
}

// 5. Write data and markup. There is no image cleanup step: nothing is stored.
const html = await readFile(INDEX_HTML, 'utf8');
let nextHtml = replaceBlock(html, 'timeline', renderTimeline(entries));
if (trending.hero) nextHtml = replaceBlock(nextHtml, 'hero-card', renderHeroCard(trending.hero), '            ');

if (!DRY_RUN) {
  await writeFile(DATA_FILE, `${JSON.stringify({ entries, trending }, null, 2)}\n`);
  await writeFile(INDEX_HTML, nextHtml);
}

for (const entry of appended) console.log(`  added   ${entry.date_label.padEnd(9)} ${entry.title}`);
for (const entry of trimmed) console.log(`  dropped ${entry.date_label.padEnd(9)} ${entry.title}`);

const needNotes = entries.filter(e => !e.note);
console.log(`\n${appended.length} added, ${trimmed.length} dropped, ${refreshed} poster URLs re-pointed${DRY_RUN ? ' (--dry-run: nothing written)' : ''}`);
if (needNotes.length) {
  console.log(`\n${needNotes.length} ${needNotes.length === 1 ? 'entry needs a note' : 'entries need notes'} before this ships:`);
  for (const entry of needNotes) console.log(`  ${entry.date_label.padEnd(9)} ${entry.title}`);
}
