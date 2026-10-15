import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { configure } from '../../config.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
import { extractMigrationKeyChanges } from '../../../../scripts/lib/dbWritePathChecks.mjs';
import {
  applyArtwork,
  feedDisplayItem,
  artworkCatalog,
  artworkKey,
  artworkMap,
  artworkPath,
  artworkRecord,
  artworkSubject,
  isTmdbFilePath,
  loadArtworkCatalog,
  sortArtworkOptions,
} from '../../artwork.js';
import { clearUserArtwork, readUserArtwork, saveUserArtwork } from '../../artworkStore.js';

const POSTER = '/poster.jpg';
const SEASON = '/season.jpg';
const BACKDROP = '/backdrop.jpg';
const PHOTO = '/photo.jpg';

test('a TMDB file path is a rooted path and nothing else', () => {
  assert.equal(isTmdbFilePath(POSTER), true);
  assert.equal(isTmdbFilePath('poster.jpg'), false);
  assert.equal(isTmdbFilePath('https://image.tmdb.org/t/p/w342/poster.jpg'), false);
  assert.equal(isTmdbFilePath('/../poster.jpg'), false);
  assert.equal(isTmdbFilePath('/poster file.jpg'), false);
  assert.equal(isTmdbFilePath('/poster\\file.jpg'), false);
});

test('subjects accept only the kinds that belong on them', () => {
  assert.deepEqual(artworkSubject({ subjectType: 'movie', tmdbId: 5, kind: 'logo' }), {
    subject_type: 'movie', tmdb_id: 5, season_number: -1, kind: 'logo',
  });
  assert.equal(artworkSubject({ subjectType: 'movie', tmdbId: 5, kind: 'profile' }), null);
  assert.equal(artworkSubject({ subjectType: 'season', tmdbId: 5, seasonNumber: 0, kind: 'poster' })?.season_number, 0);
  assert.equal(artworkSubject({ subjectType: 'season', tmdbId: 5, kind: 'poster' }), null);
  assert.equal(artworkSubject({ subjectType: 'person', tmdbId: 0, kind: 'profile' }), null);
  assert.equal(artworkRecord('owner', { subjectType: 'tv', tmdbId: 5, kind: 'poster', filePath: 'https://example.com/a.jpg' }), null);
});

test('a season poster wins over the show poster and a person photo stays on the profile', () => {
  const map = artworkMap([
    { subject_type: 'tv', tmdb_id: 8, season_number: -1, kind: 'poster', file_path: POSTER },
    { subject_type: 'season', tmdb_id: 8, season_number: 2, kind: 'poster', file_path: SEASON },
    { subject_type: 'tv', tmdb_id: 8, season_number: -1, kind: 'backdrop', file_path: BACKDROP },
    { subject_type: 'person', tmdb_id: 4, season_number: -1, kind: 'profile', file_path: PHOTO },
    { subject_type: 'movie', tmdb_id: 8, season_number: -1, kind: 'poster', file_path: 'https://nope.example/a.jpg' },
  ]);
  assert.equal(artworkKey('season', 8, 0, 'poster'), 'season:8:0:poster');
  assert.equal(artworkPath(map, 'tv', 8, 'poster'), POSTER);
  const episode = applyArtwork({ tmdb_id: 8, media_type: 'tv', poster_path: '/default.jpg', episode: { season_number: 2 } }, map);
  assert.equal(episode.poster_path, SEASON);
  assert.equal(episode.posterPath, SEASON);
  assert.equal(episode.backdrop_path, BACKDROP);
  const watching = applyArtwork({ tmdb_id: 8, media_type: 'tv', poster_path: '/default.jpg', current_season: 2 }, map);
  assert.equal(watching.poster_path, SEASON);
  const show = applyArtwork({ tmdbId: 8, posterPath: '/default.jpg', season: 3 }, map);
  assert.equal(show.posterPath, POSTER);
  const person = applyArtwork({ id: 4, media_type: 'person', profile_path: '/face.jpg' }, map);
  assert.equal(person.profile_path, PHOTO);
  assert.equal(applyArtwork({ id: 9, media_type: 'movie', poster_path: '/film.jpg' }, map).poster_path, '/film.jpg');
  const specialsMap = artworkMap([
    { subject_type: 'tv', tmdb_id: 8, season_number: -1, kind: 'poster', file_path: POSTER },
    { subject_type: 'season', tmdb_id: 8, season_number: 0, kind: 'poster', file_path: SEASON },
  ]);
  const series = applyArtwork(feedDisplayItem({ tmdbId: 8, mediaType: 'tv', kind: 'series', season: 0, posterPath: '/default.jpg' }), specialsMap);
  assert.equal(series.posterPath, POSTER);
  const specials = applyArtwork(feedDisplayItem({ tmdbId: 8, mediaType: 'tv', kind: 'season', season: 0, posterPath: '/default.jpg' }), specialsMap);
  assert.equal(specials.posterPath, SEASON);
});

test('options are ordered by vote and the catalog keeps Specials with the show', () => {
  const options = sortArtworkOptions([
    { file_path: '/low.jpg', vote_average: 1, vote_count: 10 },
    { file_path: 'not-a-path', vote_average: 9 },
    { file_path: '/high.jpg', vote_average: 4, vote_count: 1 },
    { file_path: '/tied.jpg', vote_average: 4, vote_count: 3 },
  ]);
  assert.deepEqual(options.map(image => image.file_path), ['/tied.jpg', '/high.jpg', '/low.jpg']);
  const sections = artworkCatalog({
    mediaType: 'tv',
    tmdbId: 8,
    seasonNumber: 0,
    titleImages: { posters: [{ file_path: POSTER, vote_average: 1 }], logos: [] },
    seasonImages: { posters: [{ file_path: SEASON, vote_average: 2 }] },
  });
  assert.deepEqual(sections.map(section => section.key), ['poster', 'backdrop', 'logo', 'season-poster']);
  assert.equal(sections[3].seasonNumber, 0);
  assert.equal(sections[3].options[0].file_path, SEASON);
  assert.equal(artworkCatalog({ mediaType: 'movie', tmdbId: 3, seasonNumber: 1 }).some(section => section.subjectType === 'season'), false);
});

test('a failed image read leaves the other groups usable', async () => {
  const client = {
    images: async () => ({ posters: [{ file_path: POSTER, vote_average: 1 }] }),
    seasonImages: async () => { throw new Error('offline'); },
    personImages: async () => null,
  };
  const show = await loadArtworkCatalog(client, { mediaType: 'tv', tmdbId: 8, seasonNumber: 1 });
  assert.equal(show.failed, false);
  assert.equal(show.sections[0].options[0].file_path, POSTER);
  assert.equal(show.sections[3].options.length, 0);
  const person = await loadArtworkCatalog(client, { mediaType: 'person', tmdbId: 4 });
  assert.equal(person.failed, true);
});

test('saved artwork is replaced, cleared, paged, and kept to one account', async () => {
  const client = createInMemorySupabase({
    tables: { user_artwork: [] },
    unique: { user_artwork: ['user_id', 'subject_type', 'tmdb_id', 'season_number', 'kind'] },
  });
  configure({ supabaseClient: client });
  const first = await saveUserArtwork('owner', { subjectType: 'tv', tmdbId: 8, kind: 'poster', filePath: POSTER });
  assert.equal(first.file_path, POSTER);
  const second = await saveUserArtwork('owner', { subjectType: 'tv', tmdbId: 8, kind: 'poster', filePath: '/other.jpg' });
  assert.equal(second.file_path, '/other.jpg');
  assert.equal(client.__db.tables.user_artwork.length, 1);
  await saveUserArtwork('owner', { subjectType: 'season', tmdbId: 8, seasonNumber: 0, kind: 'poster', filePath: SEASON });
  await saveUserArtwork('other', { subjectType: 'tv', tmdbId: 8, kind: 'poster', filePath: '/theirs.jpg' });
  const own = await readUserArtwork('owner');
  assert.equal(own.length, 2);
  assert.equal(own.some(row => row.file_path === '/theirs.jpg'), false);
  await clearUserArtwork('owner', { subjectType: 'season', tmdbId: 8, seasonNumber: 0, kind: 'poster' });
  assert.deepEqual((await readUserArtwork('owner')).map(row => row.file_path), ['/other.jpg']);
  await assert.rejects(saveUserArtwork('owner', { subjectType: 'tv', tmdbId: 8, kind: 'poster', filePath: 'relative.jpg' }));

  const many = Array.from({ length: 1001 }, (_, index) => ({
    user_id: 'owner',
    subject_type: 'movie',
    tmdb_id: index + 1,
    season_number: -1,
    kind: 'poster',
    file_path: `/${index + 1}.jpg`,
    updated_at: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
  }));
  client.__db.tables.user_artwork = many;
  assert.equal((await readUserArtwork('owner')).length, 1001);
  client.failNext('user_artwork', 'select', { message: 'offline' });
  await assert.rejects(readUserArtwork('owner'));
});

test('the artwork migration declares a table-level primary key', () => {
  const sql = readFileSync(new URL('../../../../supabase/migrations/20261015100000_user_artwork.sql', import.meta.url), 'utf8');
  const { adds } = extractMigrationKeyChanges(sql);
  assert.equal(adds.some(key => key.table === 'user_artwork' && key.key === 'kind,season_number,subject_type,tmdb_id,user_id'), true);
});

test('the artwork cap does not count the table from its own insert policy', () => {
  const sql = readFileSync(new URL('../../../../supabase/migrations/20261016100000_user_artwork_cap.sql', import.meta.url), 'utf8');
  const policy = sql.slice(sql.lastIndexOf('create policy'));
  assert.equal(/from\s+(public\.)?user_artwork/i.test(policy), false);
  assert.match(sql, /security definer/);
  assert.match(sql, /revoke all on function public\.enforce_user_artwork_cap\(\) from public, anon, authenticated/);
  assert.match(sql, /before insert on public\.user_artwork/);
  assert.match(policy, /public\.is_premium\(\)/);
});
