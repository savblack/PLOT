/**
 * import-worker — runs background watch-history imports (public.import_jobs).
 *
 * The apps upload an export to the private import-uploads bucket and enqueue a
 * job (packages/core/importJobs.js). This function claims the job under a
 * lease and works through it in slices that fit an edge function's wall
 * clock, checkpointing after each one:
 *
 *   parse   read the upload with core's readImportSelection → _entries.json
 *   resolve match SLICE titles at a time against TMDB     → _resolved.json
 *   write   plan + write what needs no decision; keep the rest → _review.json
 *
 * The parse / match / plan / write code is the apps' own import pipeline,
 * bundled by scripts/build-import-engine.mjs so a background import finishes
 * exactly as a foreground one would. Core's supabase client is injected as
 * this function's service-role client, so the writers' duplicate protection
 * (never overwrite a rating, review or note) applies unchanged.
 *
 * A connection job (Trakt, Plex, Simkl) delegates to that provider's sync
 * function, acting for the user (_shared/workerActingUser.ts).
 *
 * Callers:
 *  - pg_cron every minute via run_import_worker_tick (service bearer): claims
 *    any due job.
 *  - the app, right after enqueueing and while Home watches the job (user
 *    JWT): claims only that user's job, so a nudge cannot run someone else's.
 *
 * Private: verify_jwt = false in config.toml; both paths verify in code.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceKeyBearer } from '../_shared/serviceBearer.ts';
// @ts-ignore: generated JavaScript bundle (scripts/build-import-engine.mjs)
import * as engineModule from '../_shared/importEngine.generated.js';

// The bundle keeps core's JSDoc, which Deno reads as types looser than the
// code (an `[]` default infers never[]). Core's own suite covers the engine;
// here it is called as the apps call it.
// deno-lint-ignore no-explicit-any
const engine: any = engineModule;

type Db = SupabaseClient<Database>;
type Job = Database['public']['Tables']['import_jobs']['Row'];

const BUCKET = 'import-uploads';
/** Titles matched per slice before the row is checkpointed. */
const SLICE = 100;
/** Stop starting new slices after this long; the next tick carries on. */
const BUDGET_MS = 45_000;
/** Only this much of the job's leftovers is kept for review. */
const REVIEW_CAP = 2000;
const TMDB = 'https://api.themoviedb.org/3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// User-facing failure messages. Kept in step with packages/core/copy/importJobs.js
// (errors): the card shows last_error verbatim.
const ERRORS = {
  noEntries: 'No watch history was found in this file. Check you exported from the right source.',
  unreadable: 'We couldn’t read this file. Make sure it’s the unmodified export.',
  connectionMissing: (source: string) => `${source} isn’t connected any more. Reconnect it in Settings and try again.`,
  plexSelection: 'Pick a Plex server and profile in Settings, then try again.',
  historyRead: 'We couldn’t check what’s already in your history, so the import stopped. Nothing was changed.',
  gaveUp: 'The import kept failing. Nothing already in Plot was changed. Try the file again from the import page.',
};
const SOURCE_NAMES: Record<string, string> = { trakt: 'Trakt', plex: 'Plex', simkl: 'Simkl' };

class TerminalError extends Error {}

// ── TMDB, server side ────────────────────────────────────────────────────────
// The apps go through the Worker → tmdb-proxy; here the key is in the env.

async function tmdbGet(path: string, params: Record<string, string> = {}) {
  const key = Deno.env.get('TMDB_API_KEY');
  if (!key) throw new Error('TMDB_API_KEY not configured');
  const url = new URL(`${TMDB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', key);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('Retry-After')) || 1;
      await new Promise(r => setTimeout(r, Math.min(wait, 5) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
  }
}

const tmdbDeps = {
  search: (title: string) => tmdbGet('/search/multi', { query: title }),
  findByImdbId: (id: string) => tmdbGet(`/find/${encodeURIComponent(id)}`, { external_source: 'imdb_id' }),
  findByTvdbId: (id: string | number) => tmdbGet(`/find/${encodeURIComponent(String(id))}`, { external_source: 'tvdb_id' }),
  findExternal: (id: string) => tmdbGet(`/find/${encodeURIComponent(id)}`, { external_source: 'imdb_id' }),
  getSeason: (id: number, season: number) => tmdbGet(`/tv/${id}/season/${season}`),
};

// ── Storage artifacts ────────────────────────────────────────────────────────

const folder = (job: Job) => `${job.user_id}/${job.id}`;

async function readArtifact<T>(admin: Db, job: Job, name: string): Promise<T | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(`${folder(job)}/${name}`);
  if (error || !data) return null;
  return JSON.parse(await data.text()) as T;
}

async function writeArtifact(admin: Db, job: Job, name: string, value: unknown) {
  const { error } = await admin.storage.from(BUCKET)
    .upload(`${folder(job)}/${name}`, new Blob([JSON.stringify(value)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (error) throw new Error(`Could not save ${name}: ${error.message}`);
}

async function removeArtifacts(admin: Db, job: Job, names: string[]) {
  if (!names.length) return;
  await admin.storage.from(BUCKET).remove(names.map(n => (n.includes('/') ? n : `${folder(job)}/${n}`))).catch(() => {});
}

// ── Job RPCs ─────────────────────────────────────────────────────────────────

async function rpc<T>(admin: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  // deno-lint-ignore no-explicit-any
  const { data, error } = await (admin as any).rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

function progress(admin: Db, job: Job, patch: Record<string, unknown>): Promise<Job> {
  return rpc<Job>(admin, 'progress_import_job', { p_job: job.id, p_lease: job.lease_token, p_patch: patch });
}

function finish(admin: Db, job: Job, patch: Record<string, unknown>, done: boolean): Promise<Job> {
  return rpc<Job>(admin, 'finish_import_slice', { p_job: job.id, p_lease: job.lease_token, p_patch: patch, p_done: done });
}

// ── File jobs ────────────────────────────────────────────────────────────────

/** The parser id for a job's source. The Trakt export is the 'trakt' parser. */
const parserFor = (source: string) => (source === 'trakt-export' ? 'trakt' : source);

async function downloadUploads(admin: Db, job: Job) {
  const files = [];
  for (const path of job.files) {
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data) throw new TerminalError(ERRORS.unreadable);
    const name = path.split('/').pop() || 'export';
    files.push({ name, size: data.size, text: () => data.text(), arrayBuffer: () => data.arrayBuffer() });
  }
  return files;
}

async function runFileJob(admin: Db, job: Job, startedAt: number) {
  const outOfTime = () => Date.now() - startedAt > BUDGET_MS;
  // deno-lint-ignore no-explicit-any
  let checkpoint: any = job.checkpoint || {};

  if (job.phase === 'parse') {
    const files = await downloadUploads(admin, job);
    // deno-lint-ignore no-explicit-any
    let document: any;
    try {
      document = await engine.readImportSelection(parserFor(job.source), files);
    } catch (error) {
      throw new TerminalError(error instanceof Error && error.message ? error.message : ERRORS.unreadable);
    }
    const report: string[] = engine.importReportMessages(document);
    if (!document.entries.length) throw new TerminalError(report.length ? `${ERRORS.noEntries} ${report.join(' ')}` : ERRORS.noEntries);
    await writeArtifact(admin, job, '_entries.json', document.entries);
    checkpoint = { offset: 0, report };
    job = await progress(admin, job, { phase: 'resolve', progress_total: document.entries.length, progress_done: 0, checkpoint });
    if (job.status === 'cancelled') return cleanup(admin, job, true);
  }

  if (job.phase === 'resolve') {
    // deno-lint-ignore no-explicit-any
    const entries = await readArtifact<any[]>(admin, job, '_entries.json');
    if (!entries) throw new TerminalError(ERRORS.unreadable);
    // deno-lint-ignore no-explicit-any
    const resolved: any[] = (checkpoint.offset > 0 && await readArtifact<any[]>(admin, job, '_resolved.json')) || [];
    let offset: number = Math.min(resolved.length, Number(checkpoint.offset) || 0);
    resolved.length = offset;
    while (offset < entries.length) {
      if (outOfTime()) return finish(admin, job, { checkpoint: { ...checkpoint, offset }, progress_done: offset }, false);
      const slice = entries.slice(offset, offset + SLICE);
      resolved.push(...await engine.resolveImportEntries(slice, tmdbDeps));
      offset += slice.length;
      await writeArtifact(admin, job, '_resolved.json', resolved);
      checkpoint = { ...checkpoint, offset };
      job = await progress(admin, job, { progress_done: offset, checkpoint });
      if (job.status === 'cancelled') return cleanup(admin, job, true);
    }
    job = await progress(admin, job, { phase: 'write', progress_done: entries.length, checkpoint });
    if (job.status === 'cancelled') return cleanup(admin, job, true);
    // The write reads history and plans; give it a fresh tick if this one is spent.
    if (outOfTime()) return finish(admin, job, { phase: 'write' }, false);
  }

  if (job.phase === 'write') {
    // deno-lint-ignore no-explicit-any
    const resolved = await readArtifact<any[]>(admin, job, '_resolved.json');
    if (!resolved) throw new TerminalError(ERRORS.unreadable);
    const review = await engine.reviewImportDuplicates({ userId: job.user_id, resolved });
    if (review.error) throw new Error(ERRORS.historyRead);
    const { rows: existing, error: existingError } = await engine.readExistingHistory({
      userId: job.user_id,
      // deno-lint-ignore no-explicit-any
      tmdbIds: review.resolved.flatMap((r: any) => (r.candidates || []).map((c: any) => c.id)),
    });
    if (existingError) throw new Error(ERRORS.historyRead);
    const split = engine.splitImportForBackground(engine.reviewPendingWatchSummaries(review.resolved));
    let outcome = { inserted: 0, failed: 0, duplicates: 0 };
    if (split.ready.length) {
      // deno-lint-ignore no-explicit-any
      const rows: any[] = engine.buildImportRows({ userId: job.user_id, resolved: split.ready }).map((c: any) => c.row);
      // deno-lint-ignore no-explicit-any
      const known: any[] = split.ready[0]?.destination ? [] : existing;
      const plan = engine.planHistoryImport({ rows, existing: known });
      outcome = await engine.writeImportDocument({ userId: job.user_id, resolved: split.ready, summaryRows: plan.rows });
    }
    const kept = split.review.slice(0, REVIEW_CAP);
    if (kept.length) await writeArtifact(admin, job, '_review.json', kept);
    await removeArtifacts(admin, job, [...job.files, '_entries.json', '_resolved.json']);
    return finish(admin, job, {
      imported: outcome.inserted, duplicates: outcome.duplicates, failed: outcome.failed, review_count: kept.length,
      checkpoint: { report: checkpoint.report || [], leftOut: split.leftOut.length, reviewDropped: split.review.length - kept.length },
      last_error: null,
    }, true);
  }

  return job;
}

/** A cancelled job leaves nothing in the bucket. */
async function cleanup(admin: Db, job: Job, _cancelled: boolean) {
  await removeArtifacts(admin, job, [...job.files, '_entries.json', '_resolved.json', '_review.json']);
  return job;
}

// ── Connection jobs ──────────────────────────────────────────────────────────

async function runConnectionJob(admin: Db, job: Job) {
  const fn = { trakt: 'trakt-sync', plex: 'media-sync', simkl: 'simkl-sync' }[job.source];
  const action = job.source === 'simkl' ? 'sync' : 'import-history';
  if (!fn) throw new TerminalError('Unsupported connection source');
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  const res = await fetch(`${base}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey()}` },
    body: JSON.stringify({ action, user_id: job.user_id }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status === 404) throw new TerminalError(ERRORS.connectionMissing(SOURCE_NAMES[job.source] || job.source));
  if (res.status === 409) throw new TerminalError(ERRORS.plexSelection);
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `${fn} failed (${res.status})`);
  return finish(admin, job, {
    imported: Number(body.importedCount) || 0, duplicates: Number(body.alreadyCount) || 0, failed: 0, review_count: 0,
    progress_total: Number(body.sourceCount) || 0, progress_done: Number(body.sourceCount) || 0, last_error: null,
  }, true);
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function callerScope(req: Request): Promise<{ user: string | null } | Response> {
  if (hasServiceKeyBearer(req)) return { user: null };
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const asUser = createClient<Database>(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await asUser.auth.getUser();
  if (error || !user) return json({ error: 'Unauthorized' }, 401);
  return { user: user.id };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const scope = await callerScope(req);
  if (scope instanceof Response) return scope;

  const admin = createClient<Database>(Deno.env.get('SUPABASE_URL') ?? '', serviceKey());
  // The bundled pipeline reads these exactly as the apps do (main.jsx / configureCore.ts).
  engine.configure({
    supabaseClient: admin,
    importEventsEnabled: Deno.env.get('IMPORT_EVENTS_ENABLED') === 'true',
    importAnnotationsEnabled: Deno.env.get('IMPORT_ANNOTATIONS_ENABLED') === 'true',
    tvTimeImportEnabled: Deno.env.get('TVTIME_IMPORT_ENABLED') === 'true',
  });

  let job: Job | null;
  try {
    job = await rpc<Job | null>(admin, 'claim_import_job', { p_user: scope.user });
  } catch (error) {
    console.error('[import-worker] claim', error);
    return json({ error: 'Import storage is unavailable.' }, 503);
  }
  if (!job) return json({ idle: true });

  const startedAt = Date.now();
  try {
    const result = job.kind === 'connection' ? await runConnectionJob(admin, job) : await runFileJob(admin, job, startedAt);
    return json({ jobId: job.id, status: result.status, phase: result.phase, progress: result.progress_done });
  } catch (error) {
    const terminal = error instanceof TerminalError;
    const message = error instanceof Error ? error.message : 'Import failed.';
    console.error('[import-worker]', job.id, message);
    try {
      await rpc(admin, 'fail_import_job', {
        p_job: job.id, p_lease: job.lease_token, p_error: terminal ? message : ERRORS.gaveUp,
        p_retry_seconds: Math.min(900, 30 * 2 ** job.attempts), p_terminal: terminal,
      });
      // A job that will not run again leaves nothing behind.
      if (terminal || job.attempts >= 5) await cleanup(admin, job, false);
    } catch (failError) {
      console.error('[import-worker] fail', failError);
    }
    return json({ jobId: job.id, failed: true, terminal });
  }
});
