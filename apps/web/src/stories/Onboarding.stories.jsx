import { useEffect, useState } from 'react';
import OnboardingScreen from '../pages/OnboardingScreen.jsx';
import { buildingFan, buildingLines } from '@plot/core/onboardingSetup.js';
import { importPillFor } from '@plot/core/importJobs.js';

// A running Letterboxd job and a queued Netflix one, as import_jobs rows.
const runningJob = { id: 'j1', source: 'letterboxd', kind: 'file', status: 'running', phase: 'resolve', progress_done: 620, progress_total: 1284 };
const queuedJob = { id: 'j2', source: 'netflix', kind: 'file', status: 'queued', phase: 'parse', progress_done: 0, progress_total: 0 };

// Fictional titles and services, no images. Ids are negative on purpose: they
// are not TMDB ids (AGENTS.md: never guess one).
const titles = ['Slow Lane', 'Severed Ties', 'The Back Lot', 'Quips', 'East Pier', 'Digger Bay', 'The Envoy', 'Behemoth Bay', 'Harbour Lights', 'Gala Night', 'Old One', 'Late Talk']
  .map((title, i) => ({ id: -(i + 1), media_type: i % 2 ? 'movie' : 'tv', title, poster_path: null }));
const services = ['Service One', 'Service Two', 'Service Three', 'Service Four', 'Service Five', 'Service Six', 'Service Seven', 'Service Eight']
  .map((name, i) => ({ id: -(i + 100), name, logo_path: null }));
const noop = () => {};

function Screen({ step, selected = [-2, -4], picked = [-100, -104], firstName = 'Sam', lineIndex = 1, ticking = false, importSource = null, importPhase = 'pick', importError = null, jobs = [], pendingFiles = null, pendingRows = null, connectedIds = [] }) {
  const [sel, setSel] = useState(selected);
  const [line, setLine] = useState(lineIndex);
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setLine(i => (i + 1) % 4), 1500);
    return () => clearInterval(id);
  }, [ticking]);
  const [svc, setSvc] = useState(picked);
  return (
    <OnboardingScreen
      step={step}
      firstName={firstName}
      saving={false}
      saveError={null}
      canGoBack={step === 'import' || step === 'services'}
      onBack={noop}
      onSkip={noop}
      seed={{
        query: '', onQuery: noop, searching: false, items: titles, selectedIds: new Set(sel), count: sel.length,
        onToggle: (item) => setSel(s => (s.includes(item.id) ? s.filter(x => x !== item.id) : [...s, item.id])),
        onContinue: noop, onSwitch: noop,
      }}
      importStep={{
        start: {
          source: importSource, phase: importPhase, busy: false, error: importError, connectedAs: importSource === 'trakt' ? 'sam' : null,
          queuedBehind: importPhase === 'queued' && jobs.length ? 'Letterboxd' : null,
          pendingFiles, pendingRows, jobs, current: jobs[0] || null, queued: jobs.slice(1), connectedIds,
          pill: importPillFor(jobs[0] || null, jobs.slice(1)),
          plex: importSource === 'plex' && ['ready', 'starting'].includes(importPhase)
            ? { servers: [{ clientIdentifier: 'a', name: 'Living room NAS', owned: true }, { clientIdentifier: 'b', name: 'Tom’s server', owned: false }], profiles: [{ accountID: '1', name: 'Sam' }, { accountID: '2', name: 'Kids' }], serverId: 'a', selected: false, selection: null, busy: false, error: null, choose: noop }
            : null,
          pick: noop, close: noop, attachFiles: noop, upload: noop, connect: noop, startJob: noop, addAnother: noop,
        },
        onContinue: noop, onLater: noop,
      }}
      services={{
        list: services, error: false, selectedIds: svc,
        onToggle: (id) => setSvc(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])),
        region: 'US', editingRegion: false, onEditRegion: noop, onRegion: noop, onRegionDone: noop,
        onContinue: noop,
      }}
      building={{ leaving: false, fan: buildingFan(titles.filter(t => sel.includes(t.id)), titles), lines: buildingLines(svc.length > 0), lineIndex: line }}
    />
  );
}

export default {
  title: 'Onboarding/Flow',
  parameters: { layout: 'fullscreen' },
};

/** 1 · Save a few, or switch. Tap posters to save them. */
export const SaveAFew = { render: () => <Screen step="seed" /> };
/** 1 · No name from the sign-in provider (email sign-up), nothing saved yet. */
export const SaveAFewNoName = { render: () => <Screen step="seed" firstName="" selected={[]} /> };
/** 1b · Switching apps: where their history is now. Part of step 1. */
export const SwitchingApps = { render: () => <Screen step="import" /> };
// The import starts on this step and carries on in the background.
export const SwitchingAppsChooseFile = { render: () => <Screen step="import" importSource="letterboxd" importPhase="file" /> };
export const SwitchingAppsUploading = { render: () => <Screen step="import" importSource="letterboxd" importPhase="uploading" /> };
export const SwitchingAppsUploadFailed = { render: () => <Screen step="import" importSource="netflix" importPhase="file" importError="We couldn’t upload that file. Check your connection and try again." /> };
export const SwitchingAppsConnect = { render: () => <Screen step="import" importSource="trakt" importPhase="connect" /> };
export const SwitchingAppsConnecting = { render: () => <Screen step="import" importSource="trakt" importPhase="connecting" /> };
export const SwitchingAppsConnected = { render: () => <Screen step="import" importSource="trakt" importPhase="ready" /> };
export const SwitchingAppsPlexPickServer = { render: () => <Screen step="import" importSource="plex" importPhase="ready" /> };
export const SwitchingAppsFileAttached = { render: () => <Screen step="import" importSource="netflix" importPhase="file" pendingFiles={[{ name: 'NetflixViewingHistory.csv' }]} pendingRows={2106} /> };
export const SwitchingAppsQueued = { render: () => <Screen step="import" importSource="letterboxd" importPhase="queued" /> };
/** A second source picked while the first runs: its tile is held and the pill shows. */
export const SwitchingAppsSecondPick = { render: () => <Screen step="import" jobs={[runningJob, queuedJob]} connectedIds={['trakt']} /> };
export const SwitchingAppsQueuedBehind = { render: () => <Screen step="import" importSource="netflix" importPhase="queued" jobs={[runningJob, queuedJob]} /> };
/** 2 · Where do you watch. */
export const WhereDoYouWatch = { render: () => <Screen step="services" /> };
/** The import pill rides along while the import runs. */
export const WhereDoYouWatchImporting = { render: () => <Screen step="services" jobs={[runningJob, queuedJob]} /> };
/** 2 · Nothing picked yet. */
export const WhereDoYouWatchNonePicked = { render: () => <Screen step="services" picked={[]} /> };
/** 3 · Building your Plot: the cards deal in, then shuffle with each line. */
export const Building = { render: () => <Screen step="building" ticking /> };
/** 3 · Only one title picked: trending titles fill the fan. */
export const BuildingOnePick = { render: () => <Screen step="building" selected={[-5]} ticking /> };
