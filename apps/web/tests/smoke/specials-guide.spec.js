import { expect, test } from '@playwright/test';

const fixture = '/tests/smoke/fixtures/specials-guide.html';

test('specials are listed last and a tick does not move the series pointer', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture);
  await expect(page.getByRole('button', { name: 'Season 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Season 1', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Season 1', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Season 2', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Specials', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Specials', exact: true }).click();
  await expect(page.locator('.ep-row')).toHaveCount(2);
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  await expect(page.locator('.ep-num').first()).toHaveText('E01');
  await page.locator('.ep-row').first().getByRole('button').click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mark specials watched', exact: true }).click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remount guide' }).click();
  await page.getByRole('button', { name: 'Season 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Specials', exact: true }).click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(2);
  await page.getByRole('button', { name: 'Unmark specials', exact: true }).click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a specials-only show opens on Specials', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${fixture}?only=1`);
  await expect(page.getByRole('button', { name: 'Season 1', exact: true })).toHaveCount(0);
  await expect(page.locator('.season-pill--static')).toHaveText('Specials');
  await expect(page.locator('.ep-row')).toHaveCount(2);
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  await page.locator('.ep-row').nth(1).getByRole('button').click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(1);
  expect(errors).toEqual([]);
});
