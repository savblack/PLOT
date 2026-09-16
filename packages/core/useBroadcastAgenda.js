import { useEffect, useState } from 'react';
import { GUIDE_REGIONS, guideDate, guideDay, guideAgenda, selectedGuideChannels } from './broadcastGuide.js';
import { useBroadcastGuide } from './useBroadcastGuide.js';

/** Shared view model for both renderers. Region changes remount the host.
 * @param {string} region @param {string[] | null} selection @param {string} endpoint
 */
export function useBroadcastAgenda(region, selection, endpoint = '') {
  const market = GUIDE_REGIONS.find(item => item.id === region);
  if (!market?.timezone) throw new Error('Broadcast market requires a timezone');
  const timezone = market.timezone;
  const [now, setNow] = useState(Date.now);
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState('all');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const { data, error, loading } = useBroadcastGuide(endpoint, region, revision);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const today = guideDate(now, timezone);
  const date = guideDay(today, offset);
  const channels = data?.channels ?? [];
  const visibleChannels = selectedGuideChannels(channels, selection);
  const all = guideAgenda(data?.programmes ?? [], { date, timezone, channelIds: visibleChannels.map(c => c.id), now, mode: 'all' });
  const programmes = guideAgenda(all, { date, timezone, channelIds: visibleChannels.map(c => c.id), now, mode })
    .filter(p => !query.trim() || p.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const withListings = new Set(all.map(p => p.channelId));
  const missingChannelCount = visibleChannels.filter(c => !withListings.has(c.id)).length;
  const stale = Boolean(data && (now - Date.parse(data.fetchedAt) > 12 * 60 * 60 * 1000 || Date.parse(data.coverageEnd) <= now));
  return { market, timezone, now, today, date, offset, setOffset, mode, setMode, query, setQuery,
    data, error, loading, channels, visibleChannels, programmes, missingChannelCount, stale,
    retry: () => setRevision(v => v + 1) };
}
