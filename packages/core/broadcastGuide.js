// Broadcast schedules use absolute instants; timezone affects display and day selection only.
import { getConfig } from './config.js';
import markets from './broadcastMarkets.json' with { type: 'json' };
/** @typedef {{id: string, name: string, number?: number}} BroadcastChannel */
/** @typedef {{id: string, channelId: string, title: string, start: string, end: string, description?: string}} BroadcastProgramme */
/** @typedef {{region: string, fetchedAt: string, coverageEnd: string, schemaVersion: number, source: string, sourceUrl: string, channels: BroadcastChannel[], programmes: BroadcastProgramme[], refreshFailed?: boolean}} BroadcastSnapshot */
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
 * @template {{id: string}} T
 * @param {T[]} channels @param {string[] | null} selection
 */
export function selectedGuideChannels(channels, selection) {
  return channels.filter(channel => selection === null || selection.includes(channel.id));
}

/** Validate a snapshot before replacing the last known good response.
 * @param {any} data @param {string} region
 * @returns {BroadcastSnapshot}
 */
export function validateGuideSnapshot(data, region) {
  const sourceUrls = { mjh: 'https://i.mjh.nz/', tvpassport: 'https://www.tvpassport.com/', freeview: 'https://www.freeview.co.uk/tv-guide' };
  const market = GUIDE_REGIONS.find(m => m.id === region);
  if (!market?.provider || data?.schemaVersion !== 2 || data?.sourceUrl !== sourceUrls[market.provider] || typeof data?.source !== 'string' || !Number.isFinite(Date.parse(data?.coverageEnd))) throw new Error('Invalid guide metadata');
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

/** Public, cached snapshots. Uses the same configured backend as account data.
 * @param {string} region
 */
export function broadcastSnapshotUrl(region) {
  if (!GUIDE_REGIONS.some(m => m.id === region)) throw new Error('Unknown broadcast market');
  return `${getConfig().supabaseUrl}/storage/v1/object/public/broadcast-guide/${encodeURIComponent(region)}.json`;
}

/** @param {string} stamp @param {string} date @param {string} timezone */
export function broadcastTime(stamp, date, timezone) {
  const instant = new Date(stamp);
  const clock = instant.toLocaleTimeString('en-AU', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
  return guideDate(stamp, timezone) === date ? clock : `${instant.toLocaleDateString('en-AU', { timeZone: timezone, day: 'numeric', month: 'short' })} ${clock}`;
}

/** @param {string} day @param {Intl.DateTimeFormatOptions} options */
export function broadcastDayLabel(day, options) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', ...options });
}
