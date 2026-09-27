import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../../../../packages/core/tests/fixtures/imports/trakt-history.json', import.meta.url));

async function review(page) {
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeVisible();
}

test('Trakt file resolves, previews, writes episode and movie events, and safely reimports', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await review(page);
  await expect(page.getByText(/Season 2, episode 13/)).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events).toHaveLength(2);
  expect(events.find(event => event.media_type === 'tv')).toMatchObject({ season_number: 2, episode_number: 13, watched_at: null, date_precision: 'unknown' });
  await page.getByRole('button', { name: 'Restart import' }).click();
  await review(page);
  await expect(page.getByText('0 new · 2 skipped')).toBeVisible();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 2 duplicates skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(2);
});

test('Trakt file write failure reports unsaved entries and can be retried', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await review(page);
  await page.getByRole('button', { name: 'Fail next write' }).click();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 0 duplicates skipped · 2 not confirmed')).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Restart import' }).click();
  await review(page);
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
});

test('switching accounts discards the previous account import preview', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await review(page);
  await page.getByRole('button', { name: 'Switch account' }).click();
  await expect(page.getByRole('button', { name: 'Trakt saved export JSON export' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('saved-events')).toBeEmpty();
});

test('TV Time reports omitted rewatches before confirmation and retains the report in results', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[1].movie;
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'TV Time saved export JSON or CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'movies.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([
    { title: sample.title, id: sample.ids, is_watched: true, watched_at: null, rating: 8, rewatch_count: 2 },
  ])) });
  await expect(page.getByRole('heading', { name: 'Review what will be left out or changed' })).toBeVisible();
  await expect(page.getByText(/2 repeat watches are not imported/)).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  await expect(page.getByText(/2 repeat watches are not imported/)).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ source: 'tvtime', date_precision: 'unknown', watched_at: null, external_ids: { rewatch_count: 2 } });
});

test('TV Time official CSV previews and imports an episode watch', async ({ page }, testInfo) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[0];
  const csv = [
    'user_id,created_at,s_id,ep_id,key,updated_at,is_followed,series_name,season_number,episode_number',
    `10000001,2024-02-29 12:30:15,1,2,watch-episode-smoke,2024-02-29 12:30:15,,${sample.show.title},${sample.episode.season},${sample.episode.number}`,
  ].join('\n');
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'TV Time saved export JSON or CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'tracking-prod-records-v2.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText(`Season ${sample.episode.season}, episode ${sample.episode.number}`)).toBeVisible();
  await expect(page.getByText(/Watch time has no timezone/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('tv-time-official-csv-preview.png'), fullPage: true });
  await page.getByRole('combobox').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events[0]).toMatchObject({ source: 'tvtime', season_number: sample.episode.season, episode_number: sample.episode.number, watched_on: '2024-02-29', watched_at: null, date_precision: 'day' });
});

test('TV Time multiple files separate membership from watches and reimport individual files safely', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[1].movie;
  const movie = { title: sample.title, id: sample.ids, is_watched: true, watched_at: null, rating: null };
  const movies = { name: 'movies.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([movie])) };
  const lists = { name: 'lists.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ name: 'Together', shows: [], movies: [movie] }])) };
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'TV Time saved export JSON or CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles([lists, movies]);
  await expect(page.getByRole('checkbox', { name: 'Include this list' })).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(1);
  await expect(page.getByTestId('saved-lists')).toHaveText('["Together"]');
  await page.getByRole('button', { name: 'Restart import' }).click();
  await page.getByRole('button', { name: 'TV Time saved export JSON or CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles(movies);
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 1 duplicate skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(1);
});

test('TV Time ZIP upload reports extra files and preserves extracted-file reimport identity', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const { zipSync, strToU8 } = await import('fflate');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[1].movie;
  const text = JSON.stringify([{ title: sample.title, id: sample.ids, is_watched: true, watched_at: null, rating: null }]);
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'TV Time saved export JSON or CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'tvtime.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'movies.json': strToU8(text), 'activity_history.csv': strToU8('alternate representation') })) });
  await expect(page.getByText(/activity_history.csv: This archive file is not imported/)).toBeVisible();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Restart import' }).click();
  await page.getByRole('button', { name: 'TV Time saved export JSON or CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'movies.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 1 duplicate skipped · 0 not confirmed')).toBeVisible();
});

test('large import preview pages preserve record selection beyond the first page', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[1];
  const records = Array.from({ length: 201 }, (_, index) => ({ ...sample, id: index + 1 }));
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'watched-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)) });
  await expect(page.getByText('Entries 1 to 100 of 201')).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(100);
  await page.getByRole('button', { name: 'Next entries' }).click();
  await expect(page.getByText('Entries 101 to 200 of 201')).toBeVisible();
  await page.getByRole('button', { name: 'Next entries' }).click();
  await expect(page.getByRole('combobox')).toHaveCount(1);
  await page.getByRole('combobox').selectOption('');
  await page.getByRole('button', { name: 'Previous entries' }).click();
  await expect(page.getByRole('combobox')).toHaveCount(100);
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('200 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events).toHaveLength(200);
  expect(events.some(event => JSON.parse(event.source_key).at(-1) === '201')).toBe(false);
});

test('Trakt ZIP review imports watches and membership through their separate writers', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const { zipSync, strToU8 } = await import('fflate');
  const text = readFileSync(file, 'utf8');
  const movie = JSON.parse(text)[1].movie;
  const watchlist = JSON.stringify([{ type: 'movie', id: 1, movie, notes: null, my_rating: null }]);
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'trakt.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'watched-history.json': strToU8(text), 'lists-watchlist.json': strToU8(watchlist), 'ratings-movies.json': strToU8('[]') })) });
  await expect(page.getByText(/ratings-movies.json: This archive file is not imported/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include this list' })).toBeChecked();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('3 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(2);
  await expect(page.getByTestId('saved-lists')).toHaveText('["Watchlist"]');
});

test('Trakt episode ratings preview and reimport without creating watches', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[0];
  const input = { name: 'ratings-episodes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([
    { type: 'episode', show: sample.show, episode: sample.episode, rating: 8, rated_at: null },
  ])) };
  await page.goto('/tests/smoke/fixtures/history-import.html');
  async function select() {
    await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
    await page.locator('input[type=file]').setInputFiles(input);
    await expect(page.getByText(/Season 2, episode 13 · Rating: 8\/10 · Annotation date unknown/)).toBeVisible();
    await expect(page.getByText(/Ratings and reviews are saved privately/)).toBeVisible();
    await expect(page.getByText('Watch date unknown', { exact: true })).toHaveCount(0);
  }
  await select();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  const saved = JSON.parse(await page.getByTestId('saved-annotations').textContent());
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ annotation_scope: 'episode', season_number: 2, episode_number: 13, annotation: { rating: 8, ratedAt: null } });
  await page.getByRole('button', { name: 'Restart import' }).click();
  await select();
  await expect(page.getByText('1 already imported · 0 unmatched')).toBeVisible();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 1 duplicate skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-annotations').textContent())).toHaveLength(1);
  await expect(page.getByTestId('saved-events')).toBeEmpty();
});

test('Trakt season reviews report failed saves and retry without marking a season watched', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[0];
  const input = { name: 'comments-seasons.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([
    { type: 'season', show: sample.show, season: { number: 2 }, comment: { id: 1, comment: 'Synthetic private review', spoiler: true, review: true, created_at: null, updated_at: null } },
  ])) };
  await page.goto('/tests/smoke/fixtures/history-import.html');
  async function select() {
    await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
    await page.locator('input[type=file]').setInputFiles(input);
    await expect(page.getByText(/Season 2 · Review \(spoilers hidden\)/)).toBeVisible();
  }
  await select();
  await page.getByRole('button', { name: 'Fail next write' }).click();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 0 duplicates skipped · 1 not confirmed')).toBeVisible();
  await expect(page.getByTestId('saved-annotations')).toBeEmpty();
  await page.getByRole('button', { name: 'Restart import' }).click();
  await select();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  expect(JSON.parse(await page.getByTestId('saved-annotations').textContent())[0].annotation.text).toBe('Synthetic private review');
});

test('Trakt ZIP separates a watch and a rating for the same episode', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const { zipSync, strToU8 } = await import('fflate');
  const sample = JSON.parse(readFileSync(file, 'utf8'))[0];
  const bytes = zipSync({
    'watched-history.json': strToU8(JSON.stringify([sample])),
    'ratings-episodes.json': strToU8(JSON.stringify([{ type: 'episode', show: sample.show, episode: sample.episode, rating: 9, rated_at: null }])),
  });
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'trakt.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await expect(page.getByText(/Each selected watch is saved separately/)).toBeVisible();
  await expect(page.getByText(/Ratings and reviews are saved privately/)).toBeVisible();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(1);
  expect(JSON.parse(await page.getByTestId('saved-annotations').textContent())).toHaveLength(1);
});

test('Letterboxd ratings and watched files share a watched identity without using the rating date', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const movie = JSON.parse(readFileSync(file, 'utf8'))[1].movie;
  const line = `2024-01-02,${movie.title},${movie.year},https://boxd.it/synthetic-watch`;
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Letterboxd CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'ratings.csv', mimeType: 'text/csv', buffer: Buffer.from(`Date,Name,Year,Letterboxd URI,Rating\n${line},3.5`) });
  await expect(page.getByText(/Rating: 7\/10 · 2024-01-02/)).toBeVisible();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events).toHaveLength(1);
  expect(events[0].watched_at).toBeNull();
  expect(events[0].date_precision).toBe('unknown');
  await page.getByRole('button', { name: 'Restart import' }).click();
  await page.getByRole('button', { name: 'Letterboxd CSV export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'watched.csv', mimeType: 'text/csv', buffer: Buffer.from(`Date,Name,Year,Letterboxd URI\n${line}`) });
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 1 duplicate skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(1);
});

test('Letterboxd ZIP requires review of watched summaries and retains distinct diary watches', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const { zipSync, strToU8 } = await import('fflate');
  const movie = JSON.parse(readFileSync(file, 'utf8'))[1].movie;
  const diary = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n,${movie.title},${movie.year},https://boxd.it/entry-a,3,,,2024-01-01\n,${movie.title},${movie.year},https://boxd.it/entry-b,4,Yes,,2024-01-02`;
  const watched = `Date,Name,Year,Letterboxd URI\n,${movie.title},${movie.year},https://boxd.it/film`;
  const bytes = zipSync({ 'diary.csv': strToU8(diary), 'watched.csv': strToU8(watched), 'profile.csv': strToU8('omitted') });
  const input = { name: 'letterboxd.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) };
  await page.goto('/tests/smoke/fixtures/history-import.html');
  async function select() {
    await page.getByRole('button', { name: 'Letterboxd CSV export' }).click();
    await page.locator('input[type=file]').setInputFiles(input);
    await expect(page.getByText(/A diary watch for this film is also selected/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeDisabled();
  }
  await select();
  const choices = page.getByRole('combobox', { name: `Choose a title or leave it out: ${movie.title}` });
  // Removing both diary entries clears the pending overlap. Restoring a diary
  // must re-establish it before confirmation, without another provider lookup.
  await choices.nth(0).selectOption('');
  await choices.nth(1).selectOption('');
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeEnabled();
  await choices.nth(0).selectOption({ index: 1 });
  await choices.nth(1).selectOption({ index: 1 });
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeDisabled();
  await choices.nth(2).selectOption('');
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent()).map(row => row.watched_on)).toEqual(['2024-01-01', '2024-01-02']);
  await page.getByRole('button', { name: 'Restart import' }).click();
  await select();
  await page.getByRole('combobox', { name: `Choose a title or leave it out: ${movie.title}` }).nth(2).selectOption('');
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 2 duplicates skipped · 0 not confirmed')).toBeVisible();
});

test('oversized ZIP selection stops before preview or writes', async ({ page }) => {
  const { Buffer } = await import('node:buffer');
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'oversized.zip', mimeType: 'application/zip', buffer: Buffer.alloc(21 * 1024 * 1024) });
  await expect(page.getByText(/This archive is too large/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await expect(page.getByTestId('saved-annotations')).toBeEmpty();
});

for (const lostResponse of [false, true]) {
  test(`Trakt batch recovery ${lostResponse ? 'handles a lost response after commit' : 'resumes after a later batch fails'} without duplicate watches`, async ({ page }) => {
    const { readFileSync } = await import('node:fs');
    const { Buffer } = await import('node:buffer');
    const sample = JSON.parse(readFileSync(file, 'utf8'))[1];
    const input = { name: 'watched-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(
      Array.from({ length: 60 }, (_, i) => ({ ...sample, id: i + 1 })),
    )) };
    await page.goto('/tests/smoke/fixtures/history-import.html');
    async function select() {
      await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
      await page.locator('input[type=file]').setInputFiles(input);
      await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeEnabled();
    }
    await select();
    await page.getByRole('button', { name: lostResponse ? 'Lose next write response' : 'Fail second watch batch', exact: true }).click();
    await page.getByRole('button', { name: 'Import →', exact: true }).click();
    await expect(page.getByText(lostResponse ? '10 entries added · 0 duplicates skipped · 50 not confirmed' : '50 entries added · 0 duplicates skipped · 10 not confirmed')).toBeVisible();
    expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(lostResponse ? 60 : 50);
    await page.getByRole('button', { name: 'Restart import' }).click();
    await select();
    await expect(page.getByText('A similar watch is already saved. Leave this entry out, or confirm it is a separate watch.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Import →', exact: true }).click();
    await expect(page.getByText(lostResponse ? '0 entries added · 60 duplicates skipped · 0 not confirmed' : '10 entries added · 50 duplicates skipped · 0 not confirmed')).toBeVisible();
    const events = JSON.parse(await page.getByTestId('saved-events').textContent());
    expect(events).toHaveLength(60);
    expect(new Set(events.map(event => event.source_key)).size).toBe(60);
  });
}

test('results retain entries left without a confirmed match', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await review(page);
  await page.getByRole('combobox').first().selectOption('');
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed · 1 left out without a confirmed match', { exact: true })).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(1);
});

test('Trakt missing IDs and year require a user title choice before import', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const { Buffer } = await import('node:buffer');
  const record = JSON.parse(readFileSync(file, 'utf8'))[1];
  const captured = JSON.parse(readFileSync(new URL('../../../../packages/core/tests/fixtures/imports/tmdb-trakt-matches.json', import.meta.url), 'utf8')).results;
  const match = captured[record.movie.ids.imdb].movie_results[0];
  record.movie.ids = {};
  record.movie.year = null;
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'watched-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([record])) });
  await expect(page.getByRole('combobox')).toHaveValue('');
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('combobox').selectOption(`movie:${match.id}`);
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ tmdb_id: match.id, watched_at: null });
});
