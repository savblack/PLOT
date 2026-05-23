import { useState, useEffect, useRef } from 'react';
import { useApp } from '../App.jsx';
import { localDateStr, dateToLocalStr } from '../utils/date.js';
import MultiSelect from './MultiSelect.jsx';

/* ── Constants ── */
const MINUTE_PX  = 3;
const START_H    = 6;    // grid starts at 6:00 AM
const END_H      = 24;   // grid ends at midnight
const TOTAL_MINS = (END_H - START_H) * 60;
const TOTAL_W    = TOTAL_MINS * MINUTE_PX;

/* ── Helpers ── */
function minsFromStart(airtime) {
  if (!airtime) return -1;
  const [h, m] = airtime.split(':').map(Number);
  return (h - START_H) * 60 + m;
}

function fmtTime(airtime) {
  if (!airtime) return '';
  const [h, m] = airtime.split(':').map(Number);
  const sfx = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')}${sfx}`;
}

function addMins(airtime, mins) {
  const [h, m] = airtime.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}


/* ── Convert a UTC airstamp to "HH:MM" in the user's saved timezone.
   Falls back to browser local time if no timezone is configured. ── */
function stampToLocalHHMM(airstamp, timezone) {
  const d = new Date(airstamp);
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone || undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value   ?? String(d.getHours()).padStart(2, '0');
    const m = parts.find(p => p.type === 'minute')?.value ?? String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/* ── Derive a local-time grid position from a TVMaze episode.
   Always prefers airstamp (a true UTC moment) so we can convert to
   the user's saved timezone — not the network's local time or UTC.
   Falls back to airtime (network-local, no tz info) only when airstamp
   is absent. Programs before 6am are pinned to the grid start and
   marked "available" (e.g. midnight streaming drops). ── */
function resolveAirtime(ep, timezone) {
  if (ep.airstamp) {
    const hhmm = stampToLocalHHMM(ep.airstamp, timezone);
    const [h] = hhmm.split(':').map(Number);
    if (h >= END_H) return null;
    if (h < START_H) return { time: `${String(START_H).padStart(2, '0')}:00`, available: true };
    return { time: hhmm, available: ep.airtime === '' };
  }
  if (ep.airtime) {
    return { time: ep.airtime, available: false };
  }
  return null;
}

/* ── TVMaze returns two shapes:
   /schedule       → ep.show  (broadcast)
   /schedule/web   → ep._embedded.show  (streaming)
── */
const getShow = (ep) => ep.show ?? ep._embedded?.show;

/* ── API ── */
async function fetchBroadcast(date, country) {
  try {
    const r = await fetch(`https://api.tvmaze.com/schedule?country=${country}&date=${date}`);
    return r.ok ? r.json() : [];
  } catch { return []; }
}

async function fetchWebSchedule(date) {
  try {
    const r = await fetch(`https://api.tvmaze.com/schedule/web?date=${date}`);
    return r.ok ? r.json() : [];
  } catch { return []; }
}

/* ── Build broadcast channels, converting airtimes to the user's timezone ── */
function buildBroadcastChannels(eps, date, timezone) {
  const map = new Map();
  for (const ep of eps) {
    const show = getShow(ep);
    const net  = show?.network;
    if (!net?.id) continue;

    const resolved = resolveAirtime(ep, timezone);
    if (!resolved) continue;

    const key = `net-${net.id}`;
    if (!map.has(key)) {
      map.set(key, { id: key, name: net.name, type: 'broadcast', programs: [] });
    }
    map.get(key).programs.push({
      id:          ep.id,
      showName:    show?.name ?? ep.name ?? '',
      channelName: net.name,
      airtime:     resolved.time,
      runtime:     ep.runtime ?? show?.runtime ?? 30,
      available:   resolved.available,
      airDate:     date,
    });
  }
  return [...map.values()].filter(c => c.programs.length > 0);
}

/* ── Build streaming channels, converting airtimes to the user's timezone ── */
function buildStreamingChannels(eps, date, timezone) {
  const map = new Map();
  for (const ep of eps) {
    const show = getShow(ep);
    const ch   = show?.webChannel;
    if (!ch?.id) continue;

    const resolved = resolveAirtime(ep, timezone);
    if (!resolved) continue;

    const key = `web-${ch.id}`;
    if (!map.has(key)) {
      map.set(key, { id: key, name: ch.name, type: 'streaming', programs: [] });
    }
    map.get(key).programs.push({
      id:          ep.id,
      showName:    show?.name ?? ep.name ?? '',
      channelName: ch.name,
      airtime:     resolved.time,
      runtime:     ep.runtime ?? show?.runtime ?? 30,
      available:   resolved.available,
      airDate:     date,
    });
  }
  return [...map.values()].filter(c => c.programs.length > 0);
}

/* ── Time ruler marks ── */
const MARKS = [];
for (let h = START_H; h < END_H; h++) {
  for (const m of [0, 30]) {
    const mins = (h - START_H) * 60 + m;
    MARKS.push({
      offset: mins * MINUTE_PX,
      label:  fmtTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`),
    });
  }
}

/* ── Bell icon ── */
function BellIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, flexShrink: 0 }}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

/* ── Program detail / reminder sheet ── */
function ProgramSheet({ prog, onClose }) {
  const { reminders } = useApp();
  if (!prog) return null;

  const isSet = reminders.hasReminder(prog.id);
  const timeRange = prog.available
    ? 'Available today'
    : prog.airtime
      ? `${fmtTime(prog.airtime)} – ${fmtTime(addMins(prog.airtime, prog.runtime))}`
      : '';

  return (
    <div className="program-sheet-overlay" onClick={onClose}>
      <div className="program-sheet" onClick={e => e.stopPropagation()}>
        <div className="program-sheet-handle" />
        <div className="program-sheet-title">{prog.showName}</div>
        <div className="program-sheet-meta">
          {[prog.channelName, timeRange].filter(Boolean).join(' · ')}
        </div>
        <button
          className={`reminder-btn${isSet ? ' active' : ''}`}
          onClick={async (e) => {
            e.stopPropagation();
            await reminders.toggleReminder(prog);
          }}
        >
          <BellIcon filled={isSet} />
          {isSet ? 'Remove reminder' : 'Add to Calendar'}
        </button>
        <button className="program-sheet-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   EpgView
═══════════════════════════════════════ */
export default function EpgView() {
  const { profile } = useApp();
  const country     = profile?.region   ?? 'US';
  const timezone    = profile?.timezone ?? null;
  const todayStr    = localDateStr();

  // Combined streaming platforms + guide channels from Settings
  const seenIds = new Set();
  const allGuideProviders = [
    ...(profile?.streaming_providers || []),
    ...(profile?.guide_channels      || []),
  ].filter(p => { if (seenIds.has(p.id)) return false; seenIds.add(p.id); return true; });

  const [date,             setDate]             = useState(todayStr);
  const [channels,         setChannels]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [hiddenChannelIds, setHiddenChannelIds] = useState(new Set());
  const [typeFilters,      setTypeFilters]      = useState([]);
  const [platformFilters,  setPlatformFilters]  = useState([]); // provider names to match against EPG channel names
  const [selected,         setSelected]         = useState(null); // programme clicked for reminder sheet

  const bodyRef    = useRef(null);
  const sidebarRef = useRef(null);
  const rulerRef   = useRef(null);
  const rafRef     = useRef(null);

  /* ── Day tabs ── */
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return {
      dateStr: dateToLocalStr(d),
      label:   i === 0 ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' }),
      num:     d.getDate(),
    };
  });

  /* ── Fetch ── */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchBroadcast(date, country),
      fetchWebSchedule(date),
    ]).then(([broadcastEps, webEps]) => {
      const all = [
        ...buildBroadcastChannels(broadcastEps, date, timezone),
        ...buildStreamingChannels(webEps, date, timezone),
      ].sort((a, b) => a.name.localeCompare(b.name));
      setChannels(all);
      setLoading(false);
    });
  }, [date, country, timezone]);

  /* ── Auto-scroll to now (using user's timezone) ── */
  useEffect(() => {
    if (loading || !bodyRef.current) return;
    if (date === todayStr) {
      // Get current H:MM in the user's saved timezone
      const hhmm = stampToLocalHHMM(new Date().toISOString(), timezone);
      const [h, m] = hhmm.split(':').map(Number);
      const mins = (h - START_H) * 60 + m;
      bodyRef.current.scrollLeft = Math.max(0, mins * MINUTE_PX - 120);
    } else {
      bodyRef.current.scrollLeft = 0;
    }
  }, [loading, date, todayStr, timezone]);

  /* ── Passive scroll sync: body drives ruler (x) and sidebar (y) ── */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const sync = () => {
      if (rulerRef.current)   rulerRef.current.scrollLeft  = body.scrollLeft;
      if (sidebarRef.current) sidebarRef.current.scrollTop = body.scrollTop;
      rafRef.current = null;
    };
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(sync);
    };
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      body.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loading]);

  /* ── Now line (refresh every minute) ── */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const isToday = date === todayStr;
  const now     = new Date();
  const nowMins = (now.getHours() - START_H) * 60 + now.getMinutes();
  const nowLeft = isToday && nowMins >= 0 && nowMins < TOTAL_MINS ? nowMins * MINUTE_PX : null;

  const typeFilteredChannels = typeFilters.length === 0
    ? channels
    : channels.filter(c => typeFilters.includes(c.type));

  // Platform filter: match EPG channel names against selected provider names
  const platformFilteredChannels = platformFilters.length === 0
    ? typeFilteredChannels
    : typeFilteredChannels.filter(c => {
        const cn = c.name.toLowerCase();
        return platformFilters.some(pName => {
          const pn = pName.toLowerCase();
          return cn.includes(pn) || pn.includes(cn);
        });
      });

  const visibleChannels = platformFilteredChannels.filter(c => !hiddenChannelIds.has(c.id));

  const hideChannel = (id) =>
    setHiddenChannelIds(prev => new Set([...prev, id]));

  const channelFilterValue = platformFilteredChannels.map(c => c.id).filter(id => !hiddenChannelIds.has(id));

  const handleChannelFilterChange = (selectedIds) => {
    const selectedSet = new Set(selectedIds);
    setHiddenChannelIds(new Set(platformFilteredChannels.map(c => c.id).filter(id => !selectedSet.has(id))));
  };

  return (
    <div className="epg-outer">

      {/* ── Day selector + filters (single row) ── */}
      <div className="sub-tabs-bar">
        <div className="sub-tabs-left" style={{ padding: '0.4rem 0 0.4rem 0.5rem', gap: '0.25rem' }}>
          {days.map(d => (
            <button
              key={d.dateStr}
              className={`epg-day-btn${date === d.dateStr ? ' active' : ''}`}
              onClick={() => setDate(d.dateStr)}
            >
              <span className="epg-day-name">{d.label}</span>
              <span className="epg-day-num">{d.num}</span>
            </button>
          ))}
        </div>

        {!loading && channels.length > 0 && (
          <div className="sub-tabs-right">
            <MultiSelect
              placeholder="Type"
              options={[
                { id: 'broadcast', label: 'Live TV'   },
                { id: 'streaming', label: 'Streaming' },
              ]}
              value={typeFilters}
              onChange={setTypeFilters}
            />
            {allGuideProviders.length > 0 && (
              <MultiSelect
                placeholder="Platforms"
                options={allGuideProviders.map(p => ({ id: p.name, label: p.name }))}
                value={platformFilters}
                onChange={setPlatformFilters}
              />
            )}
            <MultiSelect
              placeholder="Channels"
              options={platformFilteredChannels.map(c => ({ id: c.id, label: c.name }))}
              value={channelFilterValue}
              onChange={handleChannelFilterChange}
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : channels.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">No schedule available</div>
          <div className="empty-body">Schedules aren't available for your region on this date.</div>
        </div>
      ) : (
        <div className="epg-grid">

          <div className="epg-corner" />

          <div className="epg-ruler-wrap" ref={rulerRef}>
            <div style={{ position: 'relative', width: TOTAL_W, height: '100%' }}>
              {MARKS.map(mk => (
                <div key={mk.offset} className="epg-time-mark" style={{ left: mk.offset }}>
                  {mk.label}
                </div>
              ))}
              {nowLeft !== null && <div className="epg-now-tick" style={{ left: nowLeft }} />}
            </div>
          </div>

          <div className="epg-sidebar" ref={sidebarRef}>
            {visibleChannels.map(ch => (
              <div key={ch.id} className={`epg-sidebar-cell epg-sidebar-cell--${ch.type}`} title={ch.name}>
                <span className="epg-ch-name">{ch.name}</span>
                <span className="epg-ch-type">{ch.type === 'broadcast' ? 'Live TV' : 'Streaming'}</span>
                <button
                  className="epg-ch-hide"
                  onClick={() => hideChannel(ch.id)}
                  title={`Hide ${ch.name}`}
                  type="button"
                >
                  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="epg-body" ref={bodyRef}>
            <div style={{ width: TOTAL_W }}>
              {visibleChannels.map(ch => (
                <div key={ch.id} className="epg-row">
                  {ch.programs.map(prog => {
                    const start = minsFromStart(prog.airtime);
                    if (start < 0 || start >= TOTAL_MINS) return null;
                    const left   = start * MINUTE_PX;
                    const width  = Math.max(prog.runtime * MINUTE_PX - 2, 4);
                    const isPast = nowLeft !== null && (left + width) < nowLeft;
                    return (
                      <div
                        key={prog.id}
                        className={[
                          'epg-program',
                          isPast          ? 'epg-past'             : '',
                          ch.type === 'streaming' ? 'epg-program--stream' : '',
                          prog.available  ? 'epg-program--available' : '',
                        ].filter(Boolean).join(' ')}
                        style={{ left, width }}
                        onClick={() => setSelected(prog)}
                      >
                        <div className="epg-prog-name">{prog.showName}</div>
                        <div className="epg-prog-time">
                          {prog.available
                            ? 'Available today'
                            : `${fmtTime(prog.airtime)} – ${fmtTime(addMins(prog.airtime, prog.runtime))}`
                          }
                        </div>
                      </div>
                    );
                  })}
                  {nowLeft !== null && <div className="epg-now-line" style={{ left: nowLeft }} />}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── Program detail / reminder sheet ── */}
      {selected && (
        <ProgramSheet prog={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
