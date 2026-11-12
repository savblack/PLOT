import { test, expect } from '@playwright/test';

// Set ACTIVATION_NUDGE_SHOTS to a folder to also save the review screenshots.
const SHOTS = process.env.ACTIVATION_NUDGE_SHOTS;
const url = '/tests/smoke/fixtures/activation-nudge.html';
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

for (const [label, size] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
  test(`${label}: a new account with no titles gets the nudge on Home, with only confirmed import sources`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(url);
    const nudge = page.getByRole('region', { name: 'Add your first show or movie' });
    await expect(nudge).toBeVisible();
    await expect(nudge.getByText('Import your watch history')).toBeVisible();
    const sources = nudge.getByRole('button', { name: /^Import from / });
    await expect(sources).toHaveCount(2);
    await expect(sources.nth(0)).toHaveAccessibleName('Import from Trakt');
    await expect(sources.nth(1)).toHaveAccessibleName('Import from Simkl');
    // The checklist does not stack under it.
    await expect(page.locator('.ft-card')).toHaveCount(0);
    await shot(page, `card3-web-${label}-home`);

    await nudge.getByRole('button', { name: 'Find a title' }).click();
    await expect(page.getByTestId('searches')).toHaveText('1');
    await nudge.getByRole('button', { name: 'Import from Trakt' }).click();
    await expect(page.getByTestId('import-page')).toBeVisible();
    expect(new URL(page.url()).search).toBe('?source=trakt');
  });
}

test('History with no titles shows the nudge instead of the empty state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?page=history`);
  await expect(page.getByRole('region', { name: 'Add your first show or movie' })).toBeVisible();
  await expect(page.getByText('Nothing watched yet')).toHaveCount(0);
  await shot(page, 'card3-web-desktop-history');
});

test('one title is enough: the nudge is gone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?titles=1`);
  await expect(page.locator('.discover-page h1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Add your first show or movie' })).toHaveCount(0);
  await page.goto(`${url}?titles=1&page=history`);
  await expect(page.getByText('Nothing watched yet')).toBeVisible();
});
