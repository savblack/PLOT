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
  test(`${label}: zero-title Home offers quick-add`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(url);
    const quickAdd = page.getByRole('region', { name: 'What are you watching right now?' });
    await expect(quickAdd).toBeVisible();
    await expect(quickAdd.getByRole('searchbox', { name: 'Search for a show or movie' })).toBeVisible();
    await expect(quickAdd.getByText('Movies go to your Watchlist')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Add your first show or movie' })).toHaveCount(0);
    await expect(page.locator('.ft-card')).toHaveCount(0);
    await shot(page, `quick-add-web-${label}-home`);
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
  await shot(page, 'quick-add-web-desktop-history');

  await nudge.getByRole('button', { name: 'Find a title' }).click();
  await expect(page.getByTestId('searches')).toHaveText('1');
  await nudge.getByRole('button', { name: 'Import from Trakt' }).click();
  await expect(page.getByTestId('import-page')).toBeVisible();
  expect(new URL(page.url()).search).toBe('?source=trakt');
});

test('quick-add searches and saves a title', async ({ page }) => {
  await page.route(/\/mock-tmdb\?/, route => {
    const path = new URL(route.request().url()).searchParams.get('path');
    const results = path === 'search/multi'
      ? [{ id: 1396, media_type: 'tv', name: 'Breaking Bad', first_air_date: '2008-01-20', vote_count: 100 }]
      : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
  });
  await page.goto(url);
  const quickAdd = page.getByRole('region', { name: 'What are you watching right now?' });
  await quickAdd.getByRole('searchbox', { name: 'Search for a show or movie' }).fill('Breaking Bad');
  await expect(quickAdd.getByText('Breaking Bad')).toBeVisible();
  await quickAdd.getByRole('button', { name: 'Add to watchlist' }).click();
  await expect(quickAdd.getByText('1 title in your library')).toBeVisible();
  await expect(page.getByTestId('title-panel')).toHaveCount(0);
  await expect(page.locator('.app-shell.panel-docked')).toHaveCount(0);
});

test('quick-add focus fires once per mount, separate from History nudge events', async ({ page }) => {
  await page.goto(url);
  const search = page.getByRole('searchbox', { name: 'Search for a show or movie' });
  await search.focus();
  await search.evaluate(element => element.blur());
  await search.focus();
  const events = await page.evaluate(() => window.__smokeEvents.filter(({ event }) => event === 'quick_add_shown' || event === 'quick_add_focused' || event.startsWith('activation_nudge_')));
  expect(events).toEqual([
    { event: 'quick_add_shown', props: { title_count: 0, surface: 'home' } },
    { event: 'quick_add_focused', props: { title_count: 0, surface: 'home' } },
  ]);
});

test('quick-add remains after one title and disappears at five', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${url}?titles=1`);
  await expect(page.getByRole('region', { name: 'What are you watching right now?' })).toBeVisible();
  await expect(page.getByText('1 title in your library')).toBeVisible();
  await page.goto(`${url}?titles=5`);
  await expect(page.locator('.discover-page h1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'What are you watching right now?' })).toHaveCount(0);
  await page.goto(`${url}?titles=1&page=history`);
  await expect(page.getByText('Nothing watched yet')).toBeVisible();
});
