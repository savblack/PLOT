// DOM download only. ICS text lives in @plot/core/ics.js so mobile can share
// the same snapshot without a second copy of the calendar rules.
import { generateICS } from '@plot/core/ics.js';

export { generateICS };

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
