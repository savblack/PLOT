// What people searched and saved on Plot, for the Monday letter.
// Ranks only. Counts never leave this file. Search stores a length, not the
// words, so "searching" is a title opened from search. Saves exclude
// onboarding picks and a second save of a title already on the list.
import { addDays, formatWeekRange } from '../lib/dates.mjs';
import { fetchTMDB } from '../lib/tmdb.mjs';

const PROJECT = '471234';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SAFE = /^[A-Za-z0-9@._+-]+$/;

const hostFilter = `(properties.$host IS NULL OR (
    NOT ilike(toString(properties.$host), '%localhost%')
    AND NOT ilike(toString(properties.$host), '%127.0.0.1%')
    AND NOT ilike(toString(properties.$host), '%pages.dev%')
    AND NOT ilike(toString(properties.$host), '%preview.theplot.tv%')
  ))`;

export function sqlFilters(filters = []) {
  const parts = [
    "NOT startsWith(distinct_id, 'eng_analytics_census:')",
    'person_id NOT IN COHORT 362972',
    'person_id NOT IN COHORT 553124',
    "coalesce(toString(person.properties.$internal_or_test_user), '') NOT IN ('true', 'True')",
    hostFilter,
  ];
  for (const rule of filters) {
    if (rule.key !== 'email' || rule.type !== 'person') continue;
    const raw = Array.isArray(rule.value) ? rule.value[0] : rule.value;
    const value = String(raw ?? '');
    if (!SAFE.test(value)) continue;
    if (rule.operator === 'not_icontains') {
      parts.push(`(person.properties.email IS NULL OR NOT ilike(toString(person.properties.email), '%${value}%'))`);
    } else if (rule.operator === 'is_not') {
      parts.push(`(person.properties.email IS NULL OR toString(person.properties.email) != '${value}')`);
    }
  }
  return parts.join('\n  AND ');
}

const rankedSql = ({ event, extra, from, to, filterSql }) => `
SELECT
  toString(properties.tmdb_id) AS id,
  toString(properties.media_type) AS kind,
  count() AS n,
  count(DISTINCT person_id) AS people,
  max(timestamp) AS latest
FROM events
WHERE event = '${event}'
  AND ${extra}
  AND timestamp >= toDateTime('${from} 00:00:00', 'America/New_York')
  AND timestamp < toDateTime('${to} 00:00:00', 'America/New_York')
  AND ${filterSql}
  AND match(toString(properties.tmdb_id), '^[0-9]+$')
GROUP BY id, kind
ORDER BY people DESC, n DESC, latest DESC
LIMIT 5
`;

export function formatPeopleBrief({ from, to, searches, saves }) {
  const found = (searches?.length || 0) + (saves?.length || 0);
  if (!found) return 'People on Plot could not be checked for this letter. Omit the section.';
  const last = addDays(to, -1);
  const weekLong = addDays(from, 7) !== to;
  const lines = [
    'People on Plot.',
    `Window: ${formatWeekRange(from, last)}.`,
  ];
  if (weekLong) {
    lines.push('This window is longer than the week of the letter. Say the range, or say the past month. Do not say this week.');
  }
  lines.push('The numbers are the order. They are not a count of people. Do not add a count, a total, or any sentence about how many people use Plot. Do not say the list is short, small, or early. Use only these titles. Do not add one.');
  if (searches?.length) {
    lines.push('Searching, titles opened from search. The words typed are not stored, so do not invent a query.');
    searches.forEach((item, i) => lines.push(rankedLine(item, i)));
  } else {
    lines.push('No searched titles in this window. Leave searching out of the section, and do not mention the absence.');
  }
  if (saves?.length) {
    lines.push('Saving, titles added to a list. Onboarding picks are not included, and neither is saving a title that was already saved.');
    saves.forEach((item, i) => lines.push(rankedLine(item, i)));
  } else {
    lines.push('No saved titles in this window. Leave saving out of the section, and do not mention the absence.');
  }
  return lines.join('\n');
}

const rankedLine = (item, index) => {
  const year = item.year ? `, ${item.year}` : '';
  return `${index + 1}. ${item.title} (${item.kind}${year})`;
};

async function resolveRows(rows, resolveTitle) {
  const out = [];
  for (const row of rows || []) {
    const [id, kind] = row;
    if (!/^\d+$/.test(String(id))) continue;
    const media = kind === 'tv' ? 'tv' : 'movie';
    const item = await resolveTitle(String(id), media);
    if (item?.title) out.push(item);
  }
  return out;
}

async function loadWindow(from, to, filterSql, { query, resolveTitle }) {
  const searches = await query(rankedSql({
    event: 'title_viewed',
    extra: "toString(properties.source) = 'search'",
    from,
    to,
    filterSql,
  }));
  const saves = await query(rankedSql({
    event: 'watchlist_saved',
    extra: "toString(properties.already_saved) NOT IN ('true', 'True') AND toString(properties.source) != 'onboarding'",
    from,
    to,
    filterSql,
  }));
  return {
    searches: await resolveRows(searches, resolveTitle),
    saves: await resolveRows(saves, resolveTitle),
  };
}

export async function resolveTitle(id, kind) {
  try {
    const data = await fetchTMDB(`${kind === 'tv' ? 'tv' : 'movie'}/${id}`);
    const title = data?.title || data?.name;
    if (!title) return null;
    const year = String(data.release_date || data.first_air_date || '').slice(0, 4);
    return {
      title,
      year: /^\d{4}$/.test(year) ? year : '',
      kind: kind === 'tv' ? 'TV' : 'film',
    };
  } catch {
    return null;
  }
}

async function defaultQuery(hogql) {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) throw new Error('PostHog is not configured');
  const res = await fetch(`https://us.posthog.com/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error('PostHog query failed');
  return data.results || [];
}

async function defaultFilters() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) throw new Error('PostHog is not configured');
  const res = await fetch(`https://us.posthog.com/api/projects/${PROJECT}/`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('PostHog filters failed');
  return data.test_account_filters || [];
}

export async function peopleOnPlotBrief(date, deps = {}) {
  if (!DAY.test(date)) return 'People on Plot could not be checked for this letter. Omit the section.';
  const query = deps.query || defaultQuery;
  const resolve = deps.resolveTitle || resolveTitle;
  const filtersFor = deps.filters || defaultFilters;
  const to = date;
  const weekFrom = addDays(date, -7);
  const monthFrom = addDays(date, -28);
  try {
    const filterSql = sqlFilters(await filtersFor());
    const week = await loadWindow(weekFrom, to, filterSql, { query, resolveTitle: resolve });
    if (week.searches.length || week.saves.length) {
      return formatPeopleBrief({ from: weekFrom, to, ...week });
    }
    const month = await loadWindow(monthFrom, to, filterSql, { query, resolveTitle: resolve });
    return formatPeopleBrief({ from: monthFrom, to, ...month });
  } catch {
    return 'People on Plot could not be checked for this letter. Omit the section.';
  }
}
