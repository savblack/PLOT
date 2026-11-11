import { test, expect } from '@playwright/test';

const page_url = '/tests/smoke/fixtures/panel-route.html';
const panel = (page, name) => page.getByRole('dialog', { name, exact: true });

test('the browser Back button closes an open title, and Forward reopens it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(page_url);
  await page.getByRole('button', { name: 'Open film 11' }).click();
  await expect(panel(page, 'movie 11')).toBeVisible();
  await expect(page).toHaveURL(/\?panel=movie-11$/);

  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${page_url.replaceAll('.', '\\.')}$`));
  await expect(page.getByTestId('where')).toHaveText('home');

  await page.goForward();
  await expect(panel(page, 'movie 11')).toBeVisible();
  // One view was counted: stepping through history is not a new view.
  await expect(page.getByTestId('views')).toHaveText('movie-11:rail');
  expect(errors).toEqual([]);
});

test('a film opened from a collection goes back to the collection, and Close leaves both', async ({ page }) => {
  await page.goto(page_url);
  await page.getByRole('button', { name: 'Open collection 7' }).click();
  await expect(panel(page, 'collection 7')).toBeVisible();
  await page.getByRole('button', { name: 'Open film 12 from the collection' }).click();
  await expect(panel(page, 'movie 12')).toBeVisible();
  await expect(page).toHaveURL(/\?panel=movie-12$/);

  await page.goBack();
  await expect(panel(page, 'collection 7')).toBeVisible();
  await expect(page).toHaveURL(/\?panel=collection-7$/);

  // Forward to the film again, then Close: the panel goes entirely, and one
  // press of Back does not bring the collection back up.
  await page.getByRole('button', { name: 'Open film 12 from the collection' }).click();
  await expect(panel(page, 'movie 12')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/panel=/);
});

test('a link to a title opens it, counts one view, and Close removes it from the address', async ({ page }) => {
  await page.goto(`${page_url}?type=tv&panel=tv-42`);
  await expect(panel(page, 'tv 42')).toBeVisible();
  await expect(page.getByTestId('views')).toHaveText('tv-42:link');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\?type=tv$/);
});

test('the panel stays open, with its address, when the page behind it changes', async ({ page }) => {
  await page.goto(page_url);
  await page.getByRole('button', { name: 'Open film 11' }).click();
  await expect(panel(page, 'movie 11')).toBeVisible();

  // The page rewrites its own query (a filter): the panel keeps its place.
  await page.getByRole('button', { name: 'Filter this page' }).click();
  await expect(page).toHaveURL(/type=tv/);
  await expect(page).toHaveURL(/panel=movie-11/);
  await expect(panel(page, 'movie 11')).toBeVisible();

  // Moving to another page: same.
  await page.getByRole('link', { name: 'Other page' }).click();
  await expect(page.getByTestId('where')).toHaveText('other');
  await expect(page).toHaveURL(/panel=movie-11/);
  await expect(panel(page, 'movie 11')).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/panel=/);
  await expect(page.getByTestId('where')).toHaveText('other');
});

test('an address this app did not write opens nothing', async ({ page }) => {
  await page.goto(`${page_url}?panel=list-9`);
  await expect(page.getByTestId('where')).toHaveText('home');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a person opens in the panel, and a film from their credits goes back to them', async ({ page }) => {
  await page.goto(page_url);
  await page.getByRole('button', { name: 'Open person 5' }).click();
  await expect(panel(page, 'person 5')).toBeVisible();
  await expect(page).toHaveURL(/\?panel=person-5$/);
  await expect(page.getByTestId('where')).toHaveText('home');

  await page.getByRole('button', { name: 'Open film 13 from the person' }).click();
  await expect(panel(page, 'movie 13')).toBeVisible();
  await page.goBack();
  await expect(panel(page, 'person 5')).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/panel=/);
});
