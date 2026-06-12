import { expect, test } from '@playwright/test';

const pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test('public landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('PLOT').first()).toBeVisible();
});

test('auth routes render their forms', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

  await page.goto('/signup');
  await expect(page.getByRole('button', { name: /create account|sign up/i })).toBeVisible();
});

test('legal routes render', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByText(/privacy/i).first()).toBeVisible();

  await page.goto('/terms');
  await expect(page.getByText(/terms/i).first()).toBeVisible();
});

test('protected app route redirects anonymous users to login', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('public profile route is reachable without auth', async ({ page }) => {
  await page.goto('/u/smoke-test-user');
  await expect(page.getByRole('heading', { name: /plot doesn't have profiles yet/i })).toBeVisible();
  await expect(page.getByText('If someone opens @smoke-test-user, they should land on this holding page until profiles are actually designed and built into the app.')).toBeVisible();
});
