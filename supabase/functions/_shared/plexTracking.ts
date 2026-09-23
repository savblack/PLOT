import { isSafePlexConnectionUrl } from './plexConnectionPolicy.js';
import { parsePlexItems, parsePlexResources, xmlAttrs } from './plexXml.js';
import { tmdbIdFromGuids } from './tmdbMatch.js';

type Resource = { clientIdentifier?: string; name?: string; provides?: string; accessToken?: string; connections?: Array<{ uri?: string }> };
export type PlexSelection = { clientIdentifier: string; accountID: string; name: string; profileName: string };

// Resource tokens and connection URLs never leave this server-side module.
export function publicPlexResources(resources: Resource[]) {
  return resources.filter(row => row.provides?.split(',').includes('server')).map(row => ({
    clientIdentifier: row.clientIdentifier || '', name: row.name || 'Plex server',
  }));
}
export async function plexResources(token: string): Promise<Resource[]> {
  const response = await fetch('https://plex.tv/api/resources?includeHttps=1&includeRelay=1', {
    headers: { Accept: 'application/xml', 'X-Plex-Token': token }, signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Could not load Plex servers (${response.status}). Reconnect or retry.`);
  return parsePlexResources(await response.text()) as Resource[];
}
export async function plexServerRequest(server: Resource, token: string, path: string, params: Record<string,string> = {}) {
  for (const connection of (server.connections || []).slice(0,2)) {
    let url: URL;
    try { url = new URL(path, connection.uri); } catch { continue; }
    if (!isSafePlexConnectionUrl(url)) continue;
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/xml', 'X-Plex-Token': server.accessToken || token },
        signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (response.ok) return await response.text();
    } catch { /* Try another verified connection for this same server. */ }
  }
  throw new Error('The selected Plex server is unreachable or denied access. Check remote access and retry.');
}
export async function plexProfiles(server: Resource, token: string) {
  const xml = await plexServerRequest(server, token, '/accounts');
  if (!/<MediaContainer\b/.test(xml)) throw new Error('Plex returned an unsupported profile response.');
  return [...xml.matchAll(/<Account\b[^>]*>/g)].map(match => xmlAttrs(match[0]))
    .filter(row => /^\d+$/.test(row.id)).map(row => ({ accountID: row.id, name: row.name || row.title || `Profile ${row.id}` }));
}
export function selectedPlexServer(resources: Resource[], selection: PlexSelection | null) {
  if (!selection?.clientIdentifier || !/^\d+$/.test(selection.accountID)) throw new Error('Select a Plex server and profile before syncing.');
  const server = resources.find(row => row.clientIdentifier === selection.clientIdentifier && row.provides?.split(',').includes('server'));
  if (!server) throw new Error('The selected Plex server is no longer available. Select a server again.');
  return server;
}

export function validatePlexHistory(xml: string, accountID: string) {
  const container = xml.match(/<MediaContainer\b[^>]*>/)?.[0];
  if (!container) throw new Error('Plex returned an unsupported history response.');
  const items = parsePlexItems(xml);
  // Never rely on accountID query filtering alone: admin tokens can see everyone.
  if (items.some(item => item.accountID !== accountID)) throw new Error('Plex returned history for an unselected or unidentified profile. Nothing on this page was imported.');
  const attrs = xmlAttrs(container);
  const total = attrs.totalSize == null ? null : Number(attrs.totalSize);
  if (total != null && (!Number.isSafeInteger(total) || total < 0)) throw new Error('Plex returned invalid history pagination.');
  if (attrs.size != null && Number(attrs.size) !== items.length) throw new Error('Plex returned unsupported history entries. Nothing on this page was imported.');
  return { items, total };
}

export async function plexHistoryPage(token: string, selection: PlexSelection, offset: number) {
  const resources = await plexResources(token);
  const server = selectedPlexServer(resources, selection);
  const profiles = await plexProfiles(server, token);
  if (!profiles.some(row => row.accountID === selection.accountID)) throw new Error('The selected Plex profile is no longer accessible. Select a profile again.');
  // Ascending pages prevent new plays at the end from shifting existing offsets.
  // Every scheduled reconciliation starts at zero; source keys deduplicate it.
  const xml = await plexServerRequest(server, token, '/status/sessions/history/all', {
    accountID: selection.accountID, 'X-Plex-Container-Start': String(offset), 'X-Plex-Container-Size': '5', sort: 'viewedAt:asc',
  });
  const { items, total } = validatePlexHistory(xml, selection.accountID);
  if (!items.length && total != null && offset < total) throw new Error('Plex returned an incomplete history page.');
  const metadata = new Map<string, ReturnType<typeof parsePlexItems>[number]>();
  const records = [];
  for (const item of items) {
    if (!['movie','episode'].includes(item.type) || !/^\/status\/sessions\/history\/\d+$/.test(item.historyKey || '')) continue;
    const key = item.type === 'episode' ? item.grandparentRatingKey : item.ratingKey;
    if (!/^\d+$/.test(key || '')) continue;
    let media = metadata.get(key);
    if (!media) {
      const rows = parsePlexItems(await plexServerRequest(server, token, `/library/metadata/${key}`));
      media = rows.find(row => row.ratingKey === key);
      if (media) metadata.set(key, media);
    }
    if (!media || media.type !== (item.type === 'episode' ? 'show' : 'movie')) continue;
    // Episode GUIDs identify episodes, so only the parent show's GUID can identify a series.
    const tmdbId = tmdbIdFromGuids(media.guids);
    if (!Number.isSafeInteger(tmdbId) || Number(tmdbId) <= 0) continue;
    const season = item.type === 'episode' ? Number(item.parentIndex) : null;
    const episode = item.type === 'episode' ? Number(item.index) : null;
    if (item.type === 'episode' && (!Number.isInteger(season) || season! < 0 || !Number.isInteger(episode) || episode! < 1)) continue;
    const seconds = item.viewedAt == null ? null : Number(item.viewedAt);
    if (seconds != null && (!Number.isFinite(seconds) || seconds < 0 || seconds > 8640000000000)) continue;
    const watchedAt = seconds == null ? null : new Date(seconds * 1000).toISOString();
    const account = `${selection.clientIdentifier}:${selection.accountID}`;
    const event = { source: 'plex', source_account: account, source_key: JSON.stringify(['plex',account,'event',item.historyKey]),
      tmdb_id: tmdbId, media_type: item.type === 'movie' ? 'movie' : 'tv', season_number: season, episode_number: episode,
      watched_on: watchedAt?.slice(0,10) || null, watched_at: watchedAt, date_precision: watchedAt ? 'instant' : 'unknown',
      external_ids: { plex: item.ratingKey, plex_history: item.historyKey, tmdb: tmdbId }, source_rating: null, source_review: null };
    records.push({ event, summary: { tmdb_id: tmdbId, media_type: event.media_type, title: media.title,
      watched_at: event.watched_on, poster_path: null, genre_ids: [] } });
  }
  return { records, skipped: items.length - records.length, offset: offset + items.length,
    done: total == null ? items.length < 5 : offset + items.length >= total };
}
