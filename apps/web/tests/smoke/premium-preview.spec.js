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
    await page.getByText('Compare every feature', { exact: true }).click();
    await expect(page.getByRole('row', { name: /Private watchlist notes/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Leaving-my-service-soon alerts.*Pending validation/ })).toBeVisible();
    await expect(page.getByText('A$5', { exact: true })).toBeVisible();
    await expect(page.getByText('or A$40/year', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /Up to five custom lists/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Configurable iOS widgets/ })).toBeVisible();
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
