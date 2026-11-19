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

test('desktop: a quiet Go Premium row sits just above the profile, and the Settings card offers 7 days free', async ({ page }) => {
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
  const profileBox = await page.locator('.app-sidebar-foot .app-sidebar-profile').boundingBox();
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
  // A quiet row since 18 Nov (UI critique): no fill, charcoal label, and only
  // the spark keeps the accent.
  const colours = await page.evaluate(() => {
    const token = name => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const chipEl = document.querySelector('.app-sidebar-foot .go-premium-chip');
    const cs = getComputedStyle(chipEl);
    return {
      background: cs.backgroundColor,
      label: cs.color,
      spark: getComputedStyle(chipEl.querySelector('.premium-mark')).color,
      ink: token('--text-primary'),
      accent: token('--accent'),
    };
  });
  expect(colours.background).toBe('rgba(0, 0, 0, 0)');
  expect(colours.label).toBe(colours.ink);
  expect(colours.spark).toBe(colours.accent);
  await shot(page, 'card2-web-desktop-settings-v4');
  if (SHOTS) {
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await shot(page, 'card2-web-desktop-dark-v4');
    await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  }

  // The account menu no longer repeats it.
  await page.locator('.app-sidebar-foot .app-sidebar-profile').click();
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
  await shot(page, 'card2-web-phone-settings-v4');
  await page.getByRole('button', { name: 'More' }).click();
  const drawer = page.locator('#app-nav-drawer');
  const chip = drawer.locator('.go-premium-chip');
  await expect(chip).toHaveText('Go Premium');
  await expect(drawer.getByText('7 days free')).toHaveCount(0);
  // Full row width, aligned with the profile row below it.
  // Measured in one frame: the drawer slides in, so separate reads can disagree.
  const [chipBox, rowBox] = await drawer.evaluate(el => [
    el.querySelector('.go-premium-chip'),
    el.querySelector('.nav-drawer-footer .app-sidebar-profile'),
  ].map(n => { const r = n.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
  expect(Math.abs(chipBox.x - rowBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(chipBox.width - rowBox.width)).toBeLessThanOrEqual(1);
  await shot(page, 'card2-web-phone-menu-v4');
});

test('phone web: the profile row in the menu drawer opens the account menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole('button', { name: 'More' }).click();
  const drawer = page.locator('#app-nav-drawer');
  await expect(drawer).toHaveClass(/open/);
  // The separate Profile, Settings, feedback and sign-out rows are gone: the
  // profile row holds them, as on the desktop rail.
  await expect(drawer.locator('.nav-drawer-item--signout')).toHaveCount(0);
  await drawer.locator('.app-sidebar-profile').click();

  const menu = drawer.getByRole('menu', { name: 'Account' });
  await expect(menu).toBeVisible();
  for (const mode of ['Light', 'Dark', 'System']) {
    await expect(menu.getByRole('menuitemradio', { name: mode, exact: true })).toBeVisible();
  }
  await expect(menu.locator('.account-menu-swatch')).toHaveCount(6);
  for (const item of ['View your profile', 'Settings', 'Give feedback', 'Sign out']) {
    await expect(menu.getByRole('menuitem', { name: item, exact: true })).toBeVisible();
  }
  await expect(menu.getByRole('menuitem', { name: /Support Plot/ })).toBeVisible();

  // The panel stays inside the drawer and on screen.
  const [panel, box] = await drawer.evaluate(el => [el.querySelector('.account-menu-panel'), el]
    .map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  expect(panel.left).toBeGreaterThanOrEqual(box.left);
  expect(panel.right).toBeLessThanOrEqual(box.right);
  expect(panel.top).toBeGreaterThanOrEqual(0);
  await shot(page, 'web-phone-account-menu');

  // A Premium theme a Free viewer taps opens the upgrade sheet, not the theme.
  await menu.locator('.account-menu-swatch').nth(1).click();
  await expect(drawer).not.toHaveClass(/open/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('small phone: the account menu fits the drawer and Sign out can be reached', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(url);
  await page.getByRole('button', { name: 'More' }).click();
  const drawer = page.locator('#app-nav-drawer');
  await drawer.locator('.app-sidebar-profile').click();
  const [panel, box] = await drawer.evaluate(el => [el.querySelector('.account-menu-panel'), el]
    .map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; }));
  // The drawer is 272px wide here, narrower than the panel's desktop width.
  expect(panel.left).toBeGreaterThanOrEqual(box.left);
  expect(panel.right).toBeLessThanOrEqual(box.right);
  expect(panel.top).toBeGreaterThanOrEqual(0);
  const signOut = drawer.getByRole('menuitem', { name: 'Sign out', exact: true });
  await signOut.scrollIntoViewIfNeeded();
  await expect(signOut).toBeInViewport();
  await shot(page, 'web-small-phone-account-menu');
});

test('phone web: View your profile in the account menu closes the drawer and opens the profile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole('button', { name: 'More' }).click();
  const drawer = page.locator('#app-nav-drawer');
  await drawer.locator('.app-sidebar-profile').click();
  await drawer.getByRole('menuitem', { name: 'View your profile', exact: true }).click();
  await expect(drawer).not.toHaveClass(/open/);
  expect(new URL(page.url()).pathname).toBe('/u/sam');
});

test('phone web: Sign out in the account menu asks first, and Cancel keeps you signed in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole('button', { name: 'More' }).click();
  const drawer = page.locator('#app-nav-drawer');
  await drawer.locator('.app-sidebar-profile').click();
  await drawer.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(drawer).not.toHaveClass(/open/);
  const dialog = page.getByRole('dialog', { name: 'Sign out of plot?' });
  await expect(dialog).toBeVisible();
  await shot(page, 'web-phone-sign-out-confirm');
  expect(new URL(page.url()).pathname).not.toBe('/logout');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(new URL(page.url()).pathname).not.toBe('/logout');
});

test('desktop: Sign out in the account menu asks first, then signs out on confirm', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url);
  await page.locator('.app-sidebar-foot .app-sidebar-profile').click();
  await page.locator('.app-sidebar-foot').getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign out of plot?' });
  await expect(dialog).toBeVisible();
  expect(new URL(page.url()).pathname).not.toBe('/logout');
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/logout');
});

test('someone who has subscribed before gets Go Premium with no trial line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?billing=lapsed`);
  await expect(page.locator('.settings-side').getByRole('link', { name: 'Go Premium', exact: true })).toBeVisible();
  await expect(page.getByText('7 days free')).toHaveCount(0);
});

test('before value, the nav chip is hidden but Settings still offers the trial', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?value=low`);
  await expect(page.locator('.app-sidebar-foot .go-premium-chip')).toHaveCount(0);
  await expect(page.locator('.settings-side').getByRole('link', { name: 'Go Premium · 7 days free' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.settings-mobile-head').getByRole('link', { name: 'Go Premium · 7 days free' })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.locator('#app-nav-drawer .go-premium-chip')).toHaveCount(0);
});

test('a Premium member never sees it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?billing=premium`);
  await expect(page.locator('.go-premium-chip')).toHaveCount(0);
  await page.locator('.app-sidebar-foot .app-sidebar-profile').click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByText(/Go Premium/)).toHaveCount(0);
});
