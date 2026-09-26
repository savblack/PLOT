import { expect, test } from '@playwright/test';

// Match the account fixture so host timezone prompts do not obscure the Guide.
test.use({ timezoneId: 'Australia/Sydney' });

let pageErrors = [];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

// Isolated account and feed responses. These tests never write to a real backend.
const userId = '00000000-0000-4000-8000-000000000123';
const profile = { id: userId, username: 'guide-test', onboarding_complete: true, region: 'AU', timezone: 'Australia/Sydney', guide_channels: [], streaming_providers: [], genres: [] };

async function setup(page, initial = { market_id: 'Sydney', channel_ids: null }) {
  let preferences = initial;
  let failSave = false;
  let failFeed = false;
  const now = Date.now();
  const snapshot = {
    region: 'Sydney', schemaVersion: 2, source: 'Matt Huisman', sourceUrl: 'https://i.mjh.nz/',
    fetchedAt: new Date(now).toISOString(), coverageEnd: new Date(now + 3600000).toISOString(),
    channels: [{ id: 'abc-test', name: 'Test ABC', number: 2 }, { id: 'sbs-test', name: 'Test SBS', number: 3 }],
    programmes: [{ id: 'abc-news', channelId: 'abc-test', title: 'Test evening news', start: new Date(now - 60000).toISOString(), end: new Date(now + 3600000).toISOString(), description: 'A test programme description.' }],
  };
  await page.addInitScript(({ userId, profile }) => {
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'guide-test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify({ access_token: 'test-session-not-a-real-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    localStorage.setItem('plot-cached-profile', JSON.stringify({ userId, profile }));
  }, { userId, profile });
  await page.route('https://placeholder.supabase.co/**', async route => {
    const url = route.request().url();
    let body = [];
    if (url.includes('/auth/v1/user')) body = { id: userId, role: 'authenticated' };
    if (url.includes('/rest/v1/lists')) body = { id: 'test-list', name: 'My List' };
    if (url.includes('/rest/v1/profiles')) body = profile;
    if (url.includes('/rest/v1/broadcast_preferences')) {
      if (route.request().method() === 'POST') {
        if (failSave) return route.fulfill({ status: 503, json: { message: 'Test save failure' } });
        const next = route.request().postDataJSON();
        preferences = { market_id: next.market_id, channel_ids: next.channel_ids };
      }
      body = preferences;
    }
    if (url.includes('/storage/v1/object/public/broadcast-guide/')) {
      if (failFeed) return route.fulfill({ status: 503, json: { error: 'Feed unavailable' } });
      body = snapshot;
    }
    await route.fulfill({ json: body });
  });
  return { snapshot, failFeed: value => { failFeed = value; }, failSave: value => { failSave = value; }, getPreferences: () => preferences };
}

test('production Guide saves empty channels and preserves a failed draft', async ({ page }) => {
  const backend = await setup(page);
  await page.goto('/guide');
  await expect(page.getByRole('button', { name: /Test evening news/ })).toBeVisible();
  // #946 replaced the "My channels" toggle with an always-visible tick list plus an
  // Edit channels button (COPY.editChannels); the picker behind it is unchanged.
  await page.getByRole('button', { name: 'Edit channels', exact: true }).click();
  await page.getByRole('button', { name: 'Clear selection' }).click();
  backend.failSave(true);
  await page.getByRole('button', { name: 'Apply channels' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save your broadcast settings');
  await expect(page.getByRole('checkbox', { name: 'Test ABC' })).not.toBeChecked();
  backend.failSave(false);
  await page.getByRole('button', { name: 'Apply channels' }).click();
  await expect(page.getByText('Choose some channels to build your guide.')).toBeVisible();
  expect(backend.getPreferences().channel_ids).toEqual([]);
  await page.reload();
  await expect(page.getByText('Choose some channels to build your guide.')).toBeVisible();
});

test('Settings saves an unsupported market without substituting listings', async ({ page }) => {
  const backend = await setup(page, null);
  await page.goto('/settings?section=viewing');
  await page.getByLabel('Country', { exact: true }).selectOption('US');
  await page.getByLabel('TV market', { exact: true }).selectOption('US-other');
  await page.getByRole('button', { name: 'Save region', exact: true }).click();
  await expect.poll(() => backend.getPreferences()?.market_id).toBe('US-other');
  await page.getByRole('link', { name: 'Back to Guide' }).click();
  await expect(page.getByText('Listings are not available for this area yet. We will not substitute another area’s channels.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show my guide' })).toBeDisabled();
});

test('inline setup keeps a failed draft and opens the saved guide without leaving the page', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const backend = await setup(page, null);
  await page.goto('/guide');
  await expect(page.getByRole('heading', { name: 'A little less scrolling. A little more watching.' })).toBeVisible();
  await expect(page.getByLabel('Country', { exact: true })).toHaveValue('AU');
  await expect(page.getByLabel('City or region')).toHaveValue('');
  const submit = page.getByRole('button', { name: 'Show my guide' });
  await expect(submit).toBeDisabled();
  await page.getByLabel('City or region').selectOption('Sydney');
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('guide-setup-desktop.png') });
  const banner = await page.locator('.guide-setup').boundingBox();
  const main = await page.locator('.app-main').boundingBox();
  expect(banner.width).toBeGreaterThan(main.width * 0.9);
  const button = await submit.boundingBox();
  const row = await page.locator('.guide-setup-row').last().boundingBox();
  expect(Math.abs(button.x + button.width - row.x - row.width)).toBeLessThan(2);
  backend.failSave(true);
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Your changes are still here');
  await expect(page.getByLabel('City or region')).toHaveValue('Sydney');
  expect(backend.getPreferences()).toBeNull();
  backend.failSave(false);
  await submit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Test evening news/ })).toBeVisible();
  expect(backend.getPreferences()).toEqual({ market_id: 'Sydney', channel_ids: null });
  await expect(page).toHaveURL(/\/guide$/);
  await page.reload();
  await expect(page.getByRole('button', { name: /Test evening news/ })).toBeVisible();
});

test('narrow setup resets the city on country change and explains unavailable coverage', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await setup(page, null);
  await page.goto('/guide');
  const country = page.getByLabel('Country', { exact: true });
  const region = page.getByLabel('City or region');
  const submit = page.getByRole('button', { name: 'Show my guide' });
  await region.selectOption('Sydney');
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('guide-setup-mobile.png') });
  await country.selectOption('GB');
  await expect(region).toHaveValue('');
  await expect(submit).toBeDisabled();
  await region.selectOption('GB-London');
  await expect(page.getByRole('status')).toContainText('This source is currently unavailable');
  await expect(submit).toBeDisabled();
  await country.selectOption('US');
  await region.selectOption('US-other');
  await expect(page.getByRole('status')).toContainText('We will not substitute another area’s channels');
  expect(backend.getPreferences()).toBeNull();
  await country.selectOption('AU');
  await region.selectOption('Sydney');
  await expect(page.getByText('We will not substitute', { exact: false })).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await submit.click();
  await expect(page.getByRole('button', { name: /Test evening news/ })).toBeVisible();
});

test('programme details and narrow agenda render on the production route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto('/guide');
  await page.getByRole('button', { name: /Test evening news/ }).click();
  await expect(page.getByText('A test programme description.')).toBeVisible();
  await page.getByRole('button', { name: 'Close programme details' }).click();
  await expect(page.locator('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('stale listings remain visible after a failed refresh and recover on retry', async ({ page }) => {
  const backend = await setup(page);
  backend.snapshot.fetchedAt = new Date(Date.now() - 13 * 3600000).toISOString();
  await page.goto('/guide');
  await expect(page.getByText('These listings may be out of date.')).toBeVisible();
  backend.failFeed(true);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Refresh failed. Showing the last loaded listings.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Test evening news/ })).toBeVisible();
  backend.failFeed(false);
  backend.snapshot.fetchedAt = new Date().toISOString();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Refresh failed. Showing the last loaded listings.')).not.toBeVisible();
});
