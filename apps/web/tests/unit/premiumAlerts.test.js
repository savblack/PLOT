import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoDay, creditRole, releaseCandidates, regionalMovieRelease, personReleaseKey,
  finishedSeason, seasonFullyAired, readyOnSelectedServices, seasonReadyKey,
  selectedProviderIds, alertRegion,
} from '../../../../supabase/functions/_shared/premiumAlerts.js';

// The rules behind Premium actor/director and season-ready alerts. The bar is
// that a false alert is worse than a late one, so most of these pin down the
// cases that must stay silent.
//
// Ids are negative on purpose: they are not TMDB ids (AGENTS.md: never guess
// one) and the rules only use them as keys. Provider ids are fictional too.

const TODAY = '2026-09-28';
const WINDOW = { today: TODAY, since: '2026-09-25' };

const movie = (over = {}) => ({ id: -1, media_type: 'movie', title: 'Harbour Lights', release_date: '2026-09-27', order: 0, character: 'Mara', genre_ids: [18], poster_path: '/p.jpg', ...over });
const show = (over = {}) => ({ id: -2, media_type: 'tv', name: 'The Night Desk', first_air_date: '2026-09-26', character: 'Ellis', genre_ids: [18], ...over });

test('isoDay counts back UTC calendar days', () => {
  const now = new Date('2026-09-28T23:30:00Z');
  assert.equal(isoDay(now), '2026-09-28');
  assert.equal(isoDay(now, 3), '2026-09-25');
  assert.equal(isoDay(new Date('2026-03-01T00:00:00Z'), 1), '2026-02-28');
});

test('creditRole keeps real roles and drops appearances, bit parts and other crew', () => {
  assert.equal(creditRole(movie(), 'cast'), 'cast');
  assert.equal(creditRole(show(), 'cast'), 'cast');
  assert.equal(creditRole(movie({ job: 'Director' }), 'crew'), 'director');
  assert.equal(creditRole(show({ job: 'Creator' }), 'crew'), 'creator');
  // Playing yourself, talk shows, news and reality are appearances, not releases.
  assert.equal(creditRole(movie({ character: 'Self' }), 'cast'), null);
  assert.equal(creditRole(show({ character: 'Himself - Guest' }), 'cast'), null);
  assert.equal(creditRole(show({ genre_ids: [10767] }), 'cast'), null);
  assert.equal(creditRole(show({ genre_ids: [10764, 18] }), 'cast'), null);
  // Billed thirteenth or lower in a movie is a bit part.
  assert.equal(creditRole(movie({ order: 13 }), 'cast'), null);
  assert.equal(creditRole(movie({ order: 12 }), 'cast'), 'cast');
  // Producing is not directing; episode directors are not the show's release.
  assert.equal(creditRole(movie({ job: 'Producer' }), 'crew'), null);
  assert.equal(creditRole(show({ job: 'Director' }), 'crew'), null);
  assert.equal(creditRole({ ...movie(), media_type: 'person' }, 'cast'), null);
  assert.equal(creditRole({ media_type: 'movie' }, 'cast'), null);
});

test('releaseCandidates: TV premieres inside the window, never today', () => {
  const credits = { cast: [
    show(),
    show({ id: -3, first_air_date: TODAY }),         // may not have aired yet
    show({ id: -4, first_air_date: '2026-09-24' }),  // before the window
    show({ id: -5, first_air_date: null }),
  ], crew: [] };
  assert.deepEqual(releaseCandidates(credits, WINDOW).map(c => c.tmdbId), [-2]);
});

test('releaseCandidates: movies within the premiere horizon become candidates for a regional check', () => {
  const credits = { cast: [
    movie({ release_date: TODAY }),
    movie({ id: -6, release_date: '2026-05-01' }),   // festival premiere months ago: still a candidate
    movie({ id: -7, release_date: '2025-12-01' }),   // past the 180-day horizon
    movie({ id: -8, release_date: '2026-10-10' }),   // not out yet
  ], crew: [] };
  assert.deepEqual(releaseCandidates(credits, WINDOW).map(c => c.tmdbId).sort(), [-6, -1].sort());
});

test('releaseCandidates reports one entry per title, directing over acting', () => {
  const credits = { cast: [movie()], crew: [movie({ job: 'Director' }), movie({ job: 'Writer' })] };
  const out = releaseCandidates(credits, WINDOW);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { tmdbId: -1, mediaType: 'movie', title: 'Harbour Lights', posterPath: '/p.jpg', role: 'director', primaryDate: '2026-09-27' });
  assert.deepEqual(releaseCandidates(null, WINDOW), []);
});

const releases = (region, ...dates) => ({ results: [{ iso_3166_1: region, release_dates: dates.map(([type, d]) => ({ type, release_date: `${d}T00:00:00.000Z` })) }] });

test('regionalMovieRelease: the first general release in the viewer\'s own region', () => {
  assert.deepEqual(regionalMovieRelease(releases('AU', [3, '2026-09-26']), 'AU', WINDOW), { kind: 'theatrical', date: '2026-09-26' });
  assert.deepEqual(regionalMovieRelease(releases('AU', [4, '2026-09-28'], [5, '2026-09-20']), 'AU', WINDOW), { kind: 'digital', date: '2026-09-28' });
  // Another region's release says nothing about this one.
  assert.equal(regionalMovieRelease(releases('US', [3, '2026-09-26']), 'AU', WINDOW), null);
  // Premieres and limited runs are not "out".
  assert.equal(regionalMovieRelease(releases('AU', [1, '2026-09-26'], [2, '2026-09-27']), 'AU', WINDOW), null);
  // In cinemas a month ago: the digital release today is not a new release.
  assert.equal(regionalMovieRelease(releases('AU', [3, '2026-08-28'], [4, '2026-09-27']), 'AU', WINDOW), null);
  // Dated for later.
  assert.equal(regionalMovieRelease(releases('AU', [3, '2026-10-02']), 'AU', WINDOW), null);
  assert.equal(regionalMovieRelease(undefined, 'AU', WINDOW), null);
});

test('alert dedupe keys name the title, not the person or the kind', () => {
  assert.equal(personReleaseKey('movie', -1), 'person_release:movie:-1');
  assert.equal(seasonReadyKey(-2, 3), 'season_ready:tv:-2:s3');
});

const details = (over = {}) => ({
  status: 'Returning Series',
  last_episode_to_air: { season_number: 2, episode_number: 8, air_date: '2026-09-20', episode_type: 'finale' },
  next_episode_to_air: null,
  seasons: [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 10 }, { season_number: 2, episode_count: 8 }],
  ...over,
});

test('finishedSeason: a finale, an ended show, or a later next episode', () => {
  assert.deepEqual(finishedSeason(details(), TODAY), { season: 2, episodeCount: 8, finaleDate: '2026-09-20' });
  const standard = { season_number: 2, episode_number: 8, air_date: '2026-09-20', episode_type: 'standard' };
  assert.deepEqual(finishedSeason(details({ status: 'Ended', last_episode_to_air: standard }), TODAY)?.season, 2);
  assert.deepEqual(finishedSeason(details({ last_episode_to_air: standard, next_episode_to_air: { season_number: 3, air_date: '2027-01-01' } }), TODAY)?.season, 2);
});

test('finishedSeason stays silent while a season could still be airing', () => {
  const standard = { season_number: 2, episode_number: 6, air_date: '2026-09-20', episode_type: 'standard' };
  // Mid-season break or an unannounced finale: not finished.
  assert.equal(finishedSeason(details({ last_episode_to_air: standard }), TODAY), null);
  assert.equal(finishedSeason(details({ last_episode_to_air: { ...standard, episode_type: 'mid_season' } }), TODAY), null);
  // More of this season is scheduled.
  assert.equal(finishedSeason(details({ next_episode_to_air: { season_number: 2, episode_number: 9 } }), TODAY), null);
  // Finale is today: may not have aired where the person lives.
  assert.equal(finishedSeason(details({ last_episode_to_air: { ...details().last_episode_to_air, air_date: TODAY } }), TODAY), null);
  // Finished too long ago to be "newly ready".
  assert.equal(finishedSeason(details({ last_episode_to_air: { ...details().last_episode_to_air, air_date: '2026-01-01' } }), TODAY), null);
  // Specials, missing data.
  assert.equal(finishedSeason(details({ last_episode_to_air: { season_number: 0, air_date: '2026-09-20', episode_type: 'finale' } }), TODAY), null);
  assert.equal(finishedSeason(details({ seasons: [] }), TODAY), null);
  assert.equal(finishedSeason({}, TODAY), null);
});

const episodes = (n, date = '2026-09-01') => ({ episodes: Array.from({ length: n }, (_, i) => ({ episode_number: i + 1, air_date: date })) });

test('seasonFullyAired needs every episode listed and dated before today', () => {
  assert.equal(seasonFullyAired(episodes(8), 8, TODAY), true);
  assert.equal(seasonFullyAired(episodes(7), 8, TODAY), false);
  const gap = episodes(8); gap.episodes[3].episode_number = 12;
  assert.equal(seasonFullyAired(gap, 8, TODAY), false);
  const undated = episodes(8); undated.episodes[7].air_date = null;
  assert.equal(seasonFullyAired(undated, 8, TODAY), false);
  const tonight = episodes(8); tonight.episodes[7].air_date = TODAY;
  assert.equal(seasonFullyAired(tonight, 8, TODAY), false);
  assert.equal(seasonFullyAired({}, 0, TODAY), false);
});

const providers = { results: {
  AU: {
    flatrate: [{ provider_id: 101, provider_name: 'Service One' }],
    ads: [{ provider_id: 102, provider_name: 'Service Two' }],
    buy: [{ provider_id: 103, provider_name: 'Store' }],
  },
  US: { flatrate: [{ provider_id: 104, provider_name: 'Service Four' }] },
} };

test('readyOnSelectedServices: the viewer\'s own services, in their region, that they can watch on', () => {
  assert.deepEqual(readyOnSelectedServices(providers, 'AU', [101, 104]), [{ id: 101, name: 'Service One' }]);
  assert.deepEqual(readyOnSelectedServices(providers, 'AU', [102]), [{ id: 102, name: 'Service Two' }]);
  // Buying it is not "ready on your services".
  assert.deepEqual(readyOnSelectedServices(providers, 'AU', [103]), []);
  // Another region's catalogue does not count.
  assert.deepEqual(readyOnSelectedServices(providers, 'GB', [101, 104]), []);
  assert.deepEqual(readyOnSelectedServices(providers, 'AU', []), []);
  assert.deepEqual(readyOnSelectedServices(null, 'AU', [101]), []);
});

test('profile helpers: selected provider ids and region default', () => {
  assert.deepEqual(selectedProviderIds([{ id: 8, name: 'A' }, { id: '9' }, { id: 8 }, { name: 'no id' }, null]), [8, 9]);
  assert.deepEqual(selectedProviderIds(null), []);
  assert.equal(alertRegion('au'), 'AU');
  assert.equal(alertRegion(null), 'US');
  assert.equal(alertRegion('Australia'), 'US');
});
