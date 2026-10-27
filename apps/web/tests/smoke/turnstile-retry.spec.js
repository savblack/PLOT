import { expect, test } from '@playwright/test';

test('the actual web widget can retry after the previous submit stopped waiting', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/smoke/fixtures/turnstile-retry.html');
  await page.getByRole('button', { name: 'Submit auth attempt' }).click();
  await expect(page.getByLabel('Captcha token')).toHaveText('Waiting for verification');
  await page.getByRole('button', { name: 'Submit auth attempt' }).click();
  await expect(page.getByLabel('Captcha token')).toHaveText('retry-token');
  expect(errors).toEqual([]);
});

test('an unfinished challenge can still report a late token', async ({ page }) => {
  await page.goto('/tests/smoke/fixtures/turnstile-retry.html');
  await page.getByRole('button', { name: 'Submit auth attempt' }).click();
  await expect(page.getByLabel('Captcha token')).toHaveText('Waiting for verification');
  await page.getByRole('button', { name: 'Finish pending challenge' }).click();
  await expect(page.getByLabel('Captcha token')).toHaveText('late-token');
});
