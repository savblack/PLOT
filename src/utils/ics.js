function fmtDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
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
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

export function generateICS(events) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plot//Plot Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Plot Calendar',
    'X-WR-CALDESC:Your movies and TV calendar from Plot',
  ];

  for (const ev of events) {
    const idPart = ev.item?.tmdb_id ?? ev.item?.id ?? Math.random().toString(36).slice(2);
    const uid = `plot-${ev.type}-${idPart}-${ev.date}@plot.tv`;
    const title = ev.item?.title || 'Untitled';
    let summary = '';
    let description = '';

    if (ev.type === 'episode') {
      summary = `${title} ${ev.label}`;
      if (ev.item?.episode?.name) description = ev.item.episode.name;
    } else if (ev.type === 'release') {
      summary = title;
      description = ev.item?.media_type === 'movie' ? 'Movie release' : 'TV release';
    } else if (ev.type === 'reminder') {
      summary = title;
      const parts = [];
      if (ev.item?.network_name) parts.push(ev.item.network_name);
      if (ev.label && ev.label !== 'Reminder') parts.push(ev.label);
      description = parts.join(' · ');
    }

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

export function downloadICS(events, filename = 'plot-calendar.ics') {
  const content = generateICS(events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
