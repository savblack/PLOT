// Broadcast schedules use absolute instants; timezone affects display and day selection only.
import markets from './broadcastMarkets.json' with { type: 'json' };
export const GUIDE_REGIONS = markets;
export const GUIDE_COUNTRIES = ['AU', 'NZ', 'US', 'CA', 'GB'];

/** @param {string} country */
export function guideMarketsForCountry(country) {
  return GUIDE_REGIONS.filter(market => market.country === country);
}

const dateFormatters = new Map();

/** @param {Date | number | string} instant @param {string} timezone */
export function guideDate(instant, timezone) {
  if (!dateFormatters.has(timezone)) dateFormatters.set(timezone, new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  const parts = dateFormatters.get(timezone).formatToParts(new Date(instant));
  const get = (type) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** @param {string} date @param {number} offset */
export function guideDay(date, offset) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

/** @param {{start: string, end: string, title?: string}} programme @param {number} now */
export function isOnNow(programme, now) {
  if (/^(to be (advised|announced)( later)?|tba|no (programme|program|schedule) information)$/i.test(programme.title?.trim() ?? '')) return false;
  return Date.parse(programme.start) <= now && now < Date.parse(programme.end);
}

/** Explicit [] means no channels. null means the region's initial selection.
 * @param {Array<{id: string}>} channels @param {string[] | null} selection
 */
export function selectedGuideChannels(channels, selection) {
  return channels.filter(channel => selection === null || selection.includes(channel.id));
}

/** Validate a snapshot before replacing the last known good response.
 * @param {any} data @param {string} region
 */
export function validateGuideSnapshot(data, region) {
  if (data?.region !== region || !Number.isFinite(Date.parse(data?.fetchedAt)) || !Array.isArray(data?.channels) || !data.channels.length || !Array.isArray(data?.programmes) || !data.programmes.length) throw new Error('Invalid guide snapshot');
  const ids = new Set(data.channels.map(c => c.id));
  if (ids.size !== data.channels.length || data.channels.some(c => typeof c.id !== 'string' || typeof c.name !== 'string')) throw new Error('Invalid channel directory');
  const keys = new Set();
  for (const p of data.programmes) {
    if (!ids.has(p.channelId) || typeof p.id !== 'string' || keys.has(p.id) || typeof p.title !== 'string' || !p.title.trim() || !Number.isFinite(Date.parse(p.start)) || !(Date.parse(p.end) > Date.parse(p.start))) throw new Error('Invalid programme');
    keys.add(p.id);
  }
  return data;
}

/** @param {Array<any>} programmes @param {{date: string, timezone: string, channelIds: string[], now: number, mode: string}} options */
export function guideAgenda(programmes, { date, timezone, channelIds, now, mode }) {
  const ids = new Set(channelIds);
  return programmes.filter(p => ids.has(p.channelId) &&
    guideDate(p.start, timezone) <= date && guideDate(Date.parse(p.end) - 1, timezone) >= date &&
    (mode !== 'now' || isOnNow(p, now)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.channelId.localeCompare(b.channelId));
}
