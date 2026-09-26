import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`Premium preview stops before checkout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const billingRequests = [];
    const errors = [];
    page.on('request', request => {
      if (request.url().includes('stripe-billing')) billingRequests.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: 'Less deciding. More watching.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compare every feature' })).toBeVisible();
    await expect(page.getByText('Premium features are coming soon.', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /Episode release notifications.*Coming soon/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Join shared lists and watch sessions.*Free with a Premium host/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Import history from your other apps/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Viewing stats.*Overview.*Deeper/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Plex and Trakt.*Manual.*Automatic/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Custom lists.*5.*Unlimited/ })).toBeVisible();

    // Annual is the default: $2/month, billed $24 yearly; monthly shows $3.
    await expect(page.getByText('US$24 billed yearly · taxes included', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Monthly' }).click();
    await expect(page.getByText('US$3 billed monthly · taxes included', { exact: true })).toBeVisible();

    // The Premium-only filter hides rows that match on both plans.
    await expect(page.getByRole('row', { name: /Release calendar/ })).toBeVisible();
    await page.getByRole('switch', { name: 'Show only what Premium adds' }).check();
    await expect(page.getByRole('row', { name: /Release calendar/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Pick for Me/ })).toBeVisible();
    await page.getByRole('button', { name: 'Upgrade to Premium' }).click();
    await expect(page.getByRole('status')).toContainText('Checkout is not open yet');
    expect(billingRequests).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('status').scrollIntoViewIfNeeded();
    await expect(page.getByRole('status')).toBeInViewport();
    await page.screenshot({ path: `/tmp/plot-premium-${width}.png` });
    await page.getByRole('link', { name: 'Privacy', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport();
    // Sign-up forwards the chosen billing period as ?billing=.
    await page.goto('/pricing?billing=monthly');
    await expect(page.getByText('US$3 billed monthly · taxes included', { exact: true })).toBeVisible();
    await page.goto('/pricing?intent=premium&plan=yearly');
    await page.getByRole('button', { name: 'Upgrade to Premium' }).click();
    await expect(page.getByRole('status')).toContainText('There is nothing to pay today');
    expect(billingRequests).toEqual([]);

    await page.goto('/plans?from=%2Fsettings%3Fsection%3Dbilling');
    await expect(page.getByRole('link', { name: 'Back to plot' })).toHaveAttribute('href', '/settings?section=billing');
    await page.goto('/plans?from=%2Fterms');
    await page.getByRole('link', { name: 'Back to plot' }).click();
    await expect(page).toHaveURL(/\/terms/);
  });
}
