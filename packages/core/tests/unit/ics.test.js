import assert from 'node:assert/strict';
import test from 'node:test';

import { generateICS } from '../../ics.js';

test('cinema and streaming snapshots keep the title and the kind of date', () => {
  const ics = generateICS([
    { date: '2026-10-01', type: 'cinema', label: 'Cinema', item: { title: 'Dune', tmdb_id: 1, media_type: 'movie' } },
    { date: '2026-11-01', type: 'streaming', label: 'Streaming', item: { title: 'Arrival', tmdb_id: 2, media_type: 'movie' } },
  ]);
  assert.match(ics, /SUMMARY:Dune/);
  assert.match(ics, /DESCRIPTION:Cinema/);
  assert.match(ics, /SUMMARY:Arrival/);
  assert.match(ics, /DESCRIPTION:Streaming/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261001/);
  assert.match(ics, /DTEND;VALUE=DATE:20261002/);
  assert.match(ics, /UID:plot-cinema-1-2026-10-01@plot\.tv/);
});

test('episode and reminder rows escape punctuation and keep their labels', () => {
  const ics = generateICS([
    {
      date: '2026-10-02',
      type: 'episode',
      label: 'S01E02',
      item: { title: 'The Show', tmdb_id: 9, episode: { name: 'Pilot, part 1' } },
    },
    {
      date: '2026-10-03',
      type: 'reminder',
      label: '20:00',
      item: { title: 'News', id: 'ep-1', network_name: 'BBC One' },
    },
  ]);
  assert.match(ics, /SUMMARY:The Show S01E02/);
  assert.match(ics, /DESCRIPTION:Pilot\\, part 1/);
  assert.match(ics, /SUMMARY:News/);
  assert.match(ics, /DESCRIPTION:BBC One · 20:00/);
});

test('a bad date is dropped and an empty list is still a calendar', () => {
  const ics = generateICS([{ date: 'soon', type: 'cinema', label: 'Cinema', item: { title: 'Nope' } }]);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
  assert.doesNotMatch(ics, /SUMMARY:Nope/);
});

test('long summaries are folded so a line stays within the ics limit', () => {
  const title = 'A'.repeat(90);
  const ics = generateICS([
    { date: '2026-12-01', type: 'cinema', label: 'Cinema', item: { title, tmdb_id: 3 } },
  ]);
  const summary = ics.split('\r\n').find(line => line.startsWith('SUMMARY:'));
  assert.ok(summary);
  assert.ok(summary.length <= 75);
  assert.match(ics, / AAAAA/);
});
