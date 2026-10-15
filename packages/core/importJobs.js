/* Background watch-history imports: the client side of import_jobs.
 *
 * Onboarding (and later the import page) uploads the export to the private
 * import-uploads bucket and enqueues a row; the import-worker edge function
 * does the parse / match / write in slices and checkpoints the row. The apps
 * only watch the row. Shared by web and mobile; rendering stays per app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { callAuthenticatedFunction } from './functions.js';
import { emit, HISTORY_CHANGED_EVENT } from './events.js';
export { splitImportForBackground } from './importBackground.js';
import { IMPORT_JOBS } from './copy/importJobs.js';
import { IMPORT_ENTRY_POINTS } from './importPipeline.js';

export const IMPORT_UPLOADS_BUCKET = 'import-uploads';
export const IMPORT_JOB_ACTIVE = Object.freeze(['queued', 'running', 'retry_wait']);
export const IMPORT_JOB_FINISHED = Object.freeze(['succeeded', 'partial', 'failed', 'cancelled']);
/** Home polls an active job this often. Each poll also nudges the worker. */
const POLL_MS = 4000;

/** Sources that connect an account rather than upload a file. */
export const CONNECTION_SOURCES = Object.freeze(['trakt', 'plex', 'simkl']);

/** Display names for the sources a job can carry. */
export const IMPORT_SOURCE_NAMES = Object.freeze({
  letterboxd: 'Letterboxd', netflix: 'Netflix', prime: 'Amazon Prime', disney: 'Disney+', max: 'Max', apple: 'Apple TV+',
  imdb: 'IMDb', 'trakt-export': 'Trakt', tvtime: 'TV Time', trakt: 'Trakt', plex: 'Plex', simkl: 'Simkl',
});

/** @param {string} source */
export const importSourceName = (source) => IMPORT_SOURCE_NAMES[source] || source;

/** @param {{ status?: string } | null | undefined} job */
export const importJobActive = (job) => !!job && IMPORT_JOB_ACTIVE.includes(job.status);
/** @param {{ status?: string } | null | undefined} job */
export const importJobFinished = (job) => !!job && IMPORT_JOB_FINISHED.includes(job.status);

/**
 * The one line Home's card shows under the title.
 * @param {any} job
 */
export function importJobStatusLine(job) {
  const C = IMPORT_JOBS.card;
  const name = importSourceName(job.source);
  switch (job.status) {
    case 'queued': return job.phase === 'parse' && !job.progress_total ? C.queued : C.matching(job.progress_done, job.progress_total);
    case 'retry_wait': return C.retrying;
    case 'running':
      if (job.kind === 'connection') return C.connecting(name);
      if (job.phase === 'parse') return C.parsing;
      if (job.phase === 'write') return C.writing;
      return C.matching(job.progress_done, job.progress_total);
    case 'succeeded':
    case 'partial': {
      const parts = [C.summary(job.imported, job.duplicates)];
      if (job.review_count) parts.push(C.review(job.review_count));
      if (job.failed) parts.push(C.failedRows(job.failed));
      return parts.join(' ');
    }
    case 'failed': return job.last_error || IMPORT_JOBS.errors.gaveUp;
    case 'cancelled': return '';
    default: return '';
  }
}

/**
 * The one-line progress pill shown through the rest of onboarding (and the
 * line the Home card's queue mention is built from).
 * @param {any} job the job the worker is on
 * @param {any[]} [queued] what waits behind it
 * @returns {{ source: string, name: string, title: string, line: string, pct: number | null } | null}
 */
export function importPillFor(job, queued = []) {
  if (!job || !importJobActive(job)) return null;
  const name = importSourceName(job.source);
  const pct = job.progress_total ? Math.min(100, Math.round((job.progress_done / job.progress_total) * 100)) : null;
  const line = [importJobStatusLine(job), queued.length ? IMPORT_JOBS.card.thenNext(importSourceName(queued[0].source)) : null].filter(Boolean).join(' · ');
  return { source: job.source, name, title: IMPORT_JOBS.card.title(name), line, pct };
}

/** @param {any} job */
export function importJobTitle(job) {
  const C = IMPORT_JOBS.card;
  const name = importSourceName(job.source);
  if (job.status === 'failed') return C.failedTitle(name);
  if (job.status === 'cancelled') return C.cancelledTitle(name);
  if (importJobFinished(job)) return C.doneTitle(name);
  return C.title(name);
}

function randomId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Only an upload folder name; not a secret.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Storage object names keep the original file name: the parsers read it. */
function safeFileName(name) {
  const base = String(name || 'export').split(/[\\/]/).pop() || 'export';
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').replace(/^_+/, '');
  return (cleaned || 'export').slice(0, 120);
}

async function kickWorker(jobId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await callAuthenticatedFunction('import-worker', session, { job: jobId });
  } catch { /* the scheduler picks it up within a minute */ }
}

function enqueueError(error) {
  if (!error) return null;
  const message = String(error.message || '');
  if (message.includes('import_in_progress')) return new Error(IMPORT_JOBS.onboarding.alreadyRunning);
  if (message.includes('import_queue_full')) return new Error(IMPORT_JOBS.onboarding.queueFull);
  return error instanceof Error ? error : new Error(String(error.message || error));
}

/**
 * Upload an export and queue its import. Resolves once the row exists; the
 * worker takes it from there.
 *
 * @param {{ userId: string, source: string, entry?: string,
 *   files: { name: string, body: Blob | ArrayBuffer | Uint8Array, contentType?: string }[] }} args
 * @returns {Promise<{ job: any, error: Error | null }>}
 */
export async function startFileImport({ userId, source, entry = IMPORT_ENTRY_POINTS.IMPORT_PAGE, files }) {
  if (!userId || !source || !files?.length) return { job: null, error: new Error(IMPORT_JOBS.onboarding.uploadFailed) };
  const jobId = randomId();
  const paths = [];
  const seen = new Set();
  for (const file of files) {
    let name = safeFileName(file.name);
    // Two picks with one name: keep both, the parsers key on the original.
    if (seen.has(name)) name = `${paths.length}-${name}`;
    seen.add(name);
    const path = `${userId}/${jobId}/${name}`;
    const { error } = await supabase.storage.from(IMPORT_UPLOADS_BUCKET)
      .upload(path, file.body, { contentType: file.contentType || 'application/octet-stream', upsert: false });
    if (error) {
      // Leave nothing behind for a job that never got queued.
      if (paths.length) await supabase.storage.from(IMPORT_UPLOADS_BUCKET).remove(paths).catch(() => {});
      return { job: null, error: new Error(IMPORT_JOBS.onboarding.uploadFailed) };
    }
    paths.push(path);
  }
  const { data, error } = await supabase.rpc('enqueue_file_import_job', { p_job: jobId, p_source: source, p_files: paths, p_entry: entry });
  if (error) {
    await supabase.storage.from(IMPORT_UPLOADS_BUCKET).remove(paths).catch(() => {});
    return { job: null, error: enqueueError(error) };
  }
  void kickWorker(jobId);
  return { job: data, error: null };
}

/**
 * Queue an account import for a connected source (Trakt, Plex, Simkl).
 * @param {{ source: string, entry?: string }} args
 * @returns {Promise<{ job: any, error: Error | null }>}
 */
export async function startConnectionImport({ source, entry = IMPORT_ENTRY_POINTS.IMPORT_PAGE }) {
  const { data, error } = await supabase.rpc('enqueue_connection_import_job', { p_source: source, p_entry: entry });
  if (error) return { job: null, error: enqueueError(error) };
  void kickWorker(data?.id);
  return { job: data, error: null };
}

/** @param {string} jobId */
export async function cancelImportJob(jobId) {
  const { error } = await supabase.rpc('cancel_import_job', { p_job: jobId });
  return !error;
}

/** @param {string} jobId */
export async function dismissImportJob(jobId) {
  const { error } = await supabase.rpc('dismiss_import_job', { p_job: jobId });
  return !error;
}

/**
 * The user finished (or gave up on) a job's review: the leftovers file has
 * served its purpose, so it goes, and the card stops offering "Finish
 * matching". Files nobody comes back for are swept by the worker after 30 days.
 * @param {{ id: string, user_id: string }} job
 */
export async function finishImportJobReview(job) {
  if (!job?.id || !job.user_id) return false;
  await supabase.storage.from(IMPORT_UPLOADS_BUCKET).remove([`${job.user_id}/${job.id}/_review.json`]).catch(() => {});
  const { error } = await supabase.rpc('finish_import_job_review', { p_job: job.id });
  return !error;
}

/**
 * The newest import for this account, finished or not.
 * @param {string} userId
 */
export async function readLatestImportJob(userId) {
  if (!userId) return { job: null, error: null };
  const { data, error } = await supabase.from('import_jobs')
    .select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return { job: data || null, error };
}

/**
 * The account's imports that still matter: every active job (running or
 * queued, oldest first, which is the order the worker takes them) and any
 * finished job the user hasn't dismissed.
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 */
export async function readImportJobs(userId, { limit = 20, history = false } = {}) {
  if (!userId) return { jobs: [], error: null };
  const query = supabase.from('import_jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (history) query.gte('created_at', new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString());
  const { data, error } = await query;
  const rows = data || [];
  const active = rows.filter(importJobActive).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  // With history, dismissed jobs stay (Settings lists them); without, only
  // the ones the user hasn't seen off (Home's card).
  const finished = rows.filter(row => importJobFinished(row) && (history || !row.seen_at));
  return { jobs: [...active, ...finished], error };
}
/** How far back Settings lists finished imports. */
export const HISTORY_DAYS = 90;

/**
 * A source tile's state from the account's jobs: held while its job is still
 * to run ('importing' or 'queued'), free again (null) once it finishes.
 * @param {any[]} jobs
 * @param {any} current the job the worker is on
 * @param {string} id
 */
export function importTileState(jobs, current, id) {
  const job = (jobs || []).find(j => j.source === id && importJobActive(j));
  if (!job) return null;
  return job.id === current?.id ? 'importing' : 'queued';
}

/** The job the worker is on (or about to start), and what waits behind it. */
export function splitImportQueue(jobs) {
  const active = (jobs || []).filter(importJobActive);
  return { current: active[0] || null, queued: active.slice(1) };
}

/** @param {string} jobId */
export async function readImportJob(jobId) {
  const { data, error } = await supabase.from('import_jobs').select('*').eq('id', jobId).maybeSingle();
  return { job: data || null, error };
}

/**
 * The entries a finished job left for the user: unmatched titles with
 * candidates, and possible duplicates. Written by the worker as _review.json
 * beside the upload. Empty when there was nothing to review.
 * @param {{ id: string, user_id: string }} job
 * @returns {Promise<any[]>}
 */
export async function readImportJobReview(job) {
  if (!job?.id || !job.user_id) return [];
  const { data, error } = await supabase.storage.from(IMPORT_UPLOADS_BUCKET).download(`${job.user_id}/${job.id}/_review.json`);
  if (error || !data) return [];
  try {
    const parsed = JSON.parse(await data.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * Follow every import that still matters for this account (see
 * readImportJobs): poll while any runs and nudge the worker along.
 *
 * @param {string | null | undefined} userId
 * @returns {{ jobs: any[], current: any, queued: any[], loading: boolean, active: boolean, refresh: () => Promise<void>, cancel: (jobId: string) => Promise<void>, dismiss: (jobId: string) => Promise<void> }}
 */
export function useImportJobs(userId, { history = false } = {}) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(!!userId);
  const scope = useRef(userId);
  const hadActive = useRef(false);
  useEffect(() => { scope.current = userId; return () => { scope.current = null; }; }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) { setJobs([]); setLoading(false); return; }
    const { jobs: next } = await readImportJobs(userId, { history, limit: history ? 60 : 20 });
    if (scope.current !== userId) return;
    setJobs(next);
    setLoading(false);
    const anyActive = next.some(importJobActive);
    if (hadActive.current && !anyActive && next.some(job => importJobFinished(job) && job.imported > 0)) emit(HISTORY_CHANGED_EVENT);
    hadActive.current = anyActive;
  }, [userId, history]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read lands when the account is known
  useEffect(() => { refresh(); }, [refresh]);

  const { current, queued } = splitImportQueue(jobs);
  const active = !!current;
  const currentId = current?.id || null;
  const currentStatus = current?.status || null;
  useEffect(() => {
    if (!currentId) return undefined;
    const id = setInterval(() => {
      refresh();
      if (currentStatus !== 'running') void kickWorker(currentId);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [currentId, currentStatus, refresh]);

  const cancel = useCallback(async (jobId) => { if (jobId) { await cancelImportJob(jobId); await refresh(); } }, [refresh]);
  const dismiss = useCallback(async (jobId) => {
    if (!jobId) return;
    await dismissImportJob(jobId);
    setJobs(list => (history
      ? list.map(job => (job.id === jobId ? { ...job, seen_at: new Date().toISOString() } : job))
      : list.filter(job => job.id !== jobId)));
  }, [history]);

  return { jobs, current, queued, loading, active, refresh, cancel, dismiss };
}

/**
 * Follow the account's newest import: poll while it runs, nudge the worker so
 * progress moves while the user watches, and signal the history change once
 * it finishes with rows written.
 *
 * @param {string | null | undefined} userId
 * @returns {{ job: any, loading: boolean, active: boolean, refresh: () => Promise<void>, cancel: () => Promise<void>, dismiss: () => Promise<void> }}
 */
export function useImportJob(userId) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(!!userId);
  const scope = useRef(userId);
  const lastSeen = useRef(null);
  useEffect(() => { scope.current = userId; return () => { scope.current = null; }; }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) { setJob(null); setLoading(false); return; }
    const { job: next } = await readLatestImportJob(userId);
    if (scope.current !== userId) return;
    setJob(next);
    setLoading(false);
    if (next && importJobFinished(next) && lastSeen.current && importJobActive(lastSeen.current) && next.imported > 0) {
      emit(HISTORY_CHANGED_EVENT);
    }
    lastSeen.current = next;
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read lands when the account is known
  useEffect(() => { refresh(); }, [refresh]);

  const active = importJobActive(job);
  const status = job?.status || null;
  const activeId = active ? job.id : null;
  useEffect(() => {
    if (!activeId) return undefined;
    const id = setInterval(() => {
      refresh();
      if (status !== 'running') void kickWorker(activeId);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [activeId, status, refresh]);

  const jobId = job?.id || null;
  const cancel = useCallback(async () => { if (jobId) { await cancelImportJob(jobId); await refresh(); } }, [jobId, refresh]);
  const dismiss = useCallback(async () => {
    if (!jobId) return;
    await dismissImportJob(jobId);
    setJob(current => (current?.id === jobId ? { ...current, seen_at: new Date().toISOString() } : current));
  }, [jobId]);

  return { job, loading, active, refresh, cancel, dismiss };
}
