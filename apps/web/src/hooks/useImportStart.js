// Starting a background import from a picked source: the state behind the
// source dialog (components/ImportSourceDialog.jsx), shared by onboarding's
// switching-apps step and Settings › Connections › Add a source.
//
// A file source: attach (drop or browse) → upload → queued. A connect source:
// connect (OAuth) → ready (server and profile for Plex) → start → queued. The
// job itself runs server side (packages/core/importJobs.js); this only
// enqueues it and watches the account's jobs so tiles and the pill can show
// what is running and what waits.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createImportReporter, IMPORT_FAILURE_REASONS } from '@plot/core/importPipeline.js';
import { rememberLetterboxdImport, clearLetterboxdImport } from '../utils/letterboxdImportPrompt.js';
import { startFileImport, startConnectionImport, useImportJobs, importJobActive, importSourceName, importPillFor, importListChoiceNeeded } from '@plot/core/importJobs.js';
import { findImportSource } from '@plot/core/onboardingSetup.js';
import { usePlexSource } from '@plot/core/usePlexSource.js';
import { getConfig } from '@plot/core/config.js';
import { IMPORT_JOBS } from '../copy/importJobs.js';
import { useTraktSync } from './useTraktSync.js';
import { useMediaSync } from './useMediaSync.js';
import { useSimklSync } from './useSimklSync.js';
import { buildTraktAuthorizeUrl, createTraktState, getTmdbCallbackUrl, redirectToExternal, rememberTmdbRequest, TRAKT_POPUP_FAILED_MESSAGE, TRAKT_POPUP_MESSAGE } from '../utils/redirects.js';
import { requestTmdbApproval } from '@plot/core/tmdbAccount.js';

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
  // TMDB comes back only once its import is queued (pages/TmdbCallbackPage.jsx).
  const returned = findImportSource(initialSource)?.lane === 'connect' ? initialSource : null;
  const initial = returned === 'tmdb' ? null : returned;
  const [source, setSource] = useState(returned);
  const [phase, setPhase] = useState(/** @type {ImportStartPhase} */ (returned === 'tmdb' ? 'queued' : initial ? 'connecting' : 'pick'));
  const [error, setError] = useState(null);
  const [pendingFiles, setPendingFiles] = useState(null);
  const [pendingRows, setPendingRows] = useState(null);
  // A file that cannot say what it is (an IMDb list, or a renamed Letterboxd
  // watched/watchlist file). null until the person answers.
  const [listChoiceNeeded, setListChoiceNeeded] = useState(false);
  const [listChoice, setListChoice] = useState(/** @type {import('@plot/core/importJobs.js').ImportListChoice | null} */ (null));

  const jobs = useImportJobs(userId, { history });
  const trakt = useTraktSync(userId);
  const plex = useMediaSync(userId);
  const simkl = useSimklSync(userId);
  const plexSource = usePlexSource(userId, { autoPick: true });

  const connection = source === 'trakt' ? trakt : source === 'plex' ? plex : source === 'simkl' ? simkl : null;
  const loadTrakt = trakt.loadIntegration;
  // Back from Plex's approval tab (?import=plex): also pick the approval up
  // here, in case the tab that started it is paused in the background.
  const loadPlex = initial === 'plex' ? plex.resumePlexAuth : plex.loadIntegration;
  const loadSimkl = simkl.loadIntegration;
  // A connect that did not land. Every way of connecting ends up waiting on
  // something outside this page (a popup, another tab, a poll, a same-tab
  // round trip), and none of them used to say when it gave up, so the dialog
  // waited with no end. Back to the connect step, saying so, with its button
  // to try again. Called from callbacks that finish later, so it reads the
  // dialog as it is then: closed or moved on, and there is nothing to say.
  const live = useRef({ source, phase });
  useEffect(() => { live.current = { source, phase }; });
  const failConnect = useCallback((id) => {
    if (live.current.source !== id || live.current.phase !== 'connecting') return;
    // Counted as import_failed, the same event and reason the import page
    // uses for a connection that did not work (docs/analytics/README.md).
    createImportReporter({ entry }).report('failed', { source: id, reason: IMPORT_FAILURE_REASONS.CONNECTION_FAILED });
    setError(IMPORT_JOBS.onboarding.connectFailed(importSourceName(id)));
    setPhase('connect');
  }, [entry]);

  useEffect(() => {
    if (!userId) return;
    const loads = { trakt: loadTrakt(), plex: loadPlex(), simkl: loadSimkl() };
    // Back from a same-tab round trip (?import=<source>): the dialog opens
    // already waiting, so it needs to hear how that trip ended. Plex still
    // pending is being approved in its own tab; its poll decides (below).
    if (!initial) return;
    Promise.resolve(loads[initial]).then(data => {
      if (data?.status === 'active' || (initial === 'plex' && data?.status === 'pending')) return;
      failConnect(initial);
    }, () => {});
  }, [userId, initial, loadTrakt, loadPlex, loadSimkl, failConnect]);

  // A connection that lands (popup message, Plex poll, or the same-tab
  // return) moves the dialog on to "import".
  const connected = !!connection?.isConnected;
  useEffect(() => {
    if (connected && ['connect', 'connecting'].includes(phase)) setPhase('ready');
  }, [connected, phase]);
  // Plex: the poll stopped. Approved or given up look the same from here
  // until the integration is read again, so read it.
  const plexPolling = plex.polling;
  const wasPlexPolling = useRef(false);
  const reloadPlex = plex.loadIntegration;
  useEffect(() => {
    const stopped = wasPlexPolling.current && !plexPolling;
    wasPlexPolling.current = plexPolling;
    if (!stopped) return;
    Promise.resolve(reloadPlex()).then(data => { if (data?.status !== 'active') failConnect('plex'); }, () => {});
  }, [plexPolling, reloadPlex, failConnect]);
  // Plex needs a server and profile; load the list as soon as it is connected.
  const plexChoose = plexSource.choose;
  const plexListed = !!plexSource.servers;
  useEffect(() => {
    if (source === 'plex' && connected && !plexListed) plexChoose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose is recreated every render; the listed flag is the guard
  }, [source, connected, plexListed]);
  // Trakt's popup closed. It closes itself after connecting and can report a
  // failure, but shut with the window's own X it says nothing. Read the
  // integration again: connected is fine, anything else did not connect.
  const popupWatch = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const watchTraktPopup = useCallback((popup) => {
    if (popupWatch.current) clearInterval(popupWatch.current);
    popupWatch.current = setInterval(() => {
      if (!popup.closed) return;
      clearInterval(popupWatch.current);
      popupWatch.current = null;
      Promise.resolve(loadTrakt()).then(data => { if (data?.status !== 'active') failConnect('trakt'); }, () => {});
    }, 500);
  }, [loadTrakt, failConnect]);
  useEffect(() => () => { if (popupWatch.current) clearInterval(popupWatch.current); }, []);
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === TRAKT_POPUP_MESSAGE) { loadTrakt(); return; }
      // The popup's connect failed.
      if (event.data?.type === TRAKT_POPUP_FAILED_MESSAGE) failConnect('trakt');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadTrakt, failConnect]);

  const connectedIds = [trakt.isConnected && 'trakt', plex.isConnected && 'plex', simkl.isConnected && 'simkl'].filter(Boolean);
  const reporter = useCallback(() => createImportReporter({ entry }), [entry]);
  const busy = ['uploading', 'starting'].includes(phase);

  const pick = useCallback((id) => {
    const src = findImportSource(id);
    if (!src || busy) return;
    if (jobs.jobs.some(job => job.source === id && importJobActive(job))) return;
    reporter().selected(id);
    if (id === 'letterboxd' && userId) void rememberLetterboxdImport(userId);
    setSource(id);
    setError(null);
    setPendingFiles(null);
    setPendingRows(null);
    setListChoiceNeeded(false);
    setListChoice(null);
    if (id === 'tmdb') {
      // Nothing stays connected: every TMDB import signs in again.
      setPhase('connect');
    } else if (src.lane === 'connect') {
      const conn = id === 'trakt' ? trakt : id === 'plex' ? plex : simkl;
      setPhase(conn.isConnected ? 'ready' : 'connect');
    } else {
      setPhase('file');
    }
  }, [busy, jobs.jobs, reporter, trakt, plex, simkl, userId]);

  const close = useCallback(() => {
    if (busy) return;
    setSource(null);
    setPhase('pick');
    setError(null);
    setPendingFiles(null);
    setPendingRows(null);
    setListChoiceNeeded(false);
    setListChoice(null);
  }, [busy]);

  // A file lands on the drop zone (or on a tile): hold it and count its rows.
  const attachFiles = useCallback((fileList, sourceId = source) => {
    const files = Array.from(fileList || []);
    const src = findImportSource(sourceId);
    if (!src || src.lane !== 'upload' || busy) return;
    // An empty list clears the receipt ("Choose a different file").
    setListChoiceNeeded(false);
    setListChoice(null);
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
    // The header row is enough to tell an IMDb list from a ratings export,
    // or a Letterboxd watched/watchlist file from its other exports.
    if (['imdb', 'letterboxd'].includes(sourceId) && files.length === 1) {
      files[0].slice(0, 4096).text()
        .then(head => setListChoiceNeeded(importListChoiceNeeded(sourceId, head, files[0].name)))
        .catch(() => setListChoiceNeeded(false));
    }
  }, [source, busy, reporter]);

  const upload = useCallback(async () => {
    if (!userId || !source || phase !== 'file' || !pendingFiles?.length) return null;
    if (listChoiceNeeded && !listChoice) return null;
    const files = pendingFiles.map(file => ({ name: file.name, body: file, contentType: file.type || undefined }));
    setPhase('uploading');
    setError(null);
    const { job, error: failure } = await startFileImport({ userId, source, entry, files, listChoice: listChoiceNeeded ? listChoice : null });
    if (failure) { setError(failure.message); setPhase('file'); return null; }
    if (source === 'letterboxd') void clearLetterboxdImport(userId);
    reporter().report('started', { source, count: pendingRows || 0, ...(listChoiceNeeded && listChoice ? { list_kind: listChoice } : {}) });
    setPendingFiles(null);
    setPendingRows(null);
    setListChoiceNeeded(false);
    setListChoice(null);
    await jobs.refresh();
    setPhase('queued');
    return job;
  }, [userId, source, phase, pendingFiles, pendingRows, listChoiceNeeded, listChoice, entry, reporter, jobs]);

  const connect = useCallback(() => {
    // A retry after a failed connect: the old message must not sit on the
    // connected step if this one works.
    setError(null);
    if (source === 'plex') {
      setPhase('connecting');
      // Plex sends the approval tab back here, not to Settings: on a phone
      // that tab is where the person ends up, and ?import=plex reopens this
      // dialog on it, connected and ready to import.
      plex.startPlexAuth(returnPath('plex')).then(result => { if (result?.integration?.id) plex.pollPlexAuth(result.integration.id); else setPhase('connect'); });
      return;
    }
    if (source === 'tmdb') {
      // Same tab: TMDB's approval page sends the person back to /auth/tmdb,
      // which reads the account, queues the import and returns here.
      setPhase('connecting');
      requestTmdbApproval(getTmdbCallbackUrl()).then(({ requestToken, approveUrl, binding }) => {
        rememberTmdbRequest(requestToken, binding, returnPath('tmdb'), entry);
        onBeforeRedirect?.();
        redirectToExternal(approveUrl);
      }, () => failConnect('tmdb'));
      return;
    }
    if (source === 'simkl') {
      // Simkl only connects in the same tab; ?import=simkl brings the page
      // back to this dialog.
      onBeforeRedirect?.();
      setPhase('connecting');
      // false: the step before its redirect failed, so the page never left.
      Promise.resolve(simkl.connect(returnPath('simkl'))).then(ok => { if (ok === false) failConnect('simkl'); });
      return;
    }
    const clientId = getConfig().traktClientId;
    if (!clientId) { setError(IMPORT_JOBS.onboarding.uploadFailed); return; }
    // The popup keeps this page alive. A blocked popup falls back to the same
    // tab; ?import=trakt brings the page back to this dialog.
    const url = buildTraktAuthorizeUrl(clientId, createTraktState(returnPath('trakt')));
    const popup = window.open(url, 'plot-trakt', 'popup,width=600,height=760');
    if (popup) { setPhase('connecting'); watchTraktPopup(popup); }
    else { onBeforeRedirect?.(); redirectToExternal(url); }
  }, [source, plex, simkl, returnPath, entry, onBeforeRedirect, failConnect, watchTraktPopup]);

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
    listChoiceNeeded, listChoice, chooseList: setListChoice,
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
