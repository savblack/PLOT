// Settings › Connections › Your sources: one row per source the account has
// brought history in from, whether a connected account (Trakt, Plex, Simkl)
// or a file uploaded once (Letterboxd, Netflix, …). Each row carries its own
// status and opens a detail with its history, the automatic toggle (accounts),
// a way to import again, and remove. "Add a source" opens the same picker as
// onboarding (ImportSourceLanes + ImportSourceDialog on useImportStart).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrackingJobs } from '@plot/core/useTrackingJobs.js';
import { IMPORT_SOURCES, findImportSource } from '@plot/core/onboardingSetup.js';
import { importJobActive, importJobFinished, importJobStatusLine, importSourceName, importPillFor } from '@plot/core/importJobs.js';
import { IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import { TRACKING } from '@plot/core/copy/tracking.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { IMPORT_JOBS } from '../copy/importJobs.js';
import { useImportStart } from '../hooks/useImportStart.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import ImportSourceIcon from './ImportSourceIcon.jsx';
import ImportSourceLanes from './ImportSourceLanes.jsx';
import ImportSourceDialog, { PlexPicker } from './ImportSourceDialog.jsx';
import { SettingsSwitch } from './SettingsPage.jsx';
import './ImportJobCard.css';
import './SettingsSources.css';

const T = SETTINGS_VIEW.sources;
const C = IMPORT_JOBS.card;

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

function Chip({ kind, children }) {
  const icon = kind === 'run' ? '' : kind === 'ok' ? '✓' : kind === 'warn' ? '!' : kind === 'bad' ? '✕' : '';
  return <span className={`ss-chip ss-chip--${kind}`}><i aria-hidden="true">{icon}</i>{children}</span>;
}

/**
 * The status chip and the words after it, from the same parts every time:
 * state, what it's doing or last did, when and how many.
 */
function statusFor({ src, integration, jobs, current, connection, trackingEnabled = false }) {
  const active = jobs.find(importJobActive);
  const finished = jobs.filter(importJobFinished);
  const last = finished.find(job => job.status !== 'cancelled') || null;
  const countOf = (job) => T.titles(job.imported || 0);
  const parts = [];
  let chip;
  if (active) {
    if (active.id === current?.id) {
      chip = { kind: 'run', text: T.chipImporting };
      parts.push(importJobStatusLine(active));
    } else {
      chip = { kind: 'queued', text: T.chipQueued };
      if (current) parts.push(T.startsAfter(importSourceName(current.source)));
    }
    if (last) parts.push(T.previousImport(shortDate(last.finished_at || last.created_at), countOf(last)));
  } else if (src.lane === 'connect' && integration?.status === 'active') {
    if (src.id === 'plex' && !integration.selected_server) {
      chip = { kind: 'warn', text: T.chipNeedsServer };
      parts.push(T.pickServer);
    } else if (last?.review_count > 0) {
      chip = { kind: 'warn', text: T.chipToMatch(last.review_count) };
    } else if (last?.status === 'failed') {
      chip = { kind: 'bad', text: T.chipStopped };
    } else {
      chip = { kind: 'ok', text: T.chipConnected };
    }
    if (integration.display_name) parts.push(T.connectedAs(integration.display_name));
    if (trackingEnabled && connection?.automatic_enabled) parts.push(T.checksDaily);
    if (last && last.status !== 'failed') parts.push(T.lastImport(shortDate(last.finished_at || last.created_at), countOf(last)));
    if (last?.status === 'failed') parts.push(last.last_error || IMPORT_JOBS.errors.gaveUp);
  } else if (last?.review_count > 0) {
    chip = { kind: 'warn', text: T.chipToMatch(last.review_count) };
    parts.push(T.imported(shortDate(last.finished_at || last.created_at), countOf(last)));
  } else if (last?.status === 'failed') {
    chip = { kind: 'bad', text: T.chipStopped };
    parts.push(last.last_error || IMPORT_JOBS.errors.gaveUp);
  } else if (last) {
    chip = { kind: 'ok', text: T.chipDone };
    parts.push(T.imported(shortDate(last.finished_at || last.created_at), countOf(last)));
  } else {
    chip = { kind: 'off', text: T.chipCancelled };
  }
  return { chip, line: parts.join(' · '), active, last };
}

function HistoryRow({ job, current, onFinish, onRetry, onCancel }) {
  const active = importJobActive(job);
  const when = shortDate(job.finished_at || job.created_at);
  const line = active
    ? (job.id === current?.id ? importJobStatusLine(job) : T.startsAfter(importSourceName(current?.source || '')))
    : importJobStatusLine(job);
  let chip;
  if (active) chip = <Chip kind={job.id === current?.id ? 'run' : 'queued'}>{job.id === current?.id ? T.chipImporting : T.chipQueued}</Chip>;
  else if (job.status === 'failed') chip = <Chip kind="bad">{T.chipStopped}</Chip>;
  else if (job.status === 'cancelled') chip = <Chip kind="off">{T.chipCancelled}</Chip>;
  else if (job.review_count > 0) chip = <Chip kind="warn">{T.chipToMatch(job.review_count)}</Chip>;
  else chip = <Chip kind="ok">{T.chipDone}</Chip>;
  return (
    <div className="ss-hist-row">
      <div className="ss-hist-text">
        <b>{when}{active ? ` · ${T.running}` : ''}</b>
        {line && <span>{line}</span>}
      </div>
      <div className="ss-hist-actions">
        {chip}
        {active && <button type="button" className="ss-link" onClick={() => onCancel(job)}>{T.cancel}</button>}
        {!active && job.review_count > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => onFinish(job)}>{T.finishMatching}</button>}
        {job.status === 'failed' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRetry(job)}>{T.tryAgain}</button>}
      </div>
    </div>
  );
}

function SourceDetail({ src, integration, jobs, current, connection, tracking, start, premium, onClose, onImport, onRemove, onFinish, onCancel, navigateToPlans }) {
  const status = statusFor({ src, integration, jobs, current, connection, trackingEnabled: tracking.enabled });
  const reviews = (tracking.reviews || []).filter(review => review.payload?.event?.source === src.id);
  const sourceJobs = jobs.filter(job => job.status !== 'cancelled' || job.id === current?.id);
  const importedTotal = jobs.reduce((sum, job) => sum + (job.imported || 0), 0);
  const plex = src.id === 'plex' && integration?.status === 'active' ? start.accounts.plexSource : null;
  // The server and profile lists load on demand; the detail is one of the
  // places they are needed.
  const plexChoose = plex?.choose;
  const plexListed = !!plex?.servers;
  useEffect(() => {
    if (plex && !plexListed) plexChoose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose is recreated every render; the listed flag is the guard
  }, [!!plex, plexListed]);
  const title = <span className="isp-dialog-title"><ImportSourceIcon id={src.id} name={src.name} size={28} /><span>{src.name}</span></span>;
  const toggleAutomatic = () => {
    if (!premium.isPremium) { navigateToPlans(); return; }
    tracking.control(integration.id, connection?.automatic_enabled ? 'disable_automatic' : 'enable_automatic');
  };
  return (
    <ResponsiveDialog title={title} label={src.name} onClose={onClose} size="compact" tall>
      <div className="ss-detail">
        <p className="ss-detail-status"><Chip kind={status.chip.kind}>{status.chip.text}</Chip>{status.line && <span>{status.line}</span>}</p>
        {src.lane === 'connect' && integration?.status === 'active' && (
          <>
            {tracking.enabled && (
              <div className="ss-card">
                <div className="ss-row ss-row--switch">
                  <div className="ss-row-text"><b>{T.automaticLabel}</b><span>{T.automaticHint(src.name)}</span></div>
                  <SettingsSwitch label={T.automaticLabel} checked={!!connection?.automatic_enabled} disabled={tracking.busy} onChange={toggleAutomatic} />
                </div>
              </div>
            )}
            {plex && plex.servers && (
              <PlexPicker plex={{ servers: plex.servers || [], profiles: plex.profiles || [], serverId: plex.serverId || null, selected: !!plex.selected, selection: plex.selection || null, busy: plex.busy, error: plex.error || null, choose: plex.choose }} />
            )}
            <button type="button" className="onboarding-cta ss-cta" disabled={!!status.active || (plex && !plex.selected)} onClick={onImport}>
              {src.id === 'plex' ? T.importFromProfile : T.importHistory}
            </button>
          </>
        )}
        {src.lane === 'upload' && (
          <button type="button" className="onboarding-cta ss-cta" disabled={!!status.active} onClick={onImport}>{T.importNewerExport}</button>
        )}
        {src.lane === 'upload' && <p className="ss-hint">{T.importNewerHint}</p>}
        <div className="ss-lbl">{T.history}</div>
        <div className="ss-card ss-hist">
          {sourceJobs.length === 0 && reviews.length === 0 && <p className="ss-empty-line">{T.noHistory}</p>}
          {sourceJobs.map(job => <HistoryRow key={job.id} job={job} current={current} onFinish={onFinish} onRetry={onImport} onCancel={onCancel} />)}
          {reviews.map(review => (
            <div className="ss-hist-row" key={review.id}>
              <div className="ss-hist-text"><b>{T.duplicateWatch}</b><span>{review.payload?.summary?.title} · {TRACKING.reviewDetails(review.payload.event)}</span></div>
              <div className="ss-hist-actions">
                <button type="button" className="btn btn-secondary btn-sm" disabled={tracking.busy} onClick={() => tracking.resolve(review.id, true)}>{T.keepWatch}</button>
                <button type="button" className="ss-link" disabled={tracking.busy} onClick={() => tracking.resolve(review.id, false)}>{T.skipWatch}</button>
              </div>
            </div>
          ))}
        </div>
        {tracking.error && <p className="isp-error">{tracking.error}</p>}
        {src.lane === 'connect' && integration?.status === 'active' && (
          <>
            <button type="button" className="ss-link ss-link--danger" onClick={() => onRemove(importedTotal)}>{T.remove(src.name)}</button>
            <p className="ss-hint ss-hint--center">{T.stays}</p>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * @param {{ userId: string | null | undefined, premium: { isPremium: boolean }, showConfirm: (opts: any) => void }} props
 */
export default function SettingsSources({ userId, premium, showConfirm }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const start = useImportStart({
    userId,
    entry: IMPORT_ENTRY_POINTS.SETTINGS,
    returnPath: (id) => `/settings?section=connections&import=${id}`,
    initialSource: searchParams.get('import') || null,
    history: true,
  });
  const tracking = useTrackingJobs(userId);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(/** @type {string | null} */ (searchParams.get('source') || null));

  // ?import=<source> and ?source=<id> have done their job once read.
  useEffect(() => {
    if (!searchParams.get('import') && !searchParams.get('source')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('import');
    next.delete('source');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const { trakt, plex, simkl } = start.accounts;
  const integrations = useMemo(() => ({ trakt: trakt.integration, plex: plex.integration, simkl: simkl.integration }), [trakt.integration, plex.integration, simkl.integration]);
  const jobsBySource = useMemo(() => {
    const map = {};
    for (const job of start.jobs) {
      const id = job.source === 'trakt-export' ? 'trakt' : job.source;
      (map[id] ||= []).push(job);
    }
    return map;
  }, [start.jobs]);
  const connectionFor = (id) => {
    const integration = integrations[id];
    return integration ? tracking.connections.find(row => row.integration_id === integration.id) || null : null;
  };

  // A source row: an account that's connected (or has jobs), or a file source with any job in the window.
  const rows = IMPORT_SOURCES.filter(src => {
    const jobs = jobsBySource[src.id] || [];
    if (src.lane === 'connect') return integrations[src.id]?.status === 'active' || jobs.length > 0;
    return jobs.length > 0;
  });

  const refreshAll = () => { void start.refreshJobs(); trakt.loadIntegration(); plex.loadIntegration(); simkl.loadIntegration(); if (tracking.enabled) tracking.load(); };
  const finishJob = (job) => navigate(`/import?job=${job.id}&from=${IMPORT_ENTRY_POINTS.SETTINGS}`);
  const cancelJob = (job) => start.cancelJob(job.id);
  const importFrom = (id) => { setOpen(null); setAdding(false); start.pick(id); };
  const navigateToPlans = () => showConfirm({
    title: T.automaticNeedsPremium,
    message: T.automaticNeedsPremiumMessage,
    confirmLabel: SETTINGS_VIEW.premium.upgradeButton,
    onConfirm: () => navigate(premiumPlansPath('/settings?section=connections')),
  });
  const removeSource = (src, importedTotal) => showConfirm({
    title: T.removeTitle(src.name),
    message: T.removeMessage(src.name, importedTotal ? T.titles(importedTotal) : ''),
    confirmLabel: T.removeConfirm,
    danger: true,
    onConfirm: async () => {
      setOpen(null);
      if (src.id === 'trakt') await trakt.disconnect();
      else if (src.id === 'plex') await plex.disconnect();
      else if (src.id === 'simkl') await simkl.disconnect();
      refreshAll();
    },
  });

  const pill = importPillFor(start.current, start.queued);
  const openSrc = open ? findImportSource(open) : null;

  return (
    <>
      {start.current && pill && (
        <section className="ij-card ss-running" aria-live="polite" aria-label={pill.title}>
          <span className="ij-icon"><ImportSourceIcon id={pill.source} name={pill.name} size={32} /></span>
          <div className="ij-text">
            <h2 className="ij-title">{pill.title}</h2>
            <p className="ij-line">{pill.line}</p>
            <span className="ij-bar" role="progressbar" aria-label={C.progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pill.pct ?? undefined}>
              <span className={`ij-bar-fill${pill.pct == null ? ' is-indeterminate' : ''}`} style={pill.pct == null ? undefined : { width: `${pill.pct}%` }} />
            </span>
          </div>
          <div className="ij-actions"><button type="button" className="ij-link" onClick={() => cancelJob(start.current)}>{C.cancel}</button></div>
        </section>
      )}

      <div className="settings-group">
        <div className="settings-group-title">{T.groupTitle}</div>
        <div className="ss-card">
          {rows.length === 0 ? (
            <div className="ss-empty">
              <div className="ss-empty-logos" aria-hidden="true">{['trakt', 'letterboxd', 'netflix', 'plex', 'disney', 'apple'].map(id => <ImportSourceIcon key={id} id={id} name={id} size={26} />)}</div>
              <h3 className="ss-empty-title">{T.emptyTitle}</h3>
              <p className="ss-empty-body">{T.emptyBody}</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>{T.addSource}</button>
            </div>
          ) : (
            <>
              {rows.map(src => {
                const jobs = jobsBySource[src.id] || [];
                const integration = integrations[src.id];
                const status = statusFor({ src, integration, jobs, current: start.current, connection: connectionFor(src.id), trackingEnabled: tracking.enabled });
                const needsServer = src.id === 'plex' && integration?.status === 'active' && !integration.selected_server;
                const toMatch = !status.active && status.last?.review_count > 0 ? status.last : null;
                return (
                  <div key={src.id} className="ss-row ss-row--source">
                    <button type="button" className="ss-row-main" onClick={() => setOpen(src.id)} aria-label={T.open(src.name)}>
                      <ImportSourceIcon id={src.id} name={src.name} size={34} />
                      <span className="ss-row-text">
                        <b>{src.name}</b>
                        <span><Chip kind={status.chip.kind}>{status.chip.text}</Chip>{status.line}</span>
                      </span>
                    </button>
                    <span className="ss-row-side">
                      {needsServer && <button type="button" className="btn btn-primary btn-sm ss-row-action" onClick={() => setOpen(src.id)}>{T.chooseServer}</button>}
                      {toMatch && <button type="button" className="btn btn-primary btn-sm ss-row-action" onClick={() => finishJob(toMatch)}>{T.finishMatching}</button>}
                      <svg className="ss-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </span>
                  </div>
                );
              })}
              <button type="button" className="ss-row ss-row--add" onClick={() => setAdding(true)}>
                <span className="ss-plus" aria-hidden="true">+</span>
                <span className="ss-row-text"><b>{T.addSource}</b></span>
                <svg className="ss-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </>
          )}
        </div>
        {rows.length > 0 && <p className="ss-foot">{T.foot}</p>}
      </div>

      {adding && (
        <ResponsiveDialog title={T.addSourceTitle} onClose={() => setAdding(false)} size="wide" tall>
          <p className="ss-add-sub">{T.addSourceSub}</p>
          <ImportSourceLanes jobs={start.jobs} current={start.current} connectedIds={start.connectedIds} onPick={importFrom} onDropFiles={(id, files) => { setAdding(false); start.attachFiles(files, id); }} />
        </ResponsiveDialog>
      )}

      {openSrc && !start.source && (
        <SourceDetail
          src={openSrc}
          integration={integrations[openSrc.id]}
          jobs={jobsBySource[openSrc.id] || []}
          current={start.current}
          connection={connectionFor(openSrc.id)}
          tracking={tracking}
          start={start}
          premium={premium}
          onClose={() => setOpen(null)}
          onImport={() => importFrom(openSrc.id)}
          onRemove={(importedTotal) => removeSource(openSrc, importedTotal)}
          onFinish={finishJob}
          onCancel={cancelJob}
          navigateToPlans={navigateToPlans}
        />
      )}

      <ImportSourceDialog start={start} onContinue={() => { start.close(); refreshAll(); }} continueLabel={T.done} onAddAnother={() => { start.addAnother(); setAdding(true); }} />
    </>
  );
}
