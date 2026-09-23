import { expect, test } from '@playwright/test';

const fixture = '/tests/smoke/fixtures/episode-guide.html';

test('sparse episode undo persists across reimport and remount, with season isolation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture);
  await expect(page.locator('.ep-row.watched')).toHaveCount(1);
  await expect(page.locator('.ep-row').nth(2)).toHaveClass(/watched/);
  await page.locator('.ep-row').nth(2).getByRole('button').click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reimport signal' }).click();
  await page.getByRole('button', { name: 'Remount guide' }).click();
  await expect(page.locator('.ep-row')).toHaveCount(4);
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark season watched', exact: true }).click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(4);
  await page.getByRole('button', { name: 'S2', exact: true }).click();
  await expect(page.locator('.ep-row')).toHaveCount(4);
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  await page.getByRole('button', { name: 'S1', exact: true }).click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(4);
  await page.getByRole('button', { name: 'Unmark season', exact: true }).click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('failed edits retain progress, retry works, and another account never inherits it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture);
  await expect(page.locator('.ep-row.watched')).toHaveCount(1);
  await page.getByRole('button', { name: 'Fail next save' }).click();
  await page.locator('.ep-row').nth(2).getByRole('button').click();
  await expect(page.getByText('Could not update watch status. Please try again.')).toBeVisible();
  await expect(page.locator('.ep-row.watched')).toHaveCount(1);
  await page.locator('.ep-row').nth(2).getByRole('button').click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fail next read' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.ep-row').nth(2).getByRole('button')).toBeDisabled();
  await page.getByRole('button', { name: 'Retry episode progress' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.locator('.ep-row').nth(2).getByRole('button').click();
  await expect(page.locator('.ep-row.watched')).toHaveCount(1);
  await page.getByRole('button', { name: 'Switch account' }).click();
  await expect(page.locator('.ep-row')).toHaveCount(4);
  await expect(page.locator('.ep-row.watched')).toHaveCount(0);
  await expect(page.locator('.ep-check-btn')).toHaveCount(0);
  expect(errors).toEqual([]);
});
