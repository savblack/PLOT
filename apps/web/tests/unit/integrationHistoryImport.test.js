import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Plex and Trakt expose Free history-only actions while sync stays Premium', () => {
  const plex = read('../../../../supabase/functions/media-sync/index.ts');
  const trakt = read('../../../../supabase/functions/trakt-sync/index.ts');

  for (const source of [plex, trakt]) {
    assert.match(source, /action === 'sync'[\s\S]+premium_required/);
    assert.match(source, /action === 'import-history'/);
    assert.doesNotMatch(source, /action === 'import-history'[^\n]+premium/);
  }

  assert.match(plex, /handleImportHistory[\s\S]+fetchPlexWatched[\s\S]+insertMissingHistory/);
  assert.doesNotMatch(plex.match(/async function handleImportHistory[\s\S]+?\n}\n/)?.[0] || '', /fetchPlexWatchlist|processOutbox/);

  assert.match(trakt, /handleImportHistory[\s\S]+fetchTraktHistory[\s\S]+insertMissingHistory/);
  assert.doesNotMatch(trakt.match(/async function handleImportHistory[\s\S]+?\n}\n/)?.[0] || '', /fetchTraktWatchlist|processOutbox/);
});

test('both import surfaces offer Plex and Trakt without enabling sync UI', () => {
  const webImport = read('../../src/components/ImportView.jsx');
  const mobileImport = read('../../../mobile/components/ImportHistoryModal.tsx');
  const webPlex = read('../../src/hooks/useMediaSync.js');
  const mobilePlex = read('../../../mobile/hooks/useMediaSync.ts');
  const webFlag = read('../../src/launchFeatures.js');
  const mobileFlag = read('../../../mobile/lib/launchFeatures.ts');

  for (const source of [webImport, mobileImport]) {
    assert.match(source, /id: 'plex'/);
    assert.match(source, /id: 'trakt'/);
    assert.match(source, /importHistory/);
  }
  assert.match(webFlag, /SHOW_MEDIA_SYNC_INTEGRATIONS = false/);
  assert.match(mobileFlag, /SHOW_MEDIA_SYNC_INTEGRATIONS = false/);
  for (const source of [webPlex, mobilePlex]) {
    assert.match(source, /pollPlexAuthorization/);
  }
});

test('both import surfaces offer Letterboxd and IMDb and resolve IMDb title ids', () => {
  const webImport = read('../../src/components/ImportView.jsx');
  const mobileImport = read('../../../mobile/components/ImportHistoryModal.tsx');

  for (const source of [webImport, mobileImport]) {
    assert.match(source, /id: 'letterboxd'/);
    assert.match(source, /id: 'imdb'/);
    assert.match(source, /findExternal/);
  }
});

test('Simkl is a configured manual two-way sync on both apps', () => {
  const edge = read('../../../../supabase/functions/simkl-sync/index.ts');
  const webImport = read('../../src/components/ImportView.jsx');
  const mobileImport = read('../../../mobile/components/ImportHistoryModal.tsx');
  const webSettings = read('../../src/components/SettingsView.jsx');
  const mobileSettings = read('../../../mobile/app/(app)/settings.tsx');
  const mobileHook = read('../../../mobile/hooks/useSimklSync.ts');

  assert.match(edge, /pullFromSimkl/);
  assert.match(edge, /pushToSimkl/);
  assert.match(edge, /simkl_last_activity/);
  assert.match(edge, /date_from=/);
  assert.match(edge, /oauth2\/authorize/);
  assert.match(edge, /oauth2\/token/);
  assert.match(edge, /code_challenge_method: 'S256'/);
  assert.match(edge, /grant_type: 'refresh_token'/);
  assert.match(edge, /scope: 'media:write'/);
  assert.match(edge, /\/sync\/all-items\?date_from=/);
  assert.doesNotMatch(edge, /setInterval|cron/);
  for (const source of [webImport, mobileImport]) {
    assert.match(source, /id: 'simkl'/);
    assert.match(source, /simklClientId/);
    assert.match(source, /Sync now/);
  }
  for (const source of [webSettings, mobileSettings]) assert.match(source, /useSimklSync/);
  assert.match(webSettings, /simkl\.sync/);
  assert.match(webSettings, /simkl\.disconnect/);
  assert.match(mobileSettings, /openIntegrationMenu\([^\n]+simkl\)/);
  assert.match(mobileHook, /sync: importHistory/);
  assert.match(mobileHook, /disconnect/);
});
