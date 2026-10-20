/**
 * Starting a background import from a picked source: the state behind the
 * source sheet (components/ImportSourceSheet.tsx), shared by onboarding's
 * switching-apps step and Settings › Connections › Add a source. The mobile
 * port of apps/web/src/hooks/useImportStart.js.
 *
 * A file source: pick (document picker) → upload → queued. A connect source:
 * connect (system browser) → ready (server and profile for Plex) → start →
 * queued. The job itself runs server side (packages/core/importJobs.js); this
 * only enqueues it and watches the account's jobs so tiles and the pill can
 * show what is running and what waits.
 */
import { useCallback, useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { createImportReporter } from '@plot/core/importPipeline.js';
import { rememberLetterboxdImport, clearLetterboxdImport } from '../lib/letterboxdImportPrompt';
import { startFileImport, startConnectionImport, useImportJobs, importJobActive, importSourceName, importPillFor } from '@plot/core/importJobs.js';
import { findImportSource } from '@plot/core/onboardingSetup.js';
import { usePlexSource } from '@plot/core/usePlexSource.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { useTraktSync } from './useTraktSync';
import { useMediaSync } from './useMediaSync';
import { useSimklSync } from './useSimklSync';

export type ImportStartPhase = 'pick' | 'file' | 'uploading' | 'connect' | 'connecting' | 'ready' | 'starting' | 'queued';

export interface PendingFile { name: string; uri: string; size: number | null; mimeType?: string }

export interface PlexPickerState {
  servers: { clientIdentifier: string; name: string; owned?: boolean }[];
  profiles: { accountID: string; name: string }[];
  serverId: string | null;
  selected: boolean;
  selection: { name?: string; profileName?: string } | null;
  busy: boolean;
  error: string | null;
  choose: (serverId?: string, accountID?: string) => Promise<void>;
}

// What each export extension means to the document picker. iOS wants UTIs
// as well as MIME types; CSV often arrives as text/plain.
const MIME_BY_EXT: Record<string, string[]> = {
  '.csv': ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', 'text/plain'],
  '.json': ['application/json', 'public.json', 'text/plain'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'public.zip-archive'],
};

/** The picker types for a source's `accept` ('.csv,.zip' → MIME types and UTIs). */
export function pickerTypesFor(accept: string | undefined): string[] {
  const types = new Set<string>();
  for (const ext of String(accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
    for (const type of MIME_BY_EXT[ext] || []) types.add(type);
  }
  return types.size ? [...types] : ['*/*'];
}

// A quick row count for the receipt under the file picker: text exports only,
// and only when they are small enough to read on the main thread.
const ROW_COUNT_MAX_BYTES = 20 * 1024 * 1024;
async function countRows(files: PendingFile[]): Promise<number | null> {
  let total = 0;
  for (const file of files) {
    if (!/\.(csv|json|txt)$/i.test(file.name) || (file.size ?? 0) > ROW_COUNT_MAX_BYTES) return null;
    let text: string;
    try { text = await new FileSystem.File(file.uri).text(); } catch { return null; }
    if (/\.json$/i.test(file.name)) {
      try { const parsed = JSON.parse(text); total += Array.isArray(parsed) ? parsed.length : 0; } catch { return null; }
    } else {
      total += Math.max(0, text.split(/\r?\n/).filter(line => line.trim()).length - 1);
    }
  }
  return total || null;
}

// While the system browser has the sign-in, ask whether it landed.
const CONNECT_POLL_MS = 3000;

interface Args {
  userId: string | null | undefined;
  entry: string;
  history?: boolean;
  /** A job was enqueued (onboarding keeps the last one in its flow context). */
  onStarted?: (source: string, job: { id: string }) => void;
}

export function useImportStart({ userId, entry, history = false, onStarted }: Args) {
  const [source, setSource] = useState<string | null>(null);
  const [phase, setPhase] = useState<ImportStartPhase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [pendingRows, setPendingRows] = useState<number | null>(null);

  const jobs = useImportJobs(userId, { history });
  const trakt = useTraktSync(userId);
  const plex = useMediaSync(userId);
  const simkl = useSimklSync(userId);
  const plexSource = usePlexSource(userId, { autoPick: true });

  const connection = source === 'trakt' ? trakt : source === 'plex' ? plex : source === 'simkl' ? simkl : null;
  const loadTrakt = trakt.loadIntegration;
  const loadSimkl = simkl.loadIntegration;

  // A connection that lands (deep link exchange, Plex poll) moves the sheet
  // on to "import".
  const connected = !!connection?.isConnected;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the phase follows the connection row, an external store
    if (connected && (phase === 'connect' || phase === 'connecting')) setPhase('ready');
  }, [connected, phase]);
  // Plex needs a server and profile; load the list as soon as it is connected.
  // The hook picks the only server and only profile itself.
  const plexChoose = plexSource.choose;
  const plexListed = !!plexSource.servers;
  useEffect(() => {
    if (source === 'plex' && connected && !plexListed) void plexChoose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose is recreated every render; the listed flag is the guard
  }, [source, connected, plexListed]);
  // Trakt and Simkl come back through a deep link the root layout exchanges;
  // the hooks hear that event, and this poll is the backstop.
  useEffect(() => {
    if (phase !== 'connecting' || (source !== 'trakt' && source !== 'simkl')) return undefined;
    const load = source === 'trakt' ? loadTrakt : loadSimkl;
    const id = setInterval(() => { void load(); }, CONNECT_POLL_MS);
    return () => clearInterval(id);
  }, [phase, source, loadTrakt, loadSimkl]);

  const connectedIds = [trakt.isConnected && 'trakt', plex.isConnected && 'plex', simkl.isConnected && 'simkl'].filter(Boolean) as string[];
  const reporter = useCallback(() => createImportReporter({ entry }), [entry]);
  const busy = phase === 'uploading' || phase === 'starting';

  const pick = useCallback((id: string) => {
    const src = findImportSource(id);
    if (!src || busy) return;
    if (jobs.jobs.some((job: { source: string; status?: string }) => job.source === id && importJobActive(job))) return;
    reporter().selected(id);
    if (id === 'letterboxd' && userId) void rememberLetterboxdImport(userId);
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
  }, [busy, jobs.jobs, reporter, trakt, plex, simkl, userId]);

  const close = useCallback(() => {
    if (busy) return;
    setSource(null);
    setPhase('pick');
    setError(null);
    setPendingFiles(null);
    setPendingRows(null);
  }, [busy]);

  // Open the document picker; a pick is held as the receipt and its rows counted.
  const chooseFile = useCallback(async () => {
    const src = findImportSource(source);
    if (!src || src.lane !== 'upload' || phase !== 'file') return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: pickerTypesFor(src.accept), copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      const files: PendingFile[] = result.assets.map(asset => ({ name: asset.name, uri: asset.uri, size: asset.size ?? null, mimeType: asset.mimeType || undefined }));
      setError(null);
      setPendingFiles(files);
      setPendingRows(null);
      countRows(files).then(count => setPendingRows(count));
    } catch (e) {
      setError(e instanceof Error ? e.message : IMPORT_JOBS.onboarding.uploadFailed);
    }
  }, [source, phase]);

  const clearFile = useCallback(() => {
    if (phase !== 'file') return;
    setPendingFiles(null);
    setPendingRows(null);
  }, [phase]);

  const upload = useCallback(async () => {
    if (!userId || !source || phase !== 'file' || !pendingFiles?.length) return null;
    setPhase('uploading');
    setError(null);
    try {
      const files = [];
      for (const file of pendingFiles) {
        files.push({ name: file.name, body: new Uint8Array(await new FileSystem.File(file.uri).arrayBuffer()), contentType: file.mimeType });
      }
      const { job, error: failure } = await startFileImport({ userId, source, entry, files });
      if (failure || !job) { setError(failure?.message ?? IMPORT_JOBS.onboarding.uploadFailed); setPhase('file'); return null; }
      if (source === 'letterboxd') void clearLetterboxdImport(userId);
      reporter().report('started', { source, count: pendingRows || 0 });
      onStarted?.(source, { id: job.id });
      setPendingFiles(null);
      setPendingRows(null);
      setPhase('queued');
      void jobs.refresh();
      return job;
    } catch (e) {
      setError(e instanceof Error ? e.message : IMPORT_JOBS.onboarding.uploadFailed);
      setPhase('file');
      return null;
    }
  }, [userId, source, phase, pendingFiles, pendingRows, entry, reporter, jobs, onStarted]);

  const connect = useCallback(async () => {
    if (!source) return;
    setError(null);
    setPhase('connecting');
    if (source === 'plex') {
      // startPlexAuth opens the approval page and polls the row itself.
      const result = await plex.startPlexAuth();
      if (!result?.integration?.id) setPhase('connect');
      return;
    }
    if (source === 'simkl') { await simkl.connect(); return; }
    await trakt.connect();
  }, [source, plex, simkl, trakt]);

  const startJob = useCallback(async () => {
    if (!source || phase !== 'ready') return;
    setPhase('starting');
    setError(null);
    const { job, error: failure } = await startConnectionImport({ source, entry });
    if (failure || !job) { setError(failure?.message ?? IMPORT_JOBS.onboarding.uploadFailed); setPhase('ready'); return; }
    reporter().report('started', { source, count: 0 });
    onStarted?.(source, { id: job.id });
    setPhase('queued');
    void jobs.refresh();
  }, [source, phase, entry, reporter, jobs, onStarted]);

  // "Add another source": back to the tiles with this one marked.
  const addAnother = useCallback(() => {
    setSource(null);
    setPhase('pick');
    setError(null);
  }, []);

  const queuedBehind = phase === 'queued' && jobs.current && jobs.current.source !== source ? importSourceName(jobs.current.source) : null;

  const plexState: PlexPickerState | null = source === 'plex' && connected ? {
    servers: plexSource.servers || [], profiles: plexSource.profiles || [], serverId: plexSource.serverId || null,
    selected: !!plexSource.selected, selection: plexSource.selection || null, busy: plexSource.busy, error: plexSource.error || null, choose: plexSource.choose,
  } : null;

  return {
    source, phase, busy, error: error || connection?.error || null,
    connectedAs: connected ? (connection?.integration?.display_name || null) : null,
    queuedBehind, pendingFiles, pendingRows,
    jobs: jobs.jobs, current: jobs.current, queued: jobs.queued, refreshJobs: jobs.refresh, cancelJob: jobs.cancel, dismissJob: jobs.dismiss,
    connectedIds,
    pill: importPillFor(jobs.current, jobs.queued),
    plex: plexState,
    pick, close, chooseFile, clearFile, upload, connect, startJob, addAnother,
    // The connections themselves, for surfaces that also disconnect.
    accounts: { trakt, plex, simkl, plexSource },
  };
}

export type ImportStart = ReturnType<typeof useImportStart>;
