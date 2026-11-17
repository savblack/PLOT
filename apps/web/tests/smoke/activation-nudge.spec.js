/* global process */
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
    await expect(page.locator('.ft-card')).toHaveCount(0);
    await shot(page, `card3-web-${label}-home`);

    expect(await page.evaluate(() => window.__smokeEvents.filter(({ event }) => event === 'activation_nudge_shown')))
      .toEqual([{ event: 'activation_nudge_shown', props: { surface: 'home' } }]);
    await nudge.getByRole('button', { name: 'Find a title' }).click();
    await expect(page.getByTestId('searches')).toHaveText('1');
    expect(await page.evaluate(() => window.__smokeEvents.filter(({ event }) => event === 'activation_nudge_add_clicked')))
      .toEqual([{ event: 'activation_nudge_add_clicked', props: { surface: 'home' } }]);
    await nudge.getByRole('button', { name: 'Import from Trakt' }).click();
    await expect(page.getByTestId('import-page')).toBeVisible();
    expect(new URL(page.url()).search).toBe('?source=trakt');
    expect(await page.evaluate(() => window.__smokeEvents.filter(({ event }) => event === 'activation_nudge_import_clicked')))
      .toEqual([{ event: 'activation_nudge_import_clicked', props: { surface: 'home', source: 'trakt' } }]);
  });
}

test('History with no titles keeps the nudge and confirmed import sources', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?page=history`);
  const nudge = page.getByRole('region', { name: 'Add your first show or movie' });
  await expect(nudge).toBeVisible();
  await expect(nudge.getByText('Import your watch history')).toBeVisible();
  const sources = nudge.getByRole('button', { name: /^Import from / });
  await expect(sources).toHaveCount(2);
  await expect(sources.nth(0)).toHaveAccessibleName('Import from Trakt');
  await expect(sources.nth(1)).toHaveAccessibleName('Import from Simkl');
  await expect(page.getByText('Nothing watched yet')).toHaveCount(0);
  await shot(page, 'card3-web-desktop-history');

  await nudge.getByRole('button', { name: 'Find a title' }).click();
  await expect(page.getByTestId('searches')).toHaveText('1');
  await nudge.getByRole('button', { name: 'Import from Trakt' }).click();
  await expect(page.getByTestId('import-page')).toBeVisible();
  expect(new URL(page.url()).search).toBe('?source=trakt');
});

test('the deferred trial waits for the calendar sheet, then appears once', async ({ page }) => {
  await page.goto(`${url}?titles=5&trialOverlay=1`);
  const calendar = page.getByRole('dialog', { name: 'Fill your calendar' });
  await expect(calendar).toBeVisible();
  await expect(page.locator('.upgrade-sheet-title')).toHaveCount(0);
  expect(await page.evaluate(() => window.__trialClaims)).toBe(0);
  expect(await page.evaluate(() => window.__smokeEvents.filter(({ event }) => event === 'premium_prompt_shown'))).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('plot.premiumTrialPrompt.00000000-0000-4000-8000-000000000002'))).toBeNull();

  await calendar.getByRole('button', { name: 'Close calendar sheet' }).click();
  await expect(page.locator('.upgrade-sheet-title')).toHaveText('Want more from Plot? Try Premium free for 7 days.');
  expect(await page.evaluate(() => window.__trialClaims)).toBe(1);
  expect(await page.evaluate(() => window.__smokeEvents.filter(({ event }) => event === 'premium_prompt_shown'))).toHaveLength(1);
  await page.getByRole('dialog', { name: 'Premium' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.upgrade-sheet-title')).toHaveCount(0);
  expect(await page.evaluate(() => window.__trialClaims)).toBe(1);
});

test('one title is enough: the nudge is gone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?titles=1`);
  await expect(page.locator('.discover-page h1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Add your first show or movie' })).toHaveCount(0);
  await page.goto(`${url}?titles=1&page=history`);
  await expect(page.getByText('Nothing watched yet')).toBeVisible();
});
