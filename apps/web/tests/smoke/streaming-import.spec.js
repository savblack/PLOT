import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const fixture = name => readFileSync(new URL(`../../../../packages/core/tests/fixtures/imports/${name}`, import.meta.url), 'utf8');
const movie = JSON.parse(fixture('trakt-history.json'))[1].movie;
// Transport cases use captured catalogue identities, not authentic provider exports.
const cases = [
  ['netflix', 'Netflix', 'CSV', `Title,Date\n${movie.title},2025-02-30`],
  ['prime', 'Amazon Prime', 'CSV', `Title,Date Watched\n${movie.title},`],
  ['disney', 'Disney+', 'JSON', JSON.stringify([{ title: movie.title }])],
  ['max', 'Max (HBO)', 'JSON', JSON.stringify([{ title: movie.title }])],
  ['apple', 'Apple TV+', 'JSON', JSON.stringify([{ Item_Description: movie.title }])],
  ['imdb', 'IMDb', 'CSV', fixture('imdb-movie-ratings.csv').split('\n').slice(0, 2).join('\n')],
];

for (const [source, name, format, text] of cases) {
  test(`${name} web review, confirmation and reimport preserve unknown dates`, async ({ page }) => {
    await page.goto('/tests/smoke/fixtures/history-import.html');
    const select = async () => {
      await page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `) }).click();
      await page.locator('input[type=file]').setInputFiles({ name: `${source}-ratings.${format.toLowerCase()}`, mimeType: format === 'CSV' ? 'text/csv' : 'application/json', buffer: Buffer.from(text) });
      await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeVisible();
    };
    await select();
    await expect(page.getByText(/Movie · Watch date unknown/)).toBeVisible();
    await expect(page.getByTestId('saved-events')).toBeEmpty();
    await page.getByRole('button', { name: 'Import →', exact: true }).click();
    await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
    const events = JSON.parse(await page.getByTestId('saved-events').textContent());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source, watched_at: null, watched_on: null, date_precision: 'unknown' });
    await page.getByRole('button', { name: 'Restart import' }).click();
    await select();
    await expect(page.getByText('0 new · 1 skipped', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Import →', exact: true }).click();
    await expect(page.getByText('0 entries added · 1 duplicate skipped · 0 not confirmed', { exact: true })).toBeVisible();
    expect(JSON.parse(await page.getByTestId('saved-events').textContent())).toHaveLength(1);
  });
}

test('truncated Netflix CSV is rejected before matching or writing', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Netflix CSV export', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'NetflixViewingHistory.csv', mimeType: 'text/csv', buffer: Buffer.from('Title,Date\n"unfinished') });
  await expect(page.getByText(/unfinished quoted field/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('saved-events')).toBeEmpty();
});

test('Netflix short-year dates survive web review and event persistence', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Netflix CSV export', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'NetflixViewingHistory.csv', mimeType: 'text/csv', buffer: Buffer.from(`Title,Date\n${movie.title},26/08/24\n${movie.title},03/04/24`) });
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events.map(row => row.watched_on).sort()).toEqual(['2024-04-03', '2024-08-26']);
  expect(events.every(row => row.date_precision === 'day')).toBe(true);
});

test('Netflix named episodes save verified season progress and replay safely', async ({ page }) => {
  const show = JSON.parse(fixture('tmdb-episode-series.json')).result;
  const season = JSON.parse(fixture('tmdb-episode-season-two.json'));
  const text = `Title,Date\n"${show.name}: Season 2: ${season.episodes[0].name}",26/08/24`;
  await page.goto('/tests/smoke/fixtures/history-import.html');
  const review = async () => {
    await page.getByRole('button', { name: 'Netflix CSV export', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'NetflixViewingHistory.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
    await expect(page.getByText(/Season 2, episode 1/)).toBeVisible();
  };
  await review();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
  const events = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(events[0]).toMatchObject({ tmdb_id: show.id, media_type: 'tv', season_number: 2, episode_number: 1, watched_on: '2024-08-26' });
  await page.getByRole('button', { name: 'Restart import' }).click();
  await review();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 1 duplicate skipped · 0 not confirmed', { exact: true })).toBeVisible();
});

test('streaming JSON missing-title omissions remain visible before and after confirmation', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Disney+ JSON export', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ title: movie.title }, {}])) });
  const omitted = page.getByText('Record 2: This source record has no usable title and will not be imported.', { exact: true });
  await expect(omitted).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
  await expect(omitted).toBeVisible();
});

test('Netflix manual series selection resolves the named episode before confirmation', async ({ page }) => {
  const show = JSON.parse(fixture('tmdb-episode-series.json')).result;
  const season = JSON.parse(fixture('tmdb-episode-season-two.json'));
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Netflix CSV export', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'NetflixViewingHistory.csv', mimeType: 'text/csv', buffer: Buffer.from(`Title,Date\n"Severance review choice: Season 2: ${season.episodes[0].name}",26/08/24`) });
  const choice = page.getByRole('combobox', { name: /Severance review choice/ });
  await expect(choice).toHaveValue('');
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await choice.selectOption(`tv:${show.id}`);
  await expect(page.getByText(/Season 2, episode 1/)).toBeVisible();
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
  expect(JSON.parse(await page.getByTestId('saved-events').textContent())[0]).toMatchObject({ tmdb_id: show.id, season_number: 2, episode_number: 1 });
});

test('IMDb mixed watchlist imports movies and series without watch history', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'IMDb CSV export', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'watchlist.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('imdb-mixed-watchlist.csv')) });
  const confirm = page.getByRole('button', { name: 'Import →', exact: true });
  await expect(confirm).toBeEnabled();
  await expect(page.getByTestId('saved-list-records')).toBeEmpty();
  await confirm.click();
  await expect(page.getByTestId('saved-lists')).toHaveText('["Watchlist"]');
  const records = JSON.parse(await page.getByTestId('saved-list-records').textContent());
  expect(records).toHaveLength(4);
  expect(records.map(row => row.summary.media_type)).toEqual(['movie', 'tv', 'tv', 'movie']);
  await expect(page.getByTestId('saved-events')).toBeEmpty();
});

test('IMDb TV ratings persist as annotations and replay without invented watches', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/history-import.html');
  const review = async () => {
    await page.getByRole('button', { name: 'IMDb CSV export', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'ratings.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('imdb-tv-ratings.csv')) });
    await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeEnabled();
  };
  await review();
  await expect(page.getByTestId('saved-annotations')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('2 entries added · 0 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
  const saved = JSON.parse(await page.getByTestId('saved-annotations').textContent());
  expect(saved).toHaveLength(2);
  expect(saved.every(row => row.annotation_scope === 'show' && row.annotation.rating === 7 && row.annotation.ratedAt === '2024-01-15')).toBe(true);
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await page.getByRole('button', { name: 'Restart import' }).click();
  await review();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('0 entries added · 2 duplicates skipped · 0 not confirmed', { exact: true })).toBeVisible();
});

test('native Prime playback stays unselected until manual review and preserves start time', async ({ page }) => {
  const matches = JSON.parse(fixture('tmdb-prime-search-matches.json'));
  const match = matches.results['Palm Springs'].results.find(row => row.title === 'Palm Springs' && row.media_type === 'movie');
  await page.goto('/tests/smoke/fixtures/history-import.html');
  await page.getByRole('button', { name: 'Amazon Prime CSV export', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'PrimeVideo.ViewingHistory.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('prime-viewing-history.csv')) });
  const warning = page.getByText(/This file records playback sessions/);
  await expect(warning).toBeVisible();
  const choice = page.getByRole('combobox', { name: /Palm Springs/ });
  await expect(choice).toHaveValue('');
  await expect(page.getByTestId('saved-events')).toBeEmpty();
  await choice.selectOption(`movie:${match.id}`);
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('1 entry added · 0 duplicates skipped · 0 not confirmed · 1 left out without a confirmed match', { exact: true })).toBeVisible();
  const saved = JSON.parse(await page.getByTestId('saved-events').textContent());
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ watched_at: '2024-01-15T12:00:00Z', date_precision: 'instant' });
  await expect(warning).toBeVisible();
});

for (const name of ['Disney+', 'Max (HBO)', 'Apple TV+']) {
  test(`${name} rejects an unknown JSON layout before matching or writing`, async ({ page }) => {
    await page.goto('/tests/smoke/fixtures/history-import.html');
    await page.getByRole('button', { name: `${name} ${name === 'Max (HBO)' ? 'CSV or JSON' : 'JSON'} export`, exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ records: [{ title: movie.title }] })) });
    await expect(page.getByText(/This JSON export layout is not supported/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import →', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('saved-events')).toBeEmpty();
  });
}
