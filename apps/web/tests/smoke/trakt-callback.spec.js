import { test, expect } from '@playwright/test';
import { TRAKT_CALLBACK_PAGE } from '../../src/copy/traktCallbackPage.js';

// Setup connects Trakt in a popup, with the setup page still open behind it
// (hooks/useImportStart.js). When the connect fails there, the error page
// offers to close the popup: a link back would open a second copy of setup
// inside the small window.
test('a failed Trakt connect in the popup offers to close it, and closes it', async ({ page }) => {
  await page.goto('/login');
  const openerUrl = page.url();
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    // The window name and features setup uses; no code is a cancelled connect.
    page.evaluate(() => { window.open('/auth/trakt', 'plot-trakt', 'popup,width=600,height=760'); }),
  ]);
  await expect(popup.getByText(TRAKT_CALLBACK_PAGE.noAuthCode)).toBeVisible();
  const close = popup.getByRole('button', { name: TRAKT_CALLBACK_PAGE.closeWindow, exact: true });
  await expect(close).toBeVisible();
  await expect(popup.getByRole('link')).toHaveCount(0);

  // The click closes the page it is acting on, so Playwright can reject it
  // with "Target page, context or browser has been closed" before it reports
  // the click as done. That is the behaviour under test: the close event is
  // the assertion, and any other click failure still fails the test.
  const clicked = close.click().catch((error) => {
    if (!/has been closed/.test(String(error?.message))) throw error;
  });
  await Promise.all([popup.waitForEvent('close'), clicked]);
  expect(popup.isClosed()).toBe(true);
  expect(page.isClosed()).toBe(false);
  expect(page.url()).toBe(openerUrl);
});

test('a failed Trakt connect in a normal tab shows a link back, not the close button', async ({ page }) => {
  await page.goto('/auth/trakt');
  await expect(page.getByRole('link', { name: TRAKT_CALLBACK_PAGE.backToSettings, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: TRAKT_CALLBACK_PAGE.closeWindow })).toHaveCount(0);
});
