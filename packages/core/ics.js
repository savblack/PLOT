/**
 * One-time calendar snapshot (.ics). Shared by web download and mobile share.
 * The live Premium feed builds its own ICS in supabase/functions/calendar-feed
 * because that function cannot import this package at deploy time.
 *
 * Events are the shape from buildCalendarEvents: cinema, streaming, episode,
 * reminder. `release` is accepted so an older caller still gets a title.
 */

function fmtDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function nextDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function esc(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    parts.push(` ${line.slice(i, i + 74)}`);
    i += 74;
  }
  return parts.join('\r\n');
}

function eventCopy(ev) {
  const title = ev.item?.title || ev.item?.name || 'Untitled';
  if (ev.type === 'episode') {
    return {
      summary: ev.label ? `${title} ${ev.label}` : title,
      description: ev.item?.episode?.name || '',
    };
  }
  if (ev.type === 'reminder') {
    const parts = [];
    if (ev.item?.network_name) parts.push(ev.item.network_name);
    if (ev.label && ev.label !== 'Reminder') parts.push(ev.label);
    return { summary: title, description: parts.join(' · ') };
  }
  if (ev.type === 'release') {
    return {
      summary: title,
      description: ev.item?.media_type === 'movie' ? 'Movie release' : 'TV release',
    };
  }
  if (ev.type === 'cinema' || ev.type === 'streaming') {
    return { summary: title, description: ev.label || (ev.type === 'cinema' ? 'Cinema' : 'Streaming') };
  }
  return { summary: title, description: ev.label || '' };
}

/**
 * @param {Array<{ date?: string, type?: string, label?: string, item?: any }>} events
 * @returns {string}
 */
export function generateICS(events) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PLOT//PLOT Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:plot Calendar',
    'X-WR-CALDESC:Your movies and TV calendar from plot',
  ];

  for (const ev of events || []) {
    if (!ev?.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) continue;
    const idPart = ev.item?.tmdb_id ?? ev.item?.id ?? ev.item?.title ?? ev.type ?? 'event';
    const uid = `plot-${ev.type}-${idPart}-${ev.date}@plot.tv`;
    const { summary, description } = eventCopy(ev);

    lines.push('BEGIN:VEVENT');
    lines.push(fold(`UID:${uid}`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(ev.date)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(ev.date)}`);
    lines.push(fold(`SUMMARY:${esc(summary)}`));
    if (description) lines.push(fold(`DESCRIPTION:${esc(description)}`));
    lines.push('X-APPLE-DEFAULT-ALARM:FALSE');
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:NONE');
    lines.push('TRIGGER;VALUE=DURATION:-PT0S');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
