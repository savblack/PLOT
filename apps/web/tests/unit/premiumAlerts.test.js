import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoDay, creditRole, feedCandidates, regionalReleases, regionalMovieRelease, personReleaseKey,
  showSeasons, premiereDrop, releaseForRegion, isAppearance,
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
  assert.equal(creditRole(movie(), 'cast', TODAY), 'cast');
  assert.equal(creditRole(movie({ job: 'Director' }), 'crew', TODAY), 'director');
  assert.equal(creditRole(show({ job: 'Creator' }), 'crew', TODAY), 'creator');
  // Playing yourself, talk shows, news and reality are appearances, not releases.
  assert.equal(isAppearance(movie({ character: 'Self' })), true);
  assert.equal(creditRole(movie({ character: 'Self' }), 'cast', TODAY), null);
  assert.equal(creditRole(show({ character: 'Himself - Guest', episode_count: 9 }), 'cast', TODAY), null);
  assert.equal(creditRole(show({ genre_ids: [10767], episode_count: 40 }), 'cast', TODAY), null);
  assert.equal(creditRole(show({ genre_ids: [10764, 18], episode_count: 9 }), 'cast', TODAY), null);
  // Billed thirteenth or lower in a film is a bit part.
  assert.equal(creditRole(movie({ order: 13 }), 'cast', TODAY), null);
  assert.equal(creditRole(movie({ order: 12 }), 'cast', TODAY), 'cast');
  // Producing is not directing; episode directors are not the show's release.
  assert.equal(creditRole(movie({ job: 'Producer' }), 'crew', TODAY), null);
  assert.equal(creditRole(show({ job: 'Director' }), 'crew', TODAY), null);
  assert.equal(creditRole({ ...movie(), media_type: 'person' }, 'cast', TODAY), null);
  assert.equal(creditRole({ media_type: 'movie' }, 'cast', TODAY), null);
});

test('creditRole: series regulars count, guest spots on older shows do not', () => {
  const older = { first_air_date: '2022-04-01' };
  assert.equal(creditRole(show({ ...older, episode_count: 24 }), 'cast', TODAY), 'cast');
  assert.equal(creditRole(show({ ...older, episode_count: 3 }), 'cast', TODAY), 'cast');
  assert.equal(creditRole(show({ ...older, episode_count: 2 }), 'cast', TODAY), null);
  // A new or announced series lists few episodes per actor before it airs.
  assert.equal(creditRole(show({ episode_count: 1 }), 'cast', TODAY), 'cast');
  assert.equal(creditRole(show({ first_air_date: null, episode_count: 0 }), 'cast', TODAY), 'cast');
});

test('feedCandidates: films inside the feed window, shows for a season check, one entry per title', () => {
  const credits = {
    cast: [
      movie(),
      movie({ id: -6, release_date: '2027-12-16' }),   // dated, a year out
      movie({ id: -7, release_date: '2026-05-01' }),   // out too long ago for the feed
      movie({ id: -8, release_date: null }),           // undated
      show({ episode_count: 8 }),
      show({ id: -9, first_air_date: '2005-03-27', episode_count: 200 }), // past the show horizon
      show({ id: -10, first_air_date: '2019-01-01', episode_count: 1 }),  // a guest spot
    ],
    crew: [movie({ job: 'Director' }), show({ job: 'Creator' })],
  };
  const { films, shows } = feedCandidates(credits, TODAY);
  assert.deepEqual(films.map(f => [f.tmdbId, f.role]), [[-1, 'director'], [-6, 'cast']]);
  assert.deepEqual(shows.map(s => [s.tmdbId, s.role]), [[-2, 'creator']]);
  assert.equal(films[1].character, 'Mara');
  assert.equal(films[0].character, null);
  assert.deepEqual(feedCandidates(null, TODAY), { films: [], shows: [] });
});

const releases = (region, ...dates) => ({ results: [{ iso_3166_1: region, release_dates: dates.map(([type, d]) => ({ type, release_date: `${d}T00:00:00.000Z` })) }] });

test('regionalReleases keeps each region\'s first theatrical or digital release', () => {
  const body = { results: [
    ...releases('AU', [1, '2026-09-01'], [3, '2026-09-26'], [4, '2026-10-20']).results,
    ...releases('US', [2, '2026-09-10'], [4, '2026-09-24']).results,
    { iso_3166_1: 'bad', release_dates: [{ type: 3, release_date: '2026-09-01' }] },
  ] };
  assert.deepEqual(regionalReleases(body), {
    AU: { kind: 'theatrical', date: '2026-09-26' },
    US: { kind: 'digital', date: '2026-09-24' },
  });
  assert.deepEqual(regionalReleases(null), {});
});

test('regionalMovieRelease: the first general release in the viewer\'s own region', () => {
  assert.deepEqual(regionalMovieRelease(releases('AU', [3, '2026-09-26']), 'AU', WINDOW), { kind: 'theatrical', date: '2026-09-26' });
  assert.deepEqual(regionalMovieRelease(releases('AU', [4, '2026-09-28'], [5, '2026-09-20']), 'AU', WINDOW), { kind: 'digital', date: '2026-09-28' });
  assert.equal(regionalMovieRelease(releases('US', [3, '2026-09-26']), 'AU', WINDOW), null);
  assert.equal(regionalMovieRelease(releases('AU', [1, '2026-09-26'], [2, '2026-09-27']), 'AU', WINDOW), null);
  // In cinemas a month ago: the digital release today is not a new release.
  assert.equal(regionalMovieRelease(releases('AU', [3, '2026-08-28'], [4, '2026-09-27']), 'AU', WINDOW), null);
  assert.equal(regionalMovieRelease(releases('AU', [3, '2026-10-02']), 'AU', WINDOW), null);
  assert.equal(regionalMovieRelease(undefined, 'AU', WINDOW), null);
});

test('showSeasons: dated numbered seasons inside the window, season 1 as the series', () => {
  const details = {
    networks: [{ name: 'Service One' }],
    seasons: [
      { season_number: 0, air_date: '2026-09-20', episode_count: 2 },  // specials
      { season_number: 1, air_date: '2019-04-01', episode_count: 6 },  // long ago
      { season_number: 5, air_date: '2026-09-26', episode_count: 6 },
      { season_number: 6, air_date: '2027-03-01', episode_count: 6 },
      { season_number: 7, air_date: null, episode_count: 0 },          // announced, undated
    ],
  };
  assert.deepEqual(showSeasons(details, TODAY), [
    { season: 5, kind: 'season', date: '2026-09-26', episodeCount: 6, network: 'Service One' },
    { season: 6, kind: 'season', date: '2027-03-01', episodeCount: 6, network: 'Service One' },
  ]);
  assert.equal(showSeasons({ seasons: [{ season_number: 1, air_date: '2026-09-26' }] }, TODAY)[0].kind, 'series');
});

test('premiereDrop tells a whole-season drop from a weekly release', () => {
  const eps = (dates) => ({ episodes: dates.map((d, i) => ({ episode_number: i + 1, air_date: d })) });
  assert.equal(premiereDrop(eps(['2026-09-26', '2026-09-26', '2026-09-26']), '2026-09-26'), 3);
  assert.equal(premiereDrop(eps(['2026-09-26', '2026-10-03', '2026-10-10']), '2026-09-26'), 1);
  assert.equal(premiereDrop({}, '2026-09-26'), 1);
});

test('releaseForRegion: films by the viewer\'s region, shows by their air date', () => {
  const film = { media_type: 'movie', kind: 'film', release_date: '2026-05-01', regional_releases: { AU: { kind: 'theatrical', date: '2026-09-26' } } };
  assert.deepEqual(releaseForRegion(film, 'AU'), { kind: 'theatrical', date: '2026-09-26' });
  // No regional date: no alert, whatever the primary date says.
  assert.equal(releaseForRegion(film, 'GB'), null);
  assert.deepEqual(releaseForRegion({ media_type: 'tv', kind: 'series', release_date: '2026-09-26' }, 'GB'), { kind: 'premiere', date: '2026-09-26' });
  assert.deepEqual(releaseForRegion({ media_type: 'tv', kind: 'season', release_date: '2026-09-26' }, 'GB'), { kind: 'season', date: '2026-09-26' });
  assert.equal(releaseForRegion({ media_type: 'tv', kind: 'season', release_date: null }, 'GB'), null);
});

test('alert dedupe keys: one per title, and one per later season of a show', () => {
  assert.equal(personReleaseKey('movie', -1), 'person_release:movie:-1');
  assert.equal(personReleaseKey('tv', -2, 1), 'person_release:tv:-2');
  assert.equal(personReleaseKey('tv', -2, 6), 'person_release:tv:-2:s6');
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
