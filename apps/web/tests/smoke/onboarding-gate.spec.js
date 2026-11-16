import { test, expect } from '@playwright/test';
import { ONBOARDING_FLOW as COPY } from '@plot/core/copy/onboardingFlow.js';
import { TRAKT_CALLBACK_PAGE } from '../../src/copy/traktCallbackPage.js';

// ProtectedRoute skips its setup check on preview hosts, and 127.0.0.1 is
// one, so the other smoke tests never run the real gate. This file reaches
// the same dev server under a name that is not a preview host.
const GATE_HOST = 'plot-gate.test';
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP ${GATE_HOST} 127.0.0.1`] } });

const userId = '00000000-0000-4000-8000-000000000724';

async function setup(page, { exchange = 'works' } = {}) {
  const profile = { id: userId, username: 'onboarding-gate-test', onboarding_complete: false, region: 'US', timezone: 'America/New_York', streaming_providers: [], genres: [] };
  await page.addInitScript(({ userId }) => {
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'onboarding-gate@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify({ access_token: 'test-session-not-a-real-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
  }, { userId });
  await page.route('**/api/region', route => route.fulfill({ json: { country: 'US' } }));
  await page.route('https://placeholder.invalid/**', route => route.fulfill({ json: { results: [] } }));
  await page.route('https://placeholder.supabase.co/**', route => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: userId, role: 'authenticated' } });
    if (url.includes('/rest/v1/profiles')) {
      if (request.method() === 'PATCH' || request.method() === 'POST') Object.assign(profile, request.postDataJSON());
      return route.fulfill({ json: profile });
    }
    if (url.includes('/functions/v1/')) return exchange === 'fails' ? route.fulfill({ status: 500, json: { error: 'exchange failed' } }) : route.fulfill({ json: { ok: true } });
    if (url.includes('/rest/v1/lists')) return route.fulfill({ json: { id: 'gate-list', user_id: userId, name: '__watchlist__' } });
    return route.fulfill({ json: [] });
  });
  return profile;
}

function gateUrl(baseURL, path) {
  const url = new URL(path, baseURL);
  url.hostname = GATE_HOST;
  return url.href;
}

/** Paths the page moves through from now on, client-side routing included. */
function recordPaths(page) {
  const paths = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname);
  });
  return paths;
}

// The gate above the app shell and the gate above /onboarding are the same
// component in the same place in the tree, so one instance used to serve
// both and kept its earlier answer. Opening an app page before setup was
// finished left it holding "not finished". After the save it sent the new
// account back to /onboarding, which sent it to the app again, about twice a
// second until the page was reloaded.
test('finishing setup after an app page was opened first reaches Home and stays', async ({ page, baseURL }) => {
  const profile = await setup(page);
  await page.goto(gateUrl(baseURL, '/app'));
  await expect(page).toHaveURL(/\/onboarding$/);
  const skip = page.getByRole('button', { name: COPY.skip, exact: true });
  await expect(skip).toBeEnabled();

  const paths = recordPaths(page);
  await skip.click();
  await expect(page).toHaveURL(/\/home$/);
  expect(profile.onboarding_complete).toBe(true);
  // Long enough for several turns of the old loop (one profile read each).
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/home$/);
  expect(paths.filter(path => path === '/onboarding')).toEqual([]);
});

// Without the earlier app page the old gate still bounced once: Home, back
// to /onboarding for one profile read, then Home again.
test('finishing setup does not pass back through onboarding', async ({ page, baseURL }) => {
  const profile = await setup(page);
  await page.goto(gateUrl(baseURL, '/onboarding'));
  const skip = page.getByRole('button', { name: COPY.skip, exact: true });
  await expect(skip).toBeEnabled();

  const paths = recordPaths(page);
  await skip.click();
  await expect(page).toHaveURL(/\/home$/);
  expect(profile.onboarding_complete).toBe(true);
  await page.waitForTimeout(1000);
  expect(paths.filter(path => path === '/onboarding')).toEqual([]);
});

// Connecting Trakt or Simkl leaves setup for the other site and comes back
// through /auth/trakt or /auth/simkl. When that goes wrong, or the stored
// return address is lost, the way back is an app page (/import, /settings),
// which sends an unfinished account to /onboarding: the "app page opened
// first" shape above, reached without typing a URL. This is the path the
// person who looped on 2026-11-10 took (/auth/simkl, then /import).
const STATE = 'gate-oauth-state';
const IMPORT_RETURNS = [
  { name: 'Simkl cancelled (no code)', path: '/auth/simkl', back: 'Back to import' },
  { name: 'Simkl link expired (state does not match)', path: '/auth/simkl?code=c&state=stale', back: 'Back to import' },
  { name: 'Simkl exchange fails', path: `/auth/simkl?code=c&state=${STATE}`, exchange: 'fails', back: 'Back to import' },
  { name: 'Simkl connects, return address lost', path: `/auth/simkl?code=c&state=${STATE}` },
  { name: 'Trakt cancelled (no code)', path: '/auth/trakt', back: TRAKT_CALLBACK_PAGE.backToSettings },
  { name: 'Trakt link expired (state does not match)', path: '/auth/trakt?code=c&state=stale', back: TRAKT_CALLBACK_PAGE.backToSettings },
  { name: 'Trakt exchange fails', path: `/auth/trakt?code=c&state=${STATE}`, exchange: 'fails', back: TRAKT_CALLBACK_PAGE.backToSettings },
  { name: 'Trakt connects, return address lost', path: `/auth/trakt?code=c&state=${STATE}` },
];

for (const { name, path, exchange, back } of IMPORT_RETURNS) {
  test(`finishing setup after an import return stays out of onboarding: ${name}`, async ({ page, baseURL }) => {
    const profile = await setup(page, { exchange });
    await page.addInitScript(({ state }) => {
      // Only the callback pages read these, once, so setting them on every
      // load is harmless. No return address is stored: that is the lost case.
      sessionStorage.setItem('plot_simkl_oauth_state', state);
      sessionStorage.setItem('plot_trakt_oauth_state', state);
    }, { state: STATE });
    await page.goto(gateUrl(baseURL, path));
    if (back) await page.getByRole('link', { name: back, exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    const skip = page.getByRole('button', { name: COPY.skip, exact: true });
    await expect(skip).toBeEnabled();

    const paths = recordPaths(page);
    await skip.click();
    // The app page they were sent back from is where setup hands them on.
    await expect(page).not.toHaveURL(/\/onboarding/);
    expect(profile.onboarding_complete).toBe(true);
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/\/onboarding/);
    expect(paths.filter(visited => visited === '/onboarding')).toEqual([]);
  });
}

// The Trakt error page used to link to Settings whatever page the connect
// started on, so a failed connect during setup pointed a new account at
// Settings. It now links back to the page that started it.
test('a failed Trakt connect started in setup links back to setup', async ({ page, baseURL }) => {
  await setup(page);
  await page.addInitScript(() => sessionStorage.setItem('plot_trakt_oauth_return_to', '/onboarding?import=trakt'));
  await page.goto(gateUrl(baseURL, '/auth/trakt'));
  const back = page.getByRole('link', { name: TRAKT_CALLBACK_PAGE.backToSetup, exact: true });
  await expect(back).toHaveAttribute('href', '/onboarding?import=trakt');
  await back.click();
  await expect(page).toHaveURL(/\/onboarding\?import=trakt$/);
});

// The Simkl error page had the same fixed link, to Import.
test('a failed Simkl connect started in setup links back to setup', async ({ page, baseURL }) => {
  await setup(page);
  await page.addInitScript(() => sessionStorage.setItem('plot_simkl_oauth_return_to', '/onboarding?import=simkl'));
  await page.goto(gateUrl(baseURL, '/auth/simkl'));
  const back = page.getByRole('link', { name: TRAKT_CALLBACK_PAGE.backToSetup, exact: true });
  await expect(back).toHaveAttribute('href', '/onboarding?import=simkl');
  await back.click();
  await expect(page).toHaveURL(/\/onboarding\?import=simkl$/);
});
