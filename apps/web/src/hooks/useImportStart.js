// Starting a background import from a picked source: the state behind the
// source dialog (components/ImportSourceDialog.jsx), shared by onboarding's
// switching-apps step and Settings › Connections › Add a source.
//
// A file source: attach (drop or browse) → upload → queued. A connect source:
// connect (OAuth) → ready (server and profile for Plex) → start → queued. The
// job itself runs server side (packages/core/importJobs.js); this only
// enqueues it and watches the account's jobs so tiles and the pill can show
// what is running and what waits.
import { useCallback, useEffect, useState } from 'react';
import { createImportReporter } from '@plot/core/importPipeline.js';
import { startFileImport, startConnectionImport, useImportJobs, importJobActive, importSourceName, importPillFor } from '@plot/core/importJobs.js';
import { findImportSource } from '@plot/core/onboardingSetup.js';
import { usePlexSource } from '@plot/core/usePlexSource.js';
import { getConfig } from '@plot/core/config.js';
import { IMPORT_JOBS } from '../copy/importJobs.js';
import { useTraktSync } from './useTraktSync.js';
import { useMediaSync } from './useMediaSync.js';
import { useSimklSync } from './useSimklSync.js';
import { buildTraktAuthorizeUrl, createTraktState, redirectToExternal, TRAKT_POPUP_MESSAGE } from '../utils/redirects.js';

// A quick row count for the receipt under the drop zone: text exports only,
// and only when they are small enough to read on the main thread.
const ROW_COUNT_MAX_BYTES = 20 * 1024 * 1024;
async function countRows(files) {
  let total = 0;
  for (const file of files) {
    if (!/\.(csv|json|txt)$/i.test(file.name) || file.size > ROW_COUNT_MAX_BYTES) return null;
    const text = await file.text();
    if (/\.json$/i.test(file.name)) {
      try { const parsed = JSON.parse(text); total += Array.isArray(parsed) ? parsed.length : 0; } catch { return null; }
    } else {
      total += Math.max(0, text.split(/\r?\n/).filter(line => line.trim()).length - 1);
    }
  }
  return total || null;
}

/** @typedef {'pick' | 'file' | 'uploading' | 'connect' | 'connecting' | 'ready' | 'starting' | 'queued'} ImportStartPhase */

/**
 * @param {{
 *   userId: string | null | undefined,
 *   entry: string,
 *   returnPath: (sourceId: string) => string,
 *   onBeforeRedirect?: () => void,
 *   initialSource?: string | null,
 *   history?: boolean,
 * }} args
 *   returnPath: where a same-tab OAuth round trip (Simkl, or Trakt with the
 *   popup blocked) should land; `?import=<source>` on it reopens the dialog in
 *   the connecting phase, which `initialSource` carries in.
 */
export function useImportStart({ userId, entry, returnPath, onBeforeRedirect, initialSource = null, history = false }) {
  // Only a connect source comes back mid-flow; anything else starts fresh.
  const initial = findImportSource(initialSource)?.lane === 'connect' ? initialSource : null;
  const [source, setSource] = useState(initial);
  const [phase, setPhase] = useState(/** @type {ImportStartPhase} */ (initial ? 'connecting' : 'pick'));
  const [error, setError] = useState(null);
  const [pendingFiles, setPendingFiles] = useState(null);
  const [pendingRows, setPendingRows] = useState(null);

  const jobs = useImportJobs(userId, { history });
  const trakt = useTraktSync(userId);
  const plex = useMediaSync(userId);
  const simkl = useSimklSync(userId);
  const plexSource = usePlexSource(userId, { autoPick: true });

  const connection = source === 'trakt' ? trakt : source === 'plex' ? plex : source === 'simkl' ? simkl : null;
  const loadTrakt = trakt.loadIntegration;
  const loadPlex = plex.loadIntegration;
  const loadSimkl = simkl.loadIntegration;
  useEffect(() => {
    if (!userId) return;
    loadTrakt();
    loadPlex();
    loadSimkl();
  }, [userId, loadTrakt, loadPlex, loadSimkl]);

  // A connection that lands (popup message, Plex poll, or the same-tab
  // return) moves the dialog on to "import".
  const connected = !!connection?.isConnected;
  useEffect(() => {
    if (connected && ['connect', 'connecting'].includes(phase)) setPhase('ready');
  }, [connected, phase]);
  // Plex needs a server and profile; load the list as soon as it is connected.
  const plexChoose = plexSource.choose;
  const plexListed = !!plexSource.servers;
  useEffect(() => {
    if (source === 'plex' && connected && !plexListed) plexChoose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose is recreated every render; the listed flag is the guard
  }, [source, connected, plexListed]);
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== TRAKT_POPUP_MESSAGE) return;
      loadTrakt();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadTrakt]);

  const connectedIds = [trakt.isConnected && 'trakt', plex.isConnected && 'plex', simkl.isConnected && 'simkl'].filter(Boolean);
  const reporter = useCallback(() => createImportReporter({ entry }), [entry]);
  const busy = ['uploading', 'starting'].includes(phase);

  const pick = useCallback((id) => {
    const src = findImportSource(id);
    if (!src || busy) return;
    if (jobs.jobs.some(job => job.source === id && importJobActive(job))) return;
    reporter().selected(id);
    setSource(id);
    setError(null);
    setPendingFiles(null);
    setPendingRows(null);
    if (src.lane === 'connect') {
      const conn = id === 'trakt' ? trakt : id === 'plex' ? plex : simkl;
      setPhase(conn.isConnected ? 'ready' : 'connect');
    } else {
      setPhase('file');
    }
  }, [busy, jobs.jobs, reporter, trakt, plex, simkl]);

  const close = useCallback(() => {
    if (busy) return;
    setSource(null);
    setPhase('pick');
    setError(null);
    setPendingFiles(null);
    setPendingRows(null);
  }, [busy]);

  // A file lands on the drop zone (or on a tile): hold it and count its rows.
  const attachFiles = useCallback((fileList, sourceId = source) => {
    const files = Array.from(fileList || []);
    const src = findImportSource(sourceId);
    if (!src || src.lane !== 'upload' || busy) return;
    // An empty list clears the receipt ("Choose a different file").
    if (!files.length) { setPendingFiles(null); setPendingRows(null); return; }
    if (sourceId !== source) {
      reporter().selected(sourceId);
      setSource(sourceId);
      setError(null);
    }
    setPhase('file');
    setPendingFiles(files);
    setPendingRows(null);
    countRows(files).then(count => setPendingRows(count));
  }, [source, busy, reporter]);

  const upload = useCallback(async () => {
    if (!userId || !source || phase !== 'file' || !pendingFiles?.length) return null;
    const files = pendingFiles.map(file => ({ name: file.name, body: file, contentType: file.type || undefined }));
    setPhase('uploading');
    setError(null);
    const { job, error: failure } = await startFileImport({ userId, source, entry, files });
    if (failure) { setError(failure.message); setPhase('file'); return null; }
    reporter().report('started', { source, count: pendingRows || 0 });
    setPendingFiles(null);
    setPendingRows(null);
    await jobs.refresh();
    setPhase('queued');
    return job;
  }, [userId, source, phase, pendingFiles, pendingRows, entry, reporter, jobs]);

  const connect = useCallback(() => {
    if (source === 'plex') {
      setPhase('connecting');
      plex.startPlexAuth().then(result => { if (result?.integration?.id) plex.pollPlexAuth(result.integration.id); else setPhase('connect'); });
      return;
    }
    if (source === 'simkl') {
      // Simkl only connects in the same tab; ?import=simkl brings the page
      // back to this dialog.
      onBeforeRedirect?.();
      setPhase('connecting');
      simkl.connect(returnPath('simkl'));
      return;
    }
    const clientId = getConfig().traktClientId;
    if (!clientId) { setError(IMPORT_JOBS.onboarding.uploadFailed); return; }
    // The popup keeps this page alive. A blocked popup falls back to the same
    // tab; ?import=trakt brings the page back to this dialog.
    const url = buildTraktAuthorizeUrl(clientId, createTraktState(returnPath('trakt')));
    const popup = window.open(url, 'plot-trakt', 'popup,width=600,height=760');
    if (popup) setPhase('connecting');
    else { onBeforeRedirect?.(); redirectToExternal(url); }
  }, [source, plex, simkl, returnPath, onBeforeRedirect]);

  const startJob = useCallback(async () => {
    if (!source || phase !== 'ready') return;
    setPhase('starting');
    setError(null);
    const { error: failure } = await startConnectionImport({ source, entry });
    if (failure) { setError(failure.message); setPhase('ready'); return; }
    reporter().report('started', { source, count: 0 });
    await jobs.refresh();
    setPhase('queued');
  }, [source, phase, entry, reporter, jobs]);

  // "Add another source": back to the tiles with this one marked.
  const addAnother = useCallback(() => {
    setSource(null);
    setPhase('pick');
    setError(null);
  }, []);

  const queuedBehind = phase === 'queued' && jobs.current && jobs.current.source !== source ? importSourceName(jobs.current.source) : null;

  return {
    source, phase, busy, error: error || connection?.error || null,
    connectedAs: connected ? (connection?.integration?.display_name || null) : null,
    queuedBehind, pendingFiles, pendingRows,
    jobs: jobs.jobs, current: jobs.current, queued: jobs.queued, refreshJobs: jobs.refresh, cancelJob: jobs.cancel, dismissJob: jobs.dismiss,
    connectedIds,
    pill: importPillFor(jobs.current, jobs.queued),
    plex: source === 'plex' && connected ? {
      servers: plexSource.servers || [], profiles: plexSource.profiles || [], serverId: plexSource.serverId || null,
      selected: !!plexSource.selected, selection: plexSource.selection || null, busy: plexSource.busy, error: plexSource.error || null, choose: plexSource.choose,
    } : null,
    pick, close, attachFiles, upload, connect, startJob, addAnother,
    // The connections themselves, for surfaces that also disconnect.
    accounts: { trakt, plex, simkl, plexSource },
  };
}
