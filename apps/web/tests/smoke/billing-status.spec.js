import { test, expect } from '@playwright/test';

const PAYING = ['Active subscription', 'Free trial', 'Ending subscription'];
const MANAGEABLE = ['Expired subscription', ...PAYING];

test('Billing states retain portal access, and only someone not paying is asked for support', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/smoke/fixtures/billing-status.html');
  for (const name of ['No subscription', 'Expired subscription', 'Premium provided by Plot', ...PAYING]) {
    const section = page.getByRole('region', { name, exact: true });
    // Optional support sits after the plan card. A paying member is not asked for a tip too.
    if (PAYING.includes(name)) {
      await expect(section.locator('.settings-support')).toHaveCount(0);
    } else {
      await expect(section.locator('.settings-premium-card + .settings-support')).toBeVisible();
      await expect(section.locator('.settings-support')).toContainText('Every contribution helps keep it running, growing and, most importantly, independent.');
    }
    const manage = section.getByRole('button', { name: 'Manage subscription', exact: true });
    await expect(manage).toHaveCount(MANAGEABLE.includes(name) ? 1 : 0);
    if (name === 'Premium provided by Plot') {
      await expect(section.getByText('Your Premium access is provided by Plot. There is no Stripe subscription to manage.')).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test('a member sees a membership card, not the sales pitch', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/billing-status.html');
  const active = page.getByRole('region', { name: 'Active subscription', exact: true });
  await expect(active.locator('.settings-status')).toHaveText('Active');
  await expect(active.getByText('Renews on June 19, 2027.')).toBeVisible();
  // Each Premium feature is a link into the app.
  await expect(active.getByRole('link', { name: 'Open Just Decide' })).toHaveAttribute('href', '/tonight');
  await expect(active.getByRole('link', { name: 'Open Unlimited and smart lists' })).toHaveAttribute('href', '/my-lists');
  await expect(active.getByRole('link', { name: 'Open Customize your plot' })).toHaveAttribute('href', '/settings/themes');
  // The Free pitch (price and trial terms) is gone for a member.
  await expect(active.getByText('US$3/month or US$24/year, taxes included')).toHaveCount(0);

  const trial = page.getByRole('region', { name: 'Free trial', exact: true });
  await expect(trial.locator('.settings-status')).toHaveText('Free trial');
  await expect(trial.getByText('Your free trial ends on November 17, 2026. Your first payment is taken then.')).toBeVisible();

  const ending = page.getByRole('region', { name: 'Ending subscription', exact: true });
  await expect(ending.locator('.settings-status')).toHaveText('Ending');
  await expect(ending.getByText('Your membership ends on June 19, 2027. You keep Premium until then.')).toBeVisible();

  // Someone on Free still sees the pitch and no membership rows.
  const free = page.getByRole('region', { name: 'No subscription', exact: true });
  await expect(free.getByText('US$3/month or US$24/year, taxes included')).toBeVisible();
  await expect(free.getByRole('link', { name: 'Open Just Decide' })).toHaveCount(0);
});
