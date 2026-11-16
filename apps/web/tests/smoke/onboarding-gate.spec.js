import { test, expect } from '@playwright/test';
import { ONBOARDING_FLOW as COPY } from '@plot/core/copy/onboardingFlow.js';

// ProtectedRoute skips its setup check on preview hosts, and 127.0.0.1 is
// one, so the other smoke tests never run the real gate. This file reaches
// the same dev server under a name that is not a preview host.
const GATE_HOST = 'plot-gate.test';
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP ${GATE_HOST} 127.0.0.1`] } });

const userId = '00000000-0000-4000-8000-000000000724';

async function setup(page) {
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
