// Normal web entry point, real staging Auth/catalogue/annotation RPCs; synthetic QA only.
const { chromium, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
(async () => {
  if (!process.argv[2]) throw Error('Supply the private pilot directory');
  const mixedZip = process.argv[3] === '--mixed-zip';
  if (process.argv[3] && !mixedZip) throw Error('Unknown verification mode');
  const privateFile = name => JSON.parse(readFileSync(resolve(process.argv[2], name)));
  const account = privateFile('accounts.json')[0];
  if (!/^plot-import-qa-.*@example\.invalid$/.test(account.email)) throw Error('Only the authorised synthetic QA account is allowed');
  const key = privateFile('api-keys.json').find(k => k.type === 'publishable').api_key;
  const host = 'uzrhfivnhdcfieuaxzip.supabase.co';
  const client = createClient(`https://${host}`, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error || data.user.id !== account.id) throw Error('Synthetic QA login failed');
  const snapshot = async table => {
    const { data, error } = await client.from(table).select('*').eq('user_id', account.id).limit(1000);
    if (error || data.length === 1000) throw Error('Incomplete database snapshot');
    return data.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  };
  const before = { history: await snapshot('history'), events: await snapshot('watch_events') };
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  let saves = 0;
  let watchSaves = 0;
  try {
    const context = await browser.newContext();
    await context.route('**/*.supabase.co/**', route => {
      if (new URL(route.request().url()).hostname !== host) { errors.push('Unexpected Supabase project'); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().endsWith('/rpc/import_watch_events') && response.status() === 200) watchSaves++;
      if (response.url().endsWith('/rpc/import_saved_annotations') && response.status() === 200) saves++;
    });
    await page.goto('http://127.0.0.1:5183/login');
    await page.locator('#auth-email').fill(account.email);
    await page.locator('#auth-password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.getByText('Settings', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Import watch history', exact: true }).click();
    const allRatings = JSON.parse(readFileSync('packages/core/tests/fixtures/imports/trakt-annotations.json'));
    const records = allRatings.filter(row => row.type === 'show');
    let upload = { name: 'ratings-shows.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)) };
    if (mixedZip) {
      const { zipSync, strToU8 } = require('fflate');
      upload = { name: 'trakt-qa.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({
        'watched-history.json': readFileSync('packages/core/tests/fixtures/imports/trakt-history.json'),
        'ratings-shows.json': strToU8(JSON.stringify(records)),
        'ratings-episodes.json': strToU8(JSON.stringify(allRatings.filter(row => row.type === 'episode'))),
      })) };
    }
    const review = async () => {
      await page.getByRole('button', { name: 'Trakt saved export JSON export' }).click();
      await page.locator('input[type=file]').setInputFiles(upload);
      await expect(page.getByText(/Rating: 8\/10/)).toBeVisible();
      if (mixedZip) {
        await expect(page.getByText(/Rating: 7\/10/)).toBeVisible();
        // Deliberately keep these synthetic QA watches separate from previous pilot sources.
        const keep = page.getByRole('button', { name: 'Save as a separate watch', exact: true });
        while (await keep.count()) await keep.first().click();
      }
      await expect(page.getByRole('button', { name: 'Import →', exact: true })).toBeEnabled();
    };
    await review();
    if (saves !== 0 || watchSaves !== 0) throw Error('Annotation saved before confirmation');
    await page.getByRole('button', { name: 'Import →', exact: true }).click();
    await expect(page.getByText(mixedZip ? /[0-4] entr(?:y|ies) added · [0-4] duplicates? skipped · 0 not confirmed/ : /(?:1 entry added · 0 duplicates|0 entries added · 1 duplicate) skipped · 0 not confirmed/)).toBeVisible();
    const afterFirst = { history: await snapshot('history'), events: await snapshot('watch_events') };
    await page.goto('http://127.0.0.1:5183/import');
    await review();
    await page.getByRole('button', { name: 'Import →', exact: true }).click();
    await expect(page.getByText(mixedZip ? '0 entries added · 4 duplicates skipped · 0 not confirmed' : '0 entries added · 1 duplicate skipped · 0 not confirmed', { exact: true })).toBeVisible();
    if (saves !== 2) throw Error('Expected two successful real annotation RPC responses');
    const assert = require('node:assert/strict');
    assert.deepEqual(await snapshot('history'), afterFirst.history);
    assert.deepEqual(await snapshot('watch_events'), afterFirst.events);
    for (const row of before.history) assert.deepEqual(afterFirst.history.find(item => item.id === row.id), row);
    for (const row of before.events) assert.deepEqual(afterFirst.events.find(item => item.id === row.id), row);
    if (!mixedZip) {
      assert.deepEqual(afterFirst.history, before.history);
      assert.deepEqual(afterFirst.events, before.events);
    } else {
      assert.equal(watchSaves, 2);
      assert.ok(afterFirst.events.some(row => row.source === 'trakt' && row.source_account === 'saved-export' && row.season_number === 2 && row.episode_number === 13));
    }
    const annotations = await snapshot('imported_annotations');
    assert.ok(annotations.some(row => row.source === 'trakt' && row.annotation_scope === 'show' && row.annotation.rating === 8 && row.external_ids.imdb === records[0].show.ids.imdb));
    if (mixedZip) assert.ok(annotations.some(row => row.source === 'trakt' && row.annotation_scope === 'episode' && row.season_number === 1 && row.episode_number === 1 && row.annotation.rating === 7));
    assert.deepEqual(errors, []);
    console.log(mixedZip
      ? 'PASS normal web mixed Trakt ZIP: separate watches and ratings, four duplicates on replay, existing history/events preserved, no uncaught page errors'
      : 'PASS normal web Trakt rating: login, Settings, review, confirmation, persistence and replay; history unchanged, no uncaught page errors');
  } finally { await browser.close(); await client.auth.signOut({ scope: 'local' }); }
})().catch(error => { console.error(error.message); process.exit(1); });
