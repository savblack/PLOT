import { expect, test } from '@playwright/test';

// Settings › Connections › Your sources on an in-memory backend: a connected
// Plex account needs a server and profile before it can import, a queued job
// shows on the row and at the top, a failed status read is reported and
// clears, and switching accounts shows none of it.
test('sources need a Plex selection, report queued work honestly and isolate accounts', async ({ page }) => {
  // The tracking status is polled every 15 seconds; the failed read and its
  // recovery each wait for one poll.
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/smoke/fixtures/settings-sources.html');

  // The row says what is missing; its one obvious next step opens the detail.
  const row = page.getByRole('button', { name: 'Open Plex' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Needs a server')).toBeVisible();
  await page.getByRole('button', { name: 'Choose server' }).click();

  // The only server is picked for them; the profile is a real choice, and the
  // import button waits for it.
  const detail = page.getByRole('dialog', { name: 'Plex' });
  await expect(detail).toBeVisible();
  const importButton = detail.getByRole('button', { name: 'Import from this profile' });
  await expect(importButton).toBeDisabled();
  await expect(detail.getByRole('radio', { name: 'My server' })).toHaveAttribute('aria-checked', 'true');
  await detail.getByRole('radio', { name: 'My profile' }).click();
  await expect(detail.getByText(/Only what My profile has watched on My server/)).toBeVisible();
  await expect(importButton).toBeEnabled();

  // Importing opens the source dialog, which enqueues the job.
  await importButton.click();
  const dialog = page.getByRole('dialog', { name: 'Plex' });
  await dialog.getByRole('button', { name: 'Import from this profile' }).click();
  await expect(dialog.getByText(/Got it\. Your Plex history is importing/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The queued job is on the row and at the top of the section.
  await expect(page.getByRole('button', { name: 'Open Plex' }).getByText('Importing')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Importing from Plex' })).toBeVisible();

  // A failed tracking read is reported in the detail, then clears.
  await page.getByRole('button', { name: 'Fail next status read' }).click();
  await page.getByRole('button', { name: 'Open Plex' }).click();
  await expect(page.getByRole('dialog', { name: 'Plex' }).getByText('Could not update tracking. Check your connection and retry.')).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole('dialog', { name: 'Plex' }).getByText('Could not update tracking. Check your connection and retry.')).toHaveCount(0, { timeout: 25000 });
  await page.keyboard.press('Escape');

  // Another account sees none of this.
  await page.getByRole('button', { name: 'Switch account' }).click();
  await expect(page.getByText('Bring your history over')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Plex' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Importing from Plex' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
