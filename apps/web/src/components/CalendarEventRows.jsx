import { useState } from 'react';
import { posterUrl } from '../utils/images.js';
import { tmdb } from '@plot/core/tmdb.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { MEDIA } from '../copy/media.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import { DayGutter } from './CalendarStream.jsx';

/* One day of "My dates": the diary gutter and the day's events stacked as
   rows — poster, title, what the date is, where and when, and a rose pill
   when you are behind on that show. */

const ChevronRight = () => <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6" /></svg>;
const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

/* Line 2 of a row: what this date actually is. Episodes read as their code
   and name ("S05E03 · Blindsided"); a first episode with no name yet is the
   season premiere; releases say which kind. */
function describeEvent(ev) {
  switch (ev.type) {
    case 'episode': {
      const ep   = ev.item?.episode;
      const name = ep?.name || (ep?.episode_number === 1 ? CALENDAR_VIEW.seasonPremiere : null);
      return name ? `${ev.label} · ${name}` : ev.label;
    }
    case 'cinema':    return CALENDAR_VIEW.inCinemas;
    case 'streaming': return CALENDAR_VIEW.eventLabel.streaming;
    case 'reminder':  return CALENDAR_VIEW.eventLabel.reminder;
    default:          return ev.label;
  }
}

/* Line 3: network and air time, whichever we know. Nothing when we know neither. */
function eventMeta(ev) {
  return [ev.item?.network_name, ev.item?.air_time].filter(Boolean).join(' · ');
}

export default function CalendarEventRows({ day, openPanel }) {
  const [resolving, setResolving] = useState(null); // tvmaze_ep_id being resolved

  async function openReminder(title, tvmazeEpId) {
    setResolving(tvmazeEpId);
    try {
      const match = await tmdb.resolveTitle(title, 'tv');
      if (match) openPanel(match.id, 'tv');
    } finally {
      setResolving(null);
    }
  }

  return (
    <>
      <DayGutter ds={day.ds} />
      <div className="cal-stream-rows">
        {day.events.map((ev, i) => {
          const item       = ev.item;
          const id         = item?.tmdb_id;
          const type       = item?.media_type || 'movie';
          const img        = posterUrl(item?.poster_path, 'w92');
          const title      = item?.title || item?.name || MEDIA.unknown;
          const isReminder = ev.type === 'reminder';
          const isLoading  = isReminder && resolving === item?.id;
          const meta       = eventMeta(ev);
          const behind     = ev.type === 'episode' && ev.behind > 0 ? ev.behind : 0;

          const handleClick = isReminder
            ? () => openReminder(title, item?.id)
            : () => id && openPanel(id, type);

          return (
            <div
              key={i}
              className={`cal-stream-row${(!id && !isReminder) ? ' cal-stream-row--no-link' : ''}${isLoading ? ' cal-stream-row--loading' : ''}`}
              onClick={handleClick}
            >
              <div className="cal-stream-poster">
                {isReminder
                  ? (isLoading ? <PlotLoader size="xs" ariaHidden /> : <BellIcon />)
                  : (img && <img src={img} alt="" />)}
              </div>
              <div className="cal-stream-info">
                <div className="cal-stream-title">{title}</div>
                <div className="cal-stream-sub">{describeEvent(ev)}</div>
                {meta && <div className="cal-stream-meta">{meta}</div>}
              </div>
              {behind > 0 && (
                <span className="cal-stream-behind">{CALENDAR_VIEW.episodesBehind(behind)}</span>
              )}
              <span className="cal-stream-chev" aria-hidden="true"><ChevronRight /></span>
            </div>
          );
        })}
      </div>
    </>
  );
}
