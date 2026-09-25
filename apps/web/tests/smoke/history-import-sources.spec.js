import { test, expect } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000321';
const profile = {
  id: userId,
  username: 'import-test',
  onboarding_complete: true,
  region: 'AU',
  timezone: 'Australia/Sydney',
  streaming_providers: [],
  genres: [],
};

test('Free import page offers Plex and Trakt while sync stays hidden', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(({ userId, profile }) => {
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'import-test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify({ access_token: 'test-session-not-a-real-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    localStorage.setItem('plot-cached-profile', JSON.stringify({ userId, profile }));
  }, { userId, profile });

  await page.route('https://placeholder.invalid/**', route => route.fulfill({ json: { results: [] } }));
  await page.route('https://placeholder.supabase.co/**', route => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: userId, role: 'authenticated' } });
    if (url.includes('/rest/v1/profiles')) return route.fulfill({ json: profile });
    if (url.includes('/rest/v1/media_integrations')) return route.fulfill({ json: null });
    if (url.includes('/rest/v1/lists')) return route.fulfill({ json: { id: 'test-list', user_id: userId, name: '__watchlist__' } });
    return route.fulfill({ json: [] });
  });

  await page.goto('/import');
  await expect(page.getByRole('heading', { name: 'Import Watch History' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Plex Connected account/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Trakt Connected account/ })).toBeVisible();
  await page.getByRole('button', { name: /Plex Connected account/ }).click();
  await expect(page.getByRole('button', { name: 'Connect Plex to import' })).toBeVisible();
  await expect(page.getByText('This does not turn on automatic or two-way sync.')).toBeVisible();
  await expect(page.getByText(/Plex Media Server must be running/)).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('plex-import-ready.png'), fullPage: true });
});
