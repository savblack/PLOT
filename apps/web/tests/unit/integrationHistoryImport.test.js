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
    assert.match(source, /status === 'authorized'/);
  }
});
