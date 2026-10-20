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

test('a Trakt account import reports import_completed once, from the screen', () => {
  const webHook = read('../../src/hooks/useTraktSync.js');
  const mobileHook = read('../../../mobile/hooks/useTraktSync.ts');
  const webImport = read('../../src/components/ImportView.jsx');
  const mobileImport = read('../../../mobile/components/ImportHistoryModal.tsx');

  for (const hook of [webHook, mobileHook]) {
    assert.doesNotMatch(hook, /IMPORT_COMPLETED/);
  }
  assert.match(webImport, /report\('completed', \{ source, count: result\.importedCount \|\| 0 \}\)/);
  assert.match(mobileImport, /report\('completed', \{ source: platform, count: result\.importedCount \|\| 0 \}\)/);
});

test('both import surfaces offer Plex and Trakt, and sync UI is Premium-gated', () => {
  const webImport = read('../../src/components/ImportView.jsx');
  const mobileImport = read('../../../mobile/components/ImportHistoryModal.tsx');
  const webPlex = read('../../src/hooks/useMediaSync.js');
  const mobilePlex = read('../../../mobile/hooks/useMediaSync.ts');
  const webFlag = read('../../src/launchFeatures.js');
  const mobileFlag = read('../../../mobile/lib/launchFeatures.ts');
  // Web Settings: the Simkl row is a source (components/SettingsSources.jsx);
  // connecting and removing go through hooks/useImportStart.js, and a manual
  // import enqueues a job the worker runs through simkl-sync.
  const webSettings = read('../../src/components/SettingsSources.jsx') + read('../../src/hooks/useImportStart.js');
  // Mobile Settings mirrors it: the rows are components/SettingsSources.tsx,
  // on hooks/useImportStart.ts for connecting and removing.
  const mobileSettings = read('../../../mobile/app/(app)/settings.tsx') + read('../../../mobile/components/SettingsSources.tsx') + read('../../../mobile/hooks/useImportStart.ts');

  for (const source of [webImport, mobileImport]) {
    assert.match(source, /id: 'plex'/);
    assert.match(source, /id: 'trakt'/);
    assert.match(source, /importHistory/);
  }
  assert.match(webFlag, /SHOW_MEDIA_SYNC_INTEGRATIONS = true/);
  assert.match(mobileFlag, /SHOW_MEDIA_SYNC_INTEGRATIONS = true/);
  // Web: one-off imports are free for everyone; the automatic toggle is the
  // one Premium thing and sends Free to the plans page.
  assert.match(webSettings, /premium\.isPremium/);
  assert.match(webSettings, /automaticNeedsPremium/);
  assert.match(webSettings, /startPlexAuth\(\)/);
  assert.match(webSettings, /buildTraktAuthorizeUrl/);
  // Mobile: the same shape. No Premium gate on connecting; the automatic
  // toggle sends Free to the Premium section.
  assert.match(mobileSettings, /isPremium=\{!!profile\?\.is_premium\}/);
  assert.match(mobileSettings, /automaticNeedsPremium/);
  assert.doesNotMatch(mobileSettings, /openPremiumSyncGate|SHOW_MEDIA_SYNC_INTEGRATIONS/);
  assert.match(mobileSettings, /startPlexAuth\(\)/);
  assert.match(mobileSettings, /trakt\.connect\(\)/);
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
  // Web Settings: the Simkl row is a source (components/SettingsSources.jsx);
  // connecting and removing go through hooks/useImportStart.js, and a manual
  // import enqueues a job the worker runs through simkl-sync.
  const webSettings = read('../../src/components/SettingsSources.jsx') + read('../../src/hooks/useImportStart.js');
  const mobileSettings = read('../../../mobile/app/(app)/settings.tsx') + read('../../../mobile/components/SettingsSources.tsx') + read('../../../mobile/hooks/useImportStart.ts');
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
  assert.match(webSettings, /startConnectionImport/);
  assert.match(webSettings, /simkl\.disconnect/);
  // Mobile: Simkl is a source row too; connect opens the system browser and
  // a manual import enqueues the same job.
  assert.match(mobileSettings, /simkl\.connect\(\)/);
  assert.match(mobileSettings, /simkl\.disconnect\(\)/);
  assert.match(mobileSettings, /startConnectionImport/);
  assert.match(mobileHook, /sync: importHistory/);
  assert.match(mobileHook, /disconnect/);
});
