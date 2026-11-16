import { test, expect } from '@playwright/test';
import { ONBOARDING_FLOW as COPY } from '@plot/core/copy/onboardingFlow.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { TRAKT_CALLBACK_PAGE } from '../../src/copy/traktCallbackPage.js';

// Connecting Trakt, Plex or Simkl from setup waits on something outside the
// page: a popup, another tab, a poll, or a same-tab trip that comes back as
// ?import=<source>. None of them used to tell the dialog when the connect
// failed, so it showed "Waiting for you to finish in the other window" with
// no end. Each way now lands back on the connect step with one message and
// the button to try again.

const userId = '00000000-0000-4000-8000-000000000725';
const I = IMPORT_JOBS.onboarding;
const ADD_SOURCE = SETTINGS_VIEW.sources.addSource;

/**
 * A signed-in account part-way through setup, with nothing connected.
 * `setupDone` makes it an account that has finished setup, for Settings.
 * `plexStatus` is the stored Plex integration's status, if there is one;
 * `functions` answers edge function calls by name, with a response or a
 * function returning one (default: 200, empty).
 */
async function midSetup(page, { plexStatus = null, functions = {}, setupDone = false } = {}) {
  const profile = { id: userId, username: 'connect-failed-test', onboarding_complete: setupDone, region: 'US', timezone: 'America/New_York', streaming_providers: [], genres: [] };
  await page.addInitScript(({ userId, profile }) => {
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'connect-failed@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify({ access_token: 'test-session-not-a-real-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    localStorage.setItem('plot-cached-profile', JSON.stringify({ userId, profile }));
  }, { userId, profile });
  await page.route('**/api/region', route => route.fulfill({ json: { country: 'US' } }));
  await page.route('https://placeholder.invalid/**', route => route.fulfill({ json: { results: [] } }));
  await page.route('https://placeholder.supabase.co/**', route => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: userId, role: 'authenticated' } });
    if (url.includes('/rest/v1/profiles')) return route.fulfill({ json: profile });
    if (url.includes('/rest/v1/media_integrations') && url.includes('provider=eq.plex') && plexStatus) {
      return route.fulfill({ json: [{ id: 'plex-integration', provider: 'plex', status: plexStatus }] });
    }
    const fn = url.match(/\/functions\/v1\/([\w-]+)/)?.[1];
    if (fn && functions[fn]) return route.fulfill(typeof functions[fn] === 'function' ? functions[fn]() : functions[fn]);
    return route.fulfill({ json: [] });
  });
}

function dialogParts(page, name) {
  return {
    waiting: page.getByText(I.connecting, { exact: true }),
    failed: page.getByText(I.connectFailed(name), { exact: true }),
    connect: page.getByRole('button', { name: COPY.importSources.continueTo(name), exact: true }),
  };
}

async function openSource(page, name) {
  await page.goto('/onboarding');
  await page.getByRole('button', { name: /Switching apps/ }).click();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
}

test('Trakt: a failed connect in the popup takes setup out of waiting', async ({ page, context, baseURL }) => {
  await midSetup(page);
  // Stands in for trakt.tv: the person cancels, so they come back with no code.
  await context.route('https://trakt.tv/**', route => route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(`${baseURL}/auth/trakt`)})</script>` }));
  await openSource(page, 'Trakt');
  const { waiting, failed, connect } = dialogParts(page, 'Trakt');
  const [popup] = await Promise.all([page.waitForEvent('popup'), connect.click()]);
  await expect(popup.getByRole('button', { name: TRAKT_CALLBACK_PAGE.closeWindow, exact: true })).toBeVisible();

  await expect(failed).toBeVisible();
  await expect(waiting).toHaveCount(0);
  await expect(connect).toBeVisible();
  await popup.close();

  // Trying again opens it again and drops the message.
  const [again] = await Promise.all([page.waitForEvent('popup'), connect.click()]);
  await expect(waiting).toBeVisible();
  await expect(failed).toHaveCount(0);
  await again.close();
});

// The error pages' "Back to setup" link, and a blocked popup's same-tab
// fallback, come back as ?import=<source> with nothing connected.
for (const [id, name] of [['trakt', 'Trakt'], ['simkl', 'Simkl'], ['plex', 'Plex']]) {
  test(`${name}: coming back to setup without a connection says so`, async ({ page }) => {
    await midSetup(page);
    await page.goto(`/onboarding?import=${id}`);
    const { waiting, failed, connect } = dialogParts(page, name);
    await expect(failed).toBeVisible();
    await expect(waiting).toHaveCount(0);
    await expect(connect).toBeVisible();
  });
}

test('Simkl: a connect that fails before leaving the page says so', async ({ page }) => {
  await midSetup(page, { functions: { 'simkl-sync': { status: 500, json: { error: 'prepare failed' } } } });
  await openSource(page, 'Simkl');
  const { waiting, failed, connect } = dialogParts(page, 'Simkl');
  await connect.click();
  await expect(failed).toBeVisible();
  await expect(waiting).toHaveCount(0);
  await expect(connect).toBeVisible();
});

test('Plex: an approval that expires takes setup out of waiting', async ({ page }) => {
  // The approval tab's return: Plex is still pending, so this page polls.
  // The first poll says still pending, the next says the request is gone.
  let polls = 0;
  await midSetup(page, { plexStatus: 'pending', functions: { 'media-sync': () => ({ json: { status: polls++ === 0 ? 'pending' : 'expired' } }) } });
  await page.goto('/onboarding?import=plex');
  const { waiting, failed, connect } = dialogParts(page, 'Plex');
  await expect(waiting).toBeVisible();
  await expect(failed).toBeVisible({ timeout: 10_000 });
  await expect(waiting).toHaveCount(0);
  await expect(connect).toBeVisible();
});

// Settings > Connections uses the same connect dialog (useImportStart), with
// /settings?section=connections&import=<source> as its way back.
for (const [id, name] of [['trakt', 'Trakt'], ['simkl', 'Simkl'], ['plex', 'Plex']]) {
  test(`Settings, ${name}: coming back without a connection says so`, async ({ page }) => {
    await midSetup(page, { setupDone: true });
    await page.goto(`/settings?section=connections&import=${id}`);
    const { waiting, failed, connect } = dialogParts(page, name);
    await expect(failed).toBeVisible();
    await expect(waiting).toHaveCount(0);
    await expect(connect).toBeVisible();
  });
}

test('Settings, Trakt: a failed connect in the popup takes the dialog out of waiting', async ({ page, context, baseURL }) => {
  await midSetup(page, { setupDone: true });
  await context.route('https://trakt.tv/**', route => route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(`${baseURL}/auth/trakt`)})</script>` }));
  await page.goto('/settings?section=connections');
  await page.getByRole('button', { name: ADD_SOURCE }).first().click();
  await page.getByRole('button', { name: /Trakt/ }).first().click();
  const { waiting, failed, connect } = dialogParts(page, 'Trakt');
  const [popup] = await Promise.all([page.waitForEvent('popup'), connect.click()]);
  await expect(popup.getByRole('button', { name: TRAKT_CALLBACK_PAGE.closeWindow, exact: true })).toBeVisible();
  await expect(failed).toBeVisible();
  await expect(waiting).toHaveCount(0);
  await expect(connect).toBeVisible();
  await popup.close();
});
