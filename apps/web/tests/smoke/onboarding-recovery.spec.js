import { test, expect } from '@playwright/test';
import { ONBOARDING_FLOW as COPY } from '@plot/core/copy/onboardingFlow.js';

const userId = '00000000-0000-4000-8000-000000000723';

async function setup(page, failure, providerFailure = false) {
  let remainingFailures = failure === 'none' ? 0 : 1;
  let writes = 0;
  const profile = { id: userId, username: 'onboarding-recovery-test', onboarding_complete: false, region: 'US', timezone: 'America/New_York', streaming_providers: [], genres: [] };
  await page.addInitScript(({ userId, profile }) => {
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'onboarding-recovery@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify({ access_token: 'test-session-not-a-real-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    localStorage.setItem('plot-cached-profile', JSON.stringify({ userId, profile }));
  }, { userId, profile });
  await page.route('**/api/region', route => route.fulfill({ json: { country: 'US' } }));
  await page.route('https://placeholder.invalid/**', route => route.fulfill({ json: providerFailure ? {} : { results: [] } }));
  await page.route('https://placeholder.supabase.co/**', route => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: userId, role: 'authenticated' } });
    if (url.includes('/rest/v1/profiles')) {
      if (request.method() === 'PATCH' || request.method() === 'POST') {
        writes++;
        if (remainingFailures > 0) {
          if (failure === 'network') { remainingFailures--; return route.abort('failed'); }
          // An UPDATE and its missing-row INSERT both return no row.
          if (request.method() === 'POST') remainingFailures--;
          return route.fulfill({ json: null });
        }
        Object.assign(profile, request.postDataJSON());
      }
      return route.fulfill({ json: profile });
    }
    if (url.includes('/rest/v1/lists')) return route.fulfill({ json: { id: 'recovery-list', user_id: userId, name: '__watchlist__' } });
    return route.fulfill({ json: [] });
  });
  return { profile, getWrites: () => writes };
}

for (const failure of ['network', 'no_row']) {
  test(`onboarding ${failure} failure offers retry and reaches Home`, async ({ page }, testInfo) => {
    const uncaught = [];
    page.on('pageerror', error => uncaught.push(error.message));
    const backend = await setup(page, failure);
    await page.goto('/onboarding');
    const skip = page.getByRole('button', { name: COPY.skip, exact: true });
    await expect(skip).toBeEnabled();
    await skip.click();
    await expect(page.getByText(COPY.saveError, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(skip).toBeEnabled();
    expect(backend.profile.onboarding_complete).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`${failure}-retry-visible.png`), fullPage: true });
    await skip.click();
    await expect(page).toHaveURL(/\/home$/);
    expect(backend.profile.onboarding_complete).toBe(true);
    expect(backend.getWrites()).toBe(failure === 'network' ? 2 : 3);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('plot-cached-profile'))?.profile?.onboarding_complete)).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/home$/);
    expect(uncaught).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${failure}-home-recovered.png`), fullPage: true });
  });
}

test('a failed provider load still lets onboarding finish', async ({ page }, testInfo) => {
  const uncaught = [];
  page.on('pageerror', error => uncaught.push(error.message));
  const backend = await setup(page, 'none', true);
  await page.goto('/onboarding');
  await page.getByRole('button', { name: /Switching apps/ }).click();
  await page.getByRole('button', { name: COPY.importSources.later, exact: true }).click();
  await expect(page.getByText(COPY.services.loadError, { exact: true })).toBeVisible();
  const proceed = page.getByRole('button', { name: COPY.continueArrow, exact: true });
  await expect(proceed).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('services-failure-can-continue.png'), fullPage: true });
  await proceed.click();
  await expect(page).toHaveURL(/\/home$/);
  expect(backend.profile.onboarding_complete).toBe(true);
  expect(uncaught).toEqual([]);
});
