import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addCalendarDays,
  airingShowSuggestion,
  calendarSuggestRequested,
  formatNextEpisodeCode,
  loadUpcomingSuggestions,
  movieSuggestion,
  trackedTitleIds,
} from '../../upcomingSuggestions.js';

const today = '2026-10-25';
const horizon = '2027-02-22';

const airingDetails = {
  status: 'Returning Series',
  first_air_date: '2024-06-01',
  last_episode_to_air: { air_date: '2026-10-18', season_number: 2, episode_number: 4 },
  next_episode_to_air: { air_date: '2026-11-01', season_number: 2, episode_number: 5 },
  name: 'Slow Horses',
};

test('the founding-users calendar link asks for suggestions', () => {
  const query = '?suggest=upcoming&utm_source=email&utm_medium=email&utm_campaign=founding_users&utm_content=release_calendar';
  assert.equal(calendarSuggestRequested(query), true);
  assert.equal(calendarSuggestRequested('utm_content=release_calendar'), true);
  assert.equal(calendarSuggestRequested('?utm_content=imports'), false);
  assert.equal(calendarSuggestRequested(''), false);
});

test('tracked ids cover the watchlist and shows already in progress', () => {
  const ids = trackedTitleIds(
    [{ tmdb_id: 10 }, { id: 11 }],
    [{ tmdb_id: 12 }],
  );
  assert.equal(ids.has(10), true);
  assert.equal(ids.has(11), true);
  assert.equal(ids.has(12), true);
  assert.equal(ids.has(13), false);
});

test('episode codes match the calendar labels', () => {
  assert.equal(formatNextEpisodeCode(2, 5), 'S02E05');
  assert.equal(formatNextEpisodeCode(null, 1), '');
});

test('addCalendarDays stays on the calendar date', () => {
  assert.equal(addCalendarDays('2026-10-25', 120), '2027-02-22');
  assert.equal(addCalendarDays('2026-10-25', -365), '2025-10-25');
});

test('an airing series with a future episode is suggested', () => {
  const show = airingShowSuggestion(
    { id: 100, name: 'Slow Horses', poster_path: '/p.jpg', genre_ids: [18], original_language: 'en' },
    airingDetails,
    today,
    horizon,
  );
  assert.equal(show?.next_code, 'S02E05');
  assert.equal(show?.next_air_date, '2026-11-01');
  assert.equal(show?.media_type, 'tv');
});

test('a series that has not premiered is left out', () => {
  const show = airingShowSuggestion(
    { id: 101, name: 'Years Away', poster_path: '/p.jpg' },
    {
      status: 'In Production',
      first_air_date: '2028-01-01',
      next_episode_to_air: { air_date: '2028-01-01', season_number: 1, episode_number: 1 },
    },
    today,
    horizon,
  );
  assert.equal(show, null);
});

test('a return dated past the horizon is left out', () => {
  const show = airingShowSuggestion(
    { id: 102, name: 'Hiatus', poster_path: '/p.jpg' },
    {
      ...airingDetails,
      next_episode_to_air: { air_date: '2028-06-01', season_number: 3, episode_number: 1 },
    },
    today,
    horizon,
  );
  assert.equal(show, null);
});

test('an ended series with no next episode is left out', () => {
  const show = airingShowSuggestion(
    { id: 103, name: 'Ended', poster_path: '/p.jpg' },
    { ...airingDetails, status: 'Ended', next_episode_to_air: null },
    today,
    horizon,
  );
  assert.equal(show, null);
});

test('a movie releasing soon is kept, a past one is not', () => {
  const soon = movieSuggestion(
    { id: 7, title: 'Soon', poster_path: '/m.jpg', release_date: '2026-11-12', _cinema: true },
    today,
    '2027-01-23',
  );
  assert.equal(soon?.release_date, '2026-11-12');
  assert.equal(soon?._cinema, true);
  assert.equal(movieSuggestion(
    { id: 8, title: 'Old', poster_path: '/m.jpg', release_date: '2020-01-01' },
    today,
    '2027-01-23',
  ), null);
});

test('loadUpcomingSuggestions drops tracked titles and keeps both sections', async () => {
  const result = await loadUpcomingSuggestions({
    todayStr: today,
    region: 'US',
    trackedIds: new Set([100]),
    discoverTV: async () => ({
      results: [
        { id: 100, name: 'Already tracking', poster_path: '/a.jpg', genre_ids: [18], original_language: 'en' },
        { id: 200, name: 'The Bear', poster_path: '/b.jpg', genre_ids: [18], original_language: 'en' },
        { id: 201, name: 'Not started', poster_path: '/c.jpg', genre_ids: [18], original_language: 'en' },
      ],
    }),
    discoverMovies: async (params) => {
      if (String(params.with_release_type).includes('4')) {
        return { results: [{ id: 9, title: 'At home', poster_path: '/s.jpg', release_date: '2026-12-01', genre_ids: [18], original_language: 'en' }] };
      }
      return { results: [{ id: 8, title: 'In theaters', poster_path: '/t.jpg', release_date: '2026-11-20', genre_ids: [18], original_language: 'en' }] };
    },
    getTVDetails: async (id) => {
      if (id === 201) {
        return { status: 'In Production', first_air_date: '2028-01-01', next_episode_to_air: { air_date: '2028-01-01', season_number: 1, episode_number: 1 } };
      }
      return {
        status: 'Returning Series',
        first_air_date: '2022-06-23',
        last_episode_to_air: { air_date: '2026-10-20' },
        next_episode_to_air: { air_date: '2026-11-05', season_number: 5, episode_number: 1 },
        name: 'The Bear',
      };
    },
  });

  assert.deepEqual(result.shows.map(show => show.id), [200]);
  assert.equal(result.shows[0].next_code, 'S05E01');
  assert.deepEqual(result.movies.map(movie => movie.title), ['In theaters', 'At home']);
  assert.equal(result.movies[0]._cinema, true);
  assert.equal(result.movies[1]._cinema, false);
  assert.equal(result.showsUnavailable, false);
  assert.equal(result.moviesUnavailable, false);
});

test('a failed discover is unavailable, an empty one is not', async () => {
  const failed = await loadUpcomingSuggestions({
    todayStr: today,
    discoverTV: async () => null,
    discoverMovies: async () => { throw new Error('down'); },
    getTVDetails: async () => null,
  });
  assert.equal(failed.showsUnavailable, true);
  assert.equal(failed.moviesUnavailable, true);
  assert.deepEqual(failed.shows, []);
  assert.deepEqual(failed.movies, []);

  const empty = await loadUpcomingSuggestions({
    todayStr: today,
    discoverTV: async () => ({ results: [] }),
    discoverMovies: async () => ({ results: [] }),
    getTVDetails: async () => null,
  });
  assert.equal(empty.showsUnavailable, false);
  assert.equal(empty.moviesUnavailable, false);
});
