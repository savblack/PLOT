// Home's card for a background import (import_jobs): progress while it runs,
// the counts when it is done, and the way to finish what it left for review.
// The job is read and polled by @plot/core/importJobs.js; this is the render.
// Mobile: apps/mobile/components/ImportJobCard.tsx, on the same core hook.
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useImportJobs, importJobTitle, importJobStatusLine, importJobActive, importJobFinished, importSourceName } from '@plot/core/importJobs.js';
import { IMPORT_ENTRY_POINTS, createImportReporter, IMPORT_FAILURE_REASONS } from '@plot/core/importPipeline.js';
import { IMPORT_JOBS } from '../copy/importJobs.js';
import { useApp } from '../hooks/useApp.js';
import { markImportDone } from '../utils/finishingTouchesState.js';
import { suppressFirstWinForImport } from '../utils/firstWinCardState.js';
import ImportSourceIcon from './ImportSourceIcon.jsx';
import './ImportJobCard.css';

const C = IMPORT_JOBS.card;

export default function ImportJobCard() {
  const { user } = useApp();
  const { jobs, current, queued, cancel, dismiss } = useImportJobs(user?.id);
  // The running job (with what waits behind it), then each finished job the
  // user hasn't seen off. Queued jobs don't get a card of their own.
  const shown = [current, ...jobs.filter(job => importJobFinished(job) && !job.seen_at)].filter(Boolean);
  if (!shown.length) return null;
  return shown.map(job => (
    <JobCard key={job.id} user={user} job={job} queued={job.id === current?.id ? queued : []} cancel={() => cancel(job.id)} dismiss={() => dismiss(job.id)} />
  ));
}

function JobCard({ user, job, queued, cancel, dismiss }) {
  const navigate = useNavigate();
  const active = importJobActive(job);

  // The first time a finished job is seen on this device: tick Finishing
  // touches and stand the first-win card down, as the page import does.
  const noted = useRef(null);
  useEffect(() => {
    if (!user?.id || !job || !importJobFinished(job) || noted.current === job.id) return;
    noted.current = job.id;
    // The same import_completed / import_failed the page import reports.
    const reporter = createImportReporter({ entry: job.entry });
    if (job.status === 'failed') reporter.report('failed', { source: job.source, reason: IMPORT_FAILURE_REASONS.WRITE_FAILED });
    else if (job.status !== 'cancelled') reporter.report('completed', { source: job.source, count: job.imported, failed_count: job.failed });
    if (job.imported > 0) {
      markImportDone(user.id, job.source, job.imported);
      suppressFirstWinForImport(user.id, job.source);
    }
  }, [user?.id, job]);

  const pct = job.progress_total ? Math.min(100, Math.round((job.progress_done / job.progress_total) * 100)) : null;
  const line = [importJobStatusLine(job), queued.length ? C.thenNext(importSourceName(queued[0].source)) : null].filter(Boolean).join(' · ');

  return (
    <section className={`ij-card${active ? '' : ' is-done'}${job.status === 'failed' ? ' is-failed' : ''}`} aria-live="polite" aria-label={importJobTitle(job)}>
      <span className="ij-icon"><ImportSourceIcon id={job.source === 'trakt-export' ? 'trakt' : job.source} name={job.source} size={32} /></span>
      <div className="ij-text">
        <h2 className="ij-title">{importJobTitle(job)}</h2>
        {line && <p className="ij-line">{line}</p>}
        {active && (
          <span className="ij-bar" role="progressbar" aria-label={C.progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
            <span className={`ij-bar-fill${pct == null ? ' is-indeterminate' : ''}`} style={pct == null ? undefined : { width: `${pct}%` }} />
          </span>
        )}
      </div>
      <div className="ij-actions">
        {active && <button type="button" className="ij-link" onClick={cancel}>{C.cancel}</button>}
        {!active && job.status !== 'cancelled' && job.review_count > 0 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/import?job=${job.id}&from=${IMPORT_ENTRY_POINTS.ONBOARDING}`)}>{C.reviewCta}</button>
        )}
        {!active && job.status !== 'cancelled' && job.imported > 0 && job.review_count === 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { dismiss(); navigate('/history'); }}>{C.historyCta}</button>
        )}
        {job.status === 'failed' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { dismiss(); navigate(`/settings?section=connections&source=${job.source}`); }}>{C.retryCta}</button>
        )}
        {!active && <button type="button" className="ij-link" onClick={dismiss}>{C.dismiss}</button>}
      </div>
    </section>
  );
}
