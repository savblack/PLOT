import { test, expect } from '@playwright/test';

const url = '/tests/smoke/fixtures/tab-bar.html';

test('a phone gets a bottom tab bar with the four everyday places and More', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url);

  const bar = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button')).toHaveText(['Home', 'Calendar', 'My Lists', 'History', 'More']);
  await expect(bar.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

  // One tap moves between places.
  await bar.getByRole('button', { name: 'Calendar' }).click();
  await expect(page.getByTestId('view')).toHaveText('calendar');
  await expect(bar.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
  await expect(bar.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page');

  // The bar sits at the bottom edge and the page ends above it.
  const box = await bar.boundingBox();
  expect(Math.round(box.y + box.height)).toBe(800);
  await page.getByTestId('last-line').scrollIntoViewIfNeeded();
  const last = await page.getByTestId('last-line').boundingBox();
  expect(last.y + last.height).toBeLessThanOrEqual(box.y + 1);

  // The old menu button is gone from the header; search is still there.
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open search' }).click();
  await expect(page.getByTestId('searches')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('More opens the menu with everything that is not a tab, in the saved order', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url);
  const bar = page.getByRole('navigation', { name: 'Main navigation' });
  await bar.getByRole('button', { name: 'More' }).click();

  const menu = page.locator('#app-nav-drawer');
  await expect(menu).toHaveClass(/open/);
  // The saved order puts Watch together first. The tabs are not repeated here.
  await expect(menu.locator('.nav-drawer-nav .nav-drawer-label')).toHaveText(['Watch together', 'Just Decide', 'Guide']);
  await expect(menu.getByRole('button', { name: 'Settings' })).toBeVisible();

  await menu.getByRole('button', { name: 'Guide' }).click();
  await expect(page.getByTestId('view')).toHaveText('guide');
  await expect(menu).not.toHaveClass(/open/);
  // No tab is marked current while a menu page is showing.
  await expect(bar.locator('[aria-current="page"]')).toHaveCount(0);
});

test('at sidebar width there is no tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
});
