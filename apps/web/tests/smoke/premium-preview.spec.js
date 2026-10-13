import { test, expect } from '@playwright/test';
import { PLANS_PAGE } from '../../src/copy/plansPage.js';

async function mockCheckoutAvailability(page, checkoutAvailable) {
  await page.route('**/billing-availability**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ checkoutAvailable }),
  }));
}

for (const width of [390, 1440]) {
  test(`Premium plans page sends a signed-out visitor to sign up at ${width}px`, async ({ page }) => {
    await mockCheckoutAvailability(page, true);
    await page.setViewportSize({ width, height: 900 });
    const billingRequests = [];
    const errors = [];
    page.on('request', request => {
      if (request.url().includes('stripe-billing')) billingRequests.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Less deciding. More watching.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compare every feature' })).toBeVisible();
    await expect(page.getByText('Features marked Coming soon are still on the way.', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /New episode notifications.*In the app/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Movie release notifications/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Join shared lists and watch sessions.*Free with a Premium host/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Import history from your other apps/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Viewing stats.*Overview.*Deeper/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Plex and Trakt/ })).toHaveCount(0);
    await expect(page.getByText('Automatic Plex and Trakt syncing')).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Custom lists.*5.*Unlimited/ })).toBeVisible();

    // Annual is the default: $2/month, billed $24 yearly; monthly shows $3.
    await expect(page.getByText('US$24 billed yearly · taxes included', { exact: true })).toBeVisible();
    await expect(page.getByText('7-day free trial for new subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Monthly' }).click();
    await expect(page.getByText('US$3 billed monthly · taxes included', { exact: true })).toBeVisible();

    // The Premium-only filter hides rows that match on both plans.
    await expect(page.getByRole('row', { name: /Release calendar/ })).toBeVisible();
    await page.getByRole('switch', { name: 'Show only what Premium adds' }).check();
    await expect(page.getByRole('row', { name: /Release calendar/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Pick for Me/ })).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/plot-premium-${width}.png` });
    // Signed out, Upgrade sends the visitor to sign up with the plan they picked (monthly here);
    // no billing request is made until they have an account.
    await page.getByRole('button', { name: 'Upgrade to Premium' }).click();
    await expect(page).toHaveURL(/\/signup\?intent=premium&plan=monthly/);
    expect(billingRequests).toEqual([]);
    await page.goBack();
    await page.getByRole('link', { name: 'Privacy', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport();
    // Sign-up forwards the chosen billing period as ?billing=.
    await page.goto('/pricing?billing=monthly');
    await expect(page.getByText('US$3 billed monthly · taxes included', { exact: true })).toBeVisible();
    await page.goto('/pricing?intent=premium&plan=yearly');
    await page.getByRole('button', { name: 'Upgrade to Premium' }).click();
    await expect(page).toHaveURL(/\/signup\?intent=premium&plan=yearly/);
    expect(billingRequests).toEqual([]);

    await page.goto('/pricing?from=%2Fsettings%3Fsection%3Dbilling');
    await expect(page.getByRole('link', { name: 'Back to plot' })).toHaveAttribute('href', '/settings?section=billing');
    await page.goto('/pricing?from=%2Fterms');
    await page.getByRole('link', { name: 'Back to plot' }).click();
    await expect(page).toHaveURL(/\/terms/);
  });

  test(`closed checkout shows a waitlist instead of a failed upgrade at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const checkoutPosts = [];
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('stripe-billing')) checkoutPosts.push(request.url());
    });
    await mockCheckoutAvailability(page, false);
    await page.goto('/pricing');
    await expect(page.getByRole('link', { name: PLANS_PAGE.waitlistAction })).toBeVisible();
    await expect(page.getByRole('link', { name: PLANS_PAGE.waitlistAction })).toHaveAttribute('href', /mailto:contact@theplot.tv/);
    await expect(page.getByText(PLANS_PAGE.checkoutClosedDetail)).toBeVisible();
    await expect(page.getByText(PLANS_PAGE.checkoutClosedAnswer)).toBeVisible();
    await expect(page.getByRole('button', { name: PLANS_PAGE.upgradeAction })).toHaveCount(0);
    await expect(page.getByText(PLANS_PAGE.checkoutMessage)).toHaveCount(0);
    expect(checkoutPosts).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/plot-premium-closed-${width}.png` });
  });
}
