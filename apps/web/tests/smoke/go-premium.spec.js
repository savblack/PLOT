/* global process */
import { test, expect } from '@playwright/test';

// Set GO_PREMIUM_SHOTS to a folder to also save the review screenshots.
const SHOTS = process.env.GO_PREMIUM_SHOTS;
const url = '/tests/smoke/fixtures/go-premium.html';
// Screenshots wait for entrance animations to settle.
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test('desktop: a clean pink Go Premium chip sits just above the profile, and the Settings card offers 7 days free', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url);
  const card = page.locator('.settings-side .settings-account-card');
  const line = card.getByRole('link', { name: 'Go Premium · 7 days free' });
  await expect(line).toBeVisible();
  // One single spark in the Settings line.
  await expect(line.locator('svg path')).toHaveCount(1);

  const foot = page.locator('.app-sidebar-foot');
  const chip = foot.locator('.go-premium-chip');
  await expect(chip).toHaveText('Go Premium');
  await expect(chip.locator('svg path')).toHaveCount(1);
  await expect(foot.getByText('7 days free')).toHaveCount(0);
  // Directly above the profile row, and exactly one nav row wide and tall.
  const chipBox = await chip.boundingBox();
  const profileBox = await page.locator('.app-sidebar-profile').boundingBox();
  expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(profileBox.y);
  expect(profileBox.y - (chipBox.y + chipBox.height)).toBeLessThan(24);
  const rowBox = await page.locator('.app-sidebar-nav > .app-sidebar-item').nth(1).boundingBox();
  expect(Math.abs(chipBox.x - rowBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(chipBox.width - rowBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(chipBox.height - rowBox.height)).toBeLessThanOrEqual(2);
  // The label starts on the same edge as the rows' labels.
  const chipLabel = await chip.locator('.app-sidebar-label').boundingBox();
  const rowLabel = await page.locator('.app-sidebar-nav > .app-sidebar-item .app-sidebar-label').nth(1).boundingBox();
  expect(Math.abs(chipLabel.x - rowLabel.x)).toBeLessThanOrEqual(1);
  await shot(page, 'card2-web-desktop-settings-v3');

  // The account menu no longer repeats it.
  await page.locator('.app-sidebar-profile').click();
  await expect(page.getByRole('menu').getByText(/Go Premium/)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await chip.click();
  await expect(page.getByTestId('pricing')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/pricing');
});

test('phone web: the menu drawer leads its footer with the clean chip; the Settings card carries the trial line', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator('.settings-mobile-head').getByRole('link', { name: 'Go Premium · 7 days free' })).toBeVisible();
  await shot(page, 'card2-web-phone-settings-v3');
  await page.getByRole('button', { name: 'More' }).click();
  const drawer = page.locator('#app-nav-drawer');
  const chip = drawer.locator('.go-premium-chip');
  await expect(chip).toHaveText('Go Premium');
  await expect(drawer.getByText('7 days free')).toHaveCount(0);
  // Full drawer-row width, aligned with the row below it.
  // Measured in one frame: the drawer slides in, so separate reads can disagree.
  const [chipBox, rowBox] = await drawer.evaluate(el => [
    el.querySelector('.go-premium-chip'),
    el.querySelector('.nav-drawer-footer .nav-drawer-item:not(.go-premium-chip)'),
  ].map(n => { const r = n.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
  expect(Math.abs(chipBox.x - rowBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(chipBox.width - rowBox.width)).toBeLessThanOrEqual(1);
  await shot(page, 'card2-web-phone-menu-v3');
});

test('someone who has subscribed before gets Go Premium with no trial line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?billing=lapsed`);
  await expect(page.locator('.settings-side').getByRole('link', { name: 'Go Premium', exact: true })).toBeVisible();
  await expect(page.getByText('7 days free')).toHaveCount(0);
});

test('a Premium member never sees it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?billing=premium`);
  await expect(page.locator('.go-premium-chip')).toHaveCount(0);
  await page.locator('.app-sidebar-profile').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByText(/Go Premium/)).toHaveCount(0);
});
