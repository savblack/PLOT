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
  // The root route is a transient app shell before auth decides whether to send
  // an anonymous visitor to the external marketing site. Keep this smoke check
  // scoped to the local document so it does not depend on Supabase session
  // configuration or a cross-origin page that is outside this app's build.
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page).toHaveTitle(/PLOT/);
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
  // A non-existent (or private, to an anon viewer) profile shows the placeholder.
  await expect(page.getByRole('heading', { name: /isn't public/i })).toBeVisible();
  await expect(page.getByText(/either doesn't exist or hasn't made their profile public yet/i)).toBeVisible();
});
