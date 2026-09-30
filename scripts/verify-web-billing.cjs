// Real staging sign-in, controlled billing responses. No payment or billing writes.
// This proves web rendering/recovery, not signed Stripe delivery or activation.
// Export uses the deployed staging handler with staging-only Auth/RLS.
const { chromium, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
(async () => {
  if (!process.argv[2]) throw Error('Supply the private pilot directory');
  const account = JSON.parse(readFileSync(resolve(process.argv[2], 'accounts.json')))[0];
  if (!/^plot-import-qa-.*@example\.invalid$/.test(account.email)) throw Error('Synthetic QA only');
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  let entitled = true;
  let status = 'active';
  let cancelled = false;
  let portalCalls = 0;
  let statusReads = 0;
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    await context.route('**/*.supabase.co/**', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'uzrhfivnhdcfieuaxzip.supabase.co') throw Error('Wrong Supabase project');
      if (url.pathname.endsWith('/rpc/is_premium')) return route.fulfill({ json: entitled });
      if (url.pathname.endsWith('/rpc/get_my_billing_status')) { statusReads++; return route.fulfill({ json: { isPremium: entitled, canManage: true, status, cancelAtPeriodEnd: cancelled } }); }
      if (url.pathname.endsWith('/functions/v1/export-user-data')) {
        const response = await route.fetch();
        if (response.headers()['access-control-allow-origin'] !== '*') throw Error('Export CORS missing');
        return route.fulfill({ response });
      }
      if (url.pathname.endsWith('/functions/v1/stripe-billing')) {
        if (url.searchParams.get('action') !== 'portal') throw Error('Unexpected billing action');
        portalCalls++;
        return route.fulfill({ status: 503, json: { error: 'Billing test outage' } });
      }
      if (url.pathname.endsWith('/rest/v1/profiles') && route.request().method() === 'GET') {
        const response = await route.fetch();
        const data = await response.json();
        const stale = row => ({ ...row, is_premium: !entitled });
        return route.fulfill({ response, json: Array.isArray(data) ? data.map(stale) : data ? stale(data) : data });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5184/login');
    await page.locator('#auth-email').fill(account.email);
    await page.locator('#auth-password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.goto('http://127.0.0.1:5184/settings');
    await expect(page.getByText('You have PLOT Premium', { exact: true })).toBeVisible();
    console.log('PASS authoritative Premium response overrides the free profile badge');
    entitled = false; status = 'past_due';
    await page.reload();
    await expect(page.getByText('Your payment needs attention. Manage your subscription to update your payment method.', { exact: true })).toBeVisible({ timeout: 15000 });
    if (!statusReads) throw Error('Preview did not load the current billing-status code');
    await expect(page.getByText('You have PLOT Premium', { exact: true })).toHaveCount(0);
    const manage = page.getByRole('button', { name: 'Manage subscription', exact: true });
    await manage.click();
    await expect(page.getByText('Billing test outage', { exact: true })).toBeVisible();
    await expect(manage).toBeEnabled();
    await manage.click();
    await expect(manage).toBeEnabled();
    if (portalCalls !== 2) throw Error('Portal retry failed');
    console.log('PASS expired subscriber can manage payment; portal failure is visible and retryable');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .json', exact: true }).click();
    const artifact = await download;
    if (!artifact.suggestedFilename().endsWith('.json') || await artifact.failure()) throw Error('Free export failed');
    console.log('PASS deployed export handler downloads real staging data without Premium');
    status = 'canceled';
    await page.reload();
    await expect(page.getByText('Your subscription is not active. Your lists and watch history are still available.', { exact: true })).toBeVisible();
    await expect(manage).toBeVisible();
    entitled = true; status = 'active'; cancelled = true;
    await page.reload();
    await expect(page.getByText('Your subscription is set to end after the current paid period.', { exact: true })).toBeVisible();
    console.log('PASS terminal cancellation and scheduled cancellation have distinct Settings messages');
    if (errors.length) throw Error(errors.join('; '));
    console.log('PASS no uncaught page errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
