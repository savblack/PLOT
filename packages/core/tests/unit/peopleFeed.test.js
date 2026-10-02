import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comingUpFromCredits, feedItems, feedChip, filterFeedByType, groupByDate, groupByPerson, isAppearance, shiftDay, viewerDate,
} from '../../peopleFeed.js';
import { suggestPeople } from '../../peopleSuggestions.js';

// Ids are negative on purpose: not TMDB ids (AGENTS.md: never guess one).
const TODAY = '2026-10-01';

test('Coming up: dated work from today, soonest first, no appearances or other crew jobs', () => {
  const credits = {
    cast: [
      { id: -1, media_type: 'movie', title: 'Harbour Lights', release_date: '2026-12-16', character: 'Mara' },
      { id: -2, media_type: 'tv', name: 'East Pier', first_air_date: TODAY, character: 'Cathy' },
      { id: -3, media_type: 'movie', title: 'Old One', release_date: '2025-01-01' },
      { id: -4, media_type: 'movie', title: 'Gala Night', release_date: '2026-11-01', character: 'Self' },
      { id: -5, media_type: 'tv', name: 'Late Talk', first_air_date: '2026-11-01', genre_ids: [10767] },
      { id: -6, media_type: 'movie', title: 'Undated' },
    ],
    crew: [
      { id: -1, media_type: 'movie', title: 'Harbour Lights', release_date: '2026-12-16', job: 'Producer' },
      { id: -7, media_type: 'movie', title: 'First Film', release_date: '2027-03-01', job: 'Director' },
      { id: -8, media_type: 'movie', title: 'Written', release_date: '2027-03-01', job: 'Writer' },
    ],
  };
  const items = comingUpFromCredits(credits, TODAY);
  assert.deepEqual(items.map(i => [i.tmdbId, i.today]), [[-2, true], [-1, false], [-7, false]]);
  assert.equal(items[1].role, 'Mara');
  assert.equal(items[2].role, 'Director');
  assert.equal(isAppearance({ character: 'Herself' }), true);
});

const row = (over) => ({ tmdb_person_id: -10, person_name: 'Ada Quill', person_role: 'cast', media_type: 'movie', tmdb_id: -1, season_number: 0, kind: 'film', title: 'Harbour Lights', poster_path: null, release_date: '2026-09-01', regional_releases: {}, network: null, episode_count: null, premiere_drop: null, ...over });

test('viewerDate uses the viewer\'s regional release, else the primary date', () => {
  const film = row({ regional_releases: { AU: { kind: 'theatrical', date: '2026-09-20' } } });
  assert.deepEqual(viewerDate(film, 'AU'), { date: '2026-09-20', releaseKind: 'theatrical' });
  assert.deepEqual(viewerDate(film, 'GB'), { date: '2026-09-01', releaseKind: null });
});

test('chips: Out today, In cinemas, New season, Dated', () => {
  assert.equal(feedChip({ mediaType: 'movie', kind: 'film', date: TODAY, releaseKind: 'theatrical' }, TODAY), 'outToday');
  assert.equal(feedChip({ mediaType: 'movie', kind: 'film', date: '2026-09-20', releaseKind: 'theatrical' }, TODAY), 'inCinemas');
  assert.equal(feedChip({ mediaType: 'movie', kind: 'film', date: '2026-09-20', releaseKind: 'digital' }, TODAY), null);
  assert.equal(feedChip({ mediaType: 'tv', kind: 'season', date: '2026-09-16', releaseKind: null }, TODAY), 'newSeason');
  assert.equal(feedChip({ mediaType: 'tv', kind: 'season', date: '2026-10-15', releaseKind: null }, TODAY), 'newSeason');
  assert.equal(feedChip({ mediaType: 'movie', kind: 'film', date: '2026-12-03', releaseKind: null }, TODAY), 'dated');
  assert.equal(feedChip({ mediaType: 'tv', kind: 'series', date: '2026-12-03', releaseKind: null }, TODAY), 'dated');
});

test('feedItems: one item per title or season with every followed person, out first then dated', () => {
  const rows = [
    row({ tmdb_id: -1, release_date: '2026-12-16', regional_releases: { AU: { kind: 'theatrical', date: '2026-12-16' } } }),
    row({ tmdb_person_id: -11, person_name: 'Ben Arlo', person_role: 'director', tmdb_id: -1, release_date: '2026-12-16', regional_releases: { AU: { kind: 'theatrical', date: '2026-12-16' } } }),
    row({ tmdb_id: -2, media_type: 'tv', kind: 'season', season_number: 6, title: 'Slow Lane', release_date: '2026-09-16', network: 'Service Two' }),
    row({ tmdb_id: -3, media_type: 'tv', kind: 'series', season_number: 1, title: 'East Pier', release_date: TODAY }),
    row({ tmdb_id: -4, release_date: '2026-07-01' }), // out too long ago
    row({ tmdb_id: -5, release_date: null }),
  ];
  const items = feedItems(rows, { region: 'AU', today: TODAY });
  assert.deepEqual(items.map(i => [i.tmdbId, i.chip]), [[-3, 'outToday'], [-2, 'newSeason'], [-1, 'dated']]);
  assert.deepEqual(items[2].people.map(p => p.name), ['Ada Quill', 'Ben Arlo']);
  assert.equal(items[1].season, 6);

  // The same Movies / TV / Cinema filter as every other page.
  assert.deepEqual(filterFeedByType(items, ['tv']).map(i => i.tmdbId), [-3, -2]);
  assert.deepEqual(filterFeedByType(items, ['cinema']).map(i => i.tmdbId), [-1]);
  assert.deepEqual(filterFeedByType(items, ['movie']).map(i => i.tmdbId), []);
  assert.equal(filterFeedByType(items, ['tv', 'movie', 'cinema']).length, 3);

  assert.deepEqual(groupByDate(items).map(g => [g.key, g.items.length]), [['out', 2], ['2026-12', 1]]);
  const byPerson = groupByPerson(items, [{ tmdb_person_id: -11, name: 'Ben Arlo' }, { tmdb_person_id: -10, name: 'Ada Quill' }, { tmdb_person_id: -12, name: 'No One' }]);
  assert.deepEqual(byPerson.map(g => [g.person.name, g.items.length]), [['Ben Arlo', 1], ['Ada Quill', 3]]);
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
});

const cast = (id, name, order) => ({ id, name, order, profile_path: null });
const film = (title, castList, directors) => ({ title, credits: { cast: castList, crew: directors.map(d => ({ ...d, job: 'Director' })) } });
const show = (name, castList, creators) => ({ name, aggregate_credits: { cast: castList }, created_by: creators });

test('suggestions: four people from logged titles, at least one director', () => {
  const titles = [
    film('Harbour Lights', [cast(-1, 'Ada Quill', 0), cast(-2, 'Ben Arlo', 1), cast(-3, 'Cy Moss', 2)], [{ id: -9, name: 'Dee Vale' }]),
    film('Long Way', [cast(-1, 'Ada Quill', 0), cast(-4, 'Eli Park', 1)], [{ id: -8, name: 'Fay Lin' }]),
    show('Slow Lane', [cast(-1, 'Ada Quill', 0), cast(-2, 'Ben Arlo', 3)], [{ id: -9, name: 'Dee Vale' }]),
    film('Third', [cast(-2, 'Ben Arlo', 0), cast(-5, 'Gus Roe', 1)], []),
  ];
  const picks = suggestPeople(titles);
  assert.equal(picks.length, 4);
  assert.ok(picks.some(p => p.kind === 'directed'), 'a director is always included');
  assert.deepEqual(picks.slice(0, 2).map(p => [p.name, p.count]), [['Ada Quill', 3], ['Ben Arlo', 3]]);
  const dee = picks.find(p => p.id === -9);
  assert.deepEqual([dee.kind, dee.count], ['directed', 2]);

  // People already followed are never suggested.
  assert.equal(suggestPeople(titles, { exclude: new Set([-1, -9]) }).some(p => p.id === -1 || p.id === -9), false);
  assert.ok(suggestPeople(titles, { exclude: new Set([-9]) }).some(p => p.kind === 'directed'));

  // Only actors among the logged titles: still four, nothing invented.
  const actorsOnly = suggestPeople([film('Fourth', [cast(-1, 'Ada Quill', 0)], [])]);
  assert.deepEqual(actorsOnly.map(p => p.id), [-1]);
});

test('short dates read "16 Sep", "16 Sep 2027" and "Thu 1 Oct"', async () => {
  const { shortDayMonth, weekdayDayMonth } = await import('../../date.js');
  assert.equal(shortDayMonth('2026-09-16', 2026), '16 Sep');
  assert.equal(shortDayMonth('2027-12-16', 2026), '16 Dec 2027');
  assert.equal(shortDayMonth('', 2026), '');
  assert.equal(weekdayDayMonth('2026-10-01'), 'Thu 1 Oct');
});
