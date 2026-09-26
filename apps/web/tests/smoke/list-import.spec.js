import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../../../../packages/core/tests/fixtures/imports/letterboxd-custom-list.csv', import.meta.url));
for (const full of [false,true]) {
  test(`saved Letterboxd list review ${full ? 'reports the free allowance' : 'imports membership without a watch'}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/tests/smoke/fixtures/list-import.html${full ? '?full=1' : ''}`);
    await page.getByRole('button', { name: 'Letterboxd CSV export' }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByText(/Import into Software History/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Include this list' })).toBeChecked();
    await expect(page.getByText('Each selected watch is saved separately.',{ exact:false })).toHaveCount(0);
    await page.getByRole('button', { name: 'Import →', exact:true }).click();
    if (full) await expect(page.getByText('List not imported: your five free custom lists are already in use.')).toBeVisible();
    else await expect(page.getByText('Import complete',{ exact:true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('saved Trakt history rejects aggregate files before any write', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/list-import.html');
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'watched-shows.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{ plays: 3, last_watched_at: null }])),
  });
  await expect(page.getByText(/Unsupported Trakt history file or record/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import →', exact: true })).toHaveCount(0);
});

test('TV Time multi-list preview imports only selected destinations and reports the omitted list', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const media = JSON.parse(readFileSync(new URL('../../../../packages/core/tests/fixtures/imports/trakt-history.json', import.meta.url), 'utf8'))[1].movie;
  const list = name => ({ name, description: '', shows: [], movies: [{ title: media.title, id: media.ids, rating: null }] });
  await page.goto('/tests/smoke/fixtures/list-import.html');
  await page.getByRole('button', { name: 'TV Time saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'lists.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([list('Weekend'), list('Later')])) });
  const selectors = page.getByRole('checkbox', { name: 'Include this list' });
  await expect(selectors).toHaveCount(2);
  await selectors.nth(1).uncheck();
  await expect(selectors.nth(0)).toBeChecked();
  await expect(page.getByTestId('saved-lists')).toBeEmpty();
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByText('Later: List not imported: not selected.')).toBeVisible();
  await expect(page.getByTestId('saved-lists')).toHaveText('["Weekend"]');
});

test('Trakt saved watchlist review sends membership to the list writer only', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const media = JSON.parse(readFileSync(new URL('../../../../packages/core/tests/fixtures/imports/trakt-history.json', import.meta.url), 'utf8'))[1].movie;
  await page.goto('/tests/smoke/fixtures/list-import.html');
  await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'lists-watchlist.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ type: 'movie', id: 1, movie: media, notes: 'Watch together', my_rating: null }])) });
  await expect(page.getByText(/Import into Watchlist/)).toBeVisible();
  await expect(page.getByText(/Each selected watch is saved separately/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Import →', exact: true }).click();
  await expect(page.getByTestId('saved-lists')).toHaveText('["Watchlist"]');
  await expect(page.getByText('Import complete', { exact: true })).toBeVisible();
});
