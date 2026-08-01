import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../hooks/useApp.js';
import { dateToLocalStr } from '../utils/date.js';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { channelNamesMatch } from '../utils/channelAliases.js';
import LoadingSpinner from './LoadingSpinner.jsx';

/* ── Constants ── */
const START_H = 6;   // guide window opens 6:00 AM
const END_H   = 24;  // …closes midnight

/* ── Helpers ── */
function dateInTimezone(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone || undefined,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type) => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return dateToLocalStr(date);
  }
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateLabel(dateStr, options) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en', { timeZone: 'UTC', ...options });
}

function stampToLocalHHMM(airstamp, timezone) {
  const d = new Date(airstamp);
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone || undefined, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value   ?? String(d.getHours()).padStart(2, '0');
    const m = parts.find(p => p.type === 'minute')?.value ?? String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function resolveAirtime(ep, timezone) {
  if (ep.airstamp) {
    const hhmm = stampToLocalHHMM(ep.airstamp, timezone);
    const [h] = hhmm.split(':').map(Number);
    if (h >= END_H) return null;
    if (h < START_H) return { time: `${String(START_H).padStart(2, '0')}:00`, available: true };
    return { time: hhmm, available: ep.airtime === '' };
  }
  if (ep.airtime) return { time: ep.airtime, available: false };
  return null;
}

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

// Now in minutes-from-START_H, or null if outside the guide window.
function nowMinsInWindow(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone || undefined,
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const m = (value('hour') - START_H) * 60 + value('minute');
    return m >= 0 && m < (END_H - START_H) * 60 ? m : null;
  } catch {
    const now = new Date();
    const m = (now.getHours() - START_H) * 60 + now.getMinutes();
    return m >= 0 && m < (END_H - START_H) * 60 ? m : null;
  }
}

const getShow = (ep) => ep.show ?? ep._embedded?.show;

// TVMaze's `show.language` is often missing entirely, so a title with non-Latin
// script (CJK, Hangul, Cyrillic, Arabic, Thai, Devanagari, etc.) is the fallback
// signal that a show isn't English-language, even when the language field is unset.
const NON_LATIN_SCRIPT_RE = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿ؀-ۿ฀-๿ऀ-ॿ]/;
function looksNonEnglishTitle(title) {
  return NON_LATIN_SCRIPT_RE.test(title || '');
}

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

/* ── Build a flat, deduped, time-sorted programme list for a day.
   Posters come free from TVMaze's show.image (no per-title TMDB lookup). ── */
function buildPrograms(broadcastEps, webEps, timezone, hideKids) {
  const out = [];
  const push = (ep, container, type) => {
    if (!container?.id) return;
    const show = getShow(ep);
    if (show?.language) {
      if (show.language !== 'English') return;
    } else if (looksNonEnglishTitle(show?.name ?? ep.name)) {
      return;
    }
    if (hideKids && show?.genres?.includes('Children')) return;
    const resolved = resolveAirtime(ep, timezone);
    if (!resolved) return;
    out.push({
      id:          ep.id,
      showId:      show?.id ?? null,
      showName:    show?.name ?? ep.name ?? '',
      channelName: container.name,
      type,
      airtime:     resolved.time,
      runtime:     ep.runtime ?? show?.runtime ?? 30,
      available:   resolved.available,
      image:       show?.image?.medium ?? show?.image?.original ?? null,
    });
  };

  for (const ep of broadcastEps) push(ep, getShow(ep)?.network,    'broadcast');
  for (const ep of webEps)       push(ep, getShow(ep)?.webChannel, 'streaming');

  out.sort((a, b) => minsFromStart(a.airtime) - minsFromStart(b.airtime));
  const seen = new Set();
  return out.filter(p => {
    const k = p.showId ?? p.showName;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
          onClick={async (e) => { e.stopPropagation(); await reminders.toggleReminder(prog); }}
        >
          <BellIcon filled={isSet} />
          {isSet ? 'Remove reminder' : 'Add to Calendar'}
        </button>
        <button className="program-sheet-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ── Drag-scrollable rail ── */
function Rail({ children }) {
  const { ref, handlers } = useDragScroll();
  return <div className="rail-scroll epg-rail" ref={ref} {...handlers}>{children}</div>;
}

/* ── Poster card ── */
function PosterCard({ prog, live, onSelect }) {
  return (
    <button className={`epg-card${live ? ' live' : ''}`} onClick={() => onSelect(prog)}>
      <div className="epg-card-poster">
        {prog.image
          ? <img src={prog.image} alt="" loading="lazy" />
          : <div className="epg-card-fallback">{prog.showName}</div>}
        {live && <span className="epg-card-ring" aria-hidden="true" />}
      </div>
      <div className="epg-card-title">{prog.showName}</div>
      <div className="epg-card-meta">
        {live
          ? prog.channelName
          : <><span className="epg-card-time">{prog.available ? 'Available' : fmtTime(prog.airtime)}</span>{` · ${prog.channelName}`}</>}
      </div>
    </button>
  );
}

/* ── Stale-while-revalidate cache (keyed by region + timezone) ── */
let epgCache = null;

/* ═══════════════════════════════════════
   EpgView — Now / Up Next / Later poster rails
═══════════════════════════════════════ */
export default function EpgView() {
  const { profile } = useApp();
  const country  = profile?.region   ?? 'US';
  const timezone = profile?.timezone ?? null;
  const hideKids = !(profile?.include_kids_content ?? true);
  const channelNames = useMemo(
    () => (profile?.guide_channels ?? []).map(c => c.name || '').filter(Boolean),
    [profile?.guide_channels]
  );
  const cacheKey = `${country}:${timezone}:${hideKids}`;
  const todayStr = dateInTimezone(new Date(), timezone);

  const [date,           setDate]           = useState(todayStr);
  const [programsByDate, setProgramsByDate] = useState(() => epgCache?.key === cacheKey ? epgCache.data : {});
  const [selected,       setSelected]       = useState(null);
  const [, setTick] = useState(0);

  // Keep "now" fresh each minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const dateStr = addDays(todayStr, i);
    return {
      dateStr,
      weekday: i === 0 ? 'Today' : dateLabel(dateStr, { weekday: 'short' }),
      month:   dateLabel(dateStr, { month: 'short' }),
      num:     Number(dateLabel(dateStr, { day: 'numeric' })),
    };
  }), [todayStr]);
  const dayKey = days.map(d => d.dateStr).join('|');

  // Fetch the visible week up front (stale-while-revalidate).
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear prior week before async reload (skipped when cached)
    if (epgCache?.key !== cacheKey) setProgramsByDate({});
    days.forEach(async ({ dateStr }) => {
      const [broadcastEps, webEps] = await Promise.all([
        fetchBroadcast(dateStr, country),
        fetchWebSchedule(dateStr),
      ]);
      if (cancelled) return;
      setProgramsByDate(prev => {
        const next = { ...prev, [dateStr]: buildPrograms(broadcastEps, webEps, timezone, hideKids) };
        epgCache = { key: cacheKey, data: next };
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [country, timezone, hideKids, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday  = date === todayStr;
  const nowMins  = isToday ? nowMinsInWindow(timezone) : null;
  const allPrograms = programsByDate[date]; // undefined = loading
  // Apply "My Channels" if the user has selected any; otherwise show everything.
  const programs = useMemo(() => {
    if (!allPrograms) return allPrograms;
    if (!channelNames.length) return allPrograms;
    return allPrograms.filter(p => channelNames.some(name => channelNamesMatch(name, p.channelName)));
  }, [allPrograms, channelNames]);

  // Bucket into rails. Today → On Now / Up Next (next 3 hrs) / Later.
  // Future day → by time of day.
  const buckets = useMemo(() => {
    if (!programs) return [];
    if (nowMins === null) {
      const groups = [[], [], [], []];
      const labels = ['Morning', 'Afternoon', 'Evening', 'Late Night'];
      for (const p of programs) {
        const h = parseInt(p.airtime, 10);
        groups[h < 12 ? 0 : h < 17 ? 1 : h < 21 ? 2 : 3].push(p);
      }
      return labels.map((label, i) => ({ label, items: groups[i], live: false })).filter(b => b.items.length);
    }
    const now = [], next = [], later = [];
    for (const p of programs) {
      const s = minsFromStart(p.airtime);
      if (p.available || (s <= nowMins && nowMins < s + p.runtime)) now.push(p);
      else if (s > nowMins && s <= nowMins + 180) next.push(p);
      else if (s > nowMins + 180) later.push(p);
    }
    return [
      { label: 'On Now', items: now, live: true },
      { label: 'Up Next', items: next, live: false },
      { label: 'Later', items: later, live: false },
    ].filter(b => b.items.length);
  }, [programs, nowMins]);

  const { ref: daysRef, handlers: daysHandlers } = useDragScroll();

  return (
    <div className="epg-rails-outer">
      {/* ── Day selector ── */}
      <div className="epg-days" ref={daysRef} {...daysHandlers}>
        {days.map(d => (
          <button
            key={d.dateStr}
            className={`epg-day-btn${date === d.dateStr ? ' active' : ''}`}
            onClick={() => setDate(d.dateStr)}
          >
            <span className="epg-day-copy">
              <span className="epg-day-name">{d.weekday}</span>
              <span className="epg-day-month">{d.month}</span>
            </span>
            <span className="epg-day-num">{d.num}</span>
          </button>
        ))}
      </div>

      {programs === undefined ? (
        <LoadingSpinner />
      ) : buckets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">Nothing scheduled</div>
          <div className="empty-body">
            {channelNames.length > 0 && (allPrograms?.length ?? 0) > 0
              ? "None of your My Channels have anything on this date. Try another day or update My Channels in Settings."
              : isToday ? 'Nothing more airing today for your region.' : "Schedules aren't available for your region on this date."}
          </div>
        </div>
      ) : (
        <div className="epg-rails">
          {buckets.map(b => (
            <div className="epg-bucket" key={b.label}>
              <div className="epg-bucket-label">{b.label}</div>
              <Rail>
                {b.items.map(p => (
                  <PosterCard key={`${p.channelName}-${p.id}`} prog={p} live={b.live} onSelect={setSelected} />
                ))}
              </Rail>
            </div>
          ))}
        </div>
      )}

      <ProgramSheet prog={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
