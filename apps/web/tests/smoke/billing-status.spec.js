import { test, expect } from '@playwright/test';

test('Billing states retain portal access and place optional support after the subscription', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/smoke/fixtures/billing-status.html');
  for (const name of ['No subscription', 'Expired subscription', 'Active subscription', 'No billing relationship']) {
    const section = page.getByRole('region', { name, exact: true });
    await expect(section.locator('.settings-premium-card + .settings-support')).toBeVisible();
    await expect(section.locator('.settings-support')).toContainText('Every contribution helps keep it running, growing and, most importantly, independent.');
    const manage = section.getByRole('button', { name: 'Manage subscription', exact: true });
    await expect(manage).toHaveCount(['Expired subscription', 'Active subscription'].includes(name) ? 1 : 0);
  }
  expect(errors).toEqual([]);
});
