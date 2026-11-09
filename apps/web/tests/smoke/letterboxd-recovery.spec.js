import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { ONBOARDING_FLOW as FLOW } from '@plot/core/copy/onboardingFlow.js';
import { IMPORT_VIEW as COPY } from '@plot/core/copy/importView.js';

const userId = '00000000-0000-4000-8000-000000000724';
const reminderKey = `plot.letterboxdImport.${userId}`;

async function setup(page, onboardingComplete = true) {
  await page.addInitScript(({ userId, onboardingComplete }) => {
    const profile = { id: userId, username: 'import-recovery-test', onboarding_complete: onboardingComplete, region: 'US', streaming_providers: [] };
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'import-recovery@example.invalid', app_metadata: {}, user_metadata: {} };
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify({ access_token: 'test-session-not-a-real-token', refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    localStorage.setItem('plot-cached-profile', JSON.stringify({ userId, profile }));
  }, { userId, onboardingComplete });
  await page.route('https://placeholder.invalid/**', route => route.fulfill({ json: { results: [] } }));
  await page.route('https://placeholder.supabase.co/**', route => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: { id: userId, role: 'authenticated' } });
    if (url.includes('/rest/v1/profiles')) return route.fulfill({ json: { id: userId, onboarding_complete: onboardingComplete, username: 'import-recovery-test', region: 'US' } });
    if (url.includes('/rest/v1/lists')) return route.fulfill({ json: { id: 'import-test-list', user_id: userId, name: '__watchlist__' } });
    return route.fulfill({ json: [] });
  });
}

const fixture = name => readFileSync(new URL(`../../../../packages/core/tests/fixtures/imports/letterboxd-${name}.csv`, import.meta.url), 'utf8');

test('a bad Letterboxd file keeps the reminder and a full export can be retried', async ({ page }, testInfo) => {
  await setup(page);
  await page.goto('/import?source=letterboxd');
  await expect(page.getByRole('link', { name: COPY.letterboxdExportLink })).toHaveAttribute('href', COPY.letterboxdExportUrl);
  await expect.poll(() => page.evaluate(key => !!localStorage.getItem(key), reminderKey)).toBe(true);
  const input = page.locator('input[type=file]');
  await input.setInputFiles({ name: 'diary.csv', mimeType: 'text/csv', buffer: Buffer.from('unexpected,columns\ninvalid,file') });
  await expect(page.getByText(/Couldn.t parse this file/)).toBeVisible();
  expect(await page.evaluate(key => !!localStorage.getItem(key), reminderKey)).toBe(true);
  const archive = zipSync(Object.fromEntries(['diary', 'watched', 'watchlist'].map(name => [`${name}.csv`, strToU8(fixture(name))])));
  await input.setInputFiles({ name: 'letterboxd-export.zip', mimeType: 'application/zip', buffer: Buffer.from(archive) });
  await expect(page.getByText('Christine', { exact: true })).toBeVisible();
  await expect(page.getByText('Summer with Monika', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: COPY.reportHeading })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('zip-history-preview.png'), fullPage: true });
});

test('leaving the file step offers an account reminder that can be dismissed', async ({ page }, testInfo) => {
  await setup(page);
  await page.goto('/import?source=letterboxd');
  await expect(page.getByRole('link', { name: COPY.letterboxdExportLink })).toBeVisible();
  await page.goto('/settings?section=connections');
  await expect(page.getByText(COPY.letterboxdFinishTitle, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: COPY.letterboxdFinishCta, exact: true }).click();
  await expect(page.getByRole('link', { name: COPY.letterboxdExportLink })).toBeVisible();
  await page.goto('/settings?section=connections');
  await page.getByRole('button', { name: COPY.letterboxdFinishDismiss, exact: true }).click();
  await expect(page.getByText(COPY.letterboxdFinishTitle, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), reminderKey)).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('reminder-dismissed.png'), fullPage: true });
});

test('the current Add a source flow also remembers a Letterboxd export', async ({ page }) => {
  await setup(page);
  await page.goto('/settings?section=connections');
  await page.getByRole('button', { name: 'Add a source', exact: true }).click();
  await page.getByRole('button', { name: /Letterboxd/ }).click();
  await expect.poll(() => page.evaluate(key => !!localStorage.getItem(key), reminderKey)).toBe(true);
  await page.goto('/settings?section=connections');
  await expect(page.getByText(COPY.letterboxdFinishTitle, { exact: true })).toBeVisible();
});

test('a failed background upload retains its file and reminder for retry', async ({ page }, testInfo) => {
  await setup(page);
  let attempts = 0;
  await page.route('**/storage/v1/object/**', route => {
    attempts++;
    return route.fulfill(attempts === 1
      ? { status: 503, json: { message: 'Synthetic upload failure' } }
      : { json: { Key: 'test-upload' } });
  });
  await page.route('**/rest/v1/rpc/enqueue_file_import_job', route => route.fulfill({ json: { id: 'test-import-job', user_id: userId, source: 'letterboxd', status: 'queued' } }));
  await page.goto('/settings?section=connections');
  await page.getByRole('button', { name: 'Add a source', exact: true }).click();
  await page.getByRole('button', { name: /Letterboxd/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'diary.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('diary')) });
  const submit = dialog.getByRole('button', { name: /^Import/ });
  await submit.click();
  await expect(submit).toBeEnabled();
  await expect.poll(() => attempts).toBe(1);
  expect(await page.evaluate(key => !!localStorage.getItem(key), reminderKey)).toBe(true);
  await submit.click();
  await expect.poll(() => attempts).toBe(2);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), reminderKey)).toBeNull();
  await expect(dialog.getByRole('status')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('background-retry-queued.png'), fullPage: true });
});

for (const width of [1280, 390]) {
  test(`onboarding import dialogs have space and Continue returns to picks at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, false);
    let queued = false;
    const job = { id: 'onboarding-test-job', user_id: userId, source: 'letterboxd', status: 'queued', created_at: '2026-10-18T00:00:00Z' };
    await page.route('**/rest/v1/import_jobs?*', route => route.fulfill({ json: queued ? [job] : [] }));
    await page.route('**/storage/v1/object/**', route => route.fulfill({ json: { Key: 'test-upload' } }));
    await page.route('**/rest/v1/rpc/enqueue_file_import_job', route => { queued = true; return route.fulfill({ json: job }); });
    await page.goto('/onboarding');
    await page.getByRole('button', { name: /Switching apps/ }).click();
    await page.getByRole('button', { name: /^Plex\./ }).click();
    let dialog = page.getByRole('dialog');
    const padding = await dialog.locator('.isp-dialog-content').evaluate(el => {
      const style = getComputedStyle(el);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), bottom: parseFloat(style.paddingBottom) };
    });
    expect(padding.left).toBeGreaterThanOrEqual(20);
    expect(padding.right).toBeGreaterThanOrEqual(20);
    expect(padding.bottom).toBeGreaterThanOrEqual(20);
    await page.screenshot({ path: testInfo.outputPath(`connection-padding-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Letterboxd\./ }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input[type=file]').setInputFiles({ name: 'diary.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture('diary')) });
    await dialog.getByRole('button', { name: /^Import/ }).click();
    await expect(dialog.getByRole('status')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`queued-padding-${width}.png`), fullPage: true });
    await dialog.getByRole('button', { name: FLOW.continueArrow, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: FLOW.step2.searchPlaceholder })).toBeEnabled();
    await expect(page.locator('.isp-pill')).toBeVisible();
    await expect(page.getByRole('button', { name: FLOW.skip, exact: true })).toBeEnabled();
    await expect(page.getByText(FLOW.services.title, { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`picks-with-import-${width}.png`), fullPage: true });
  });
}
