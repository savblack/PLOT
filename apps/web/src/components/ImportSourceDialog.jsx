// The per-source sheet (phones) or dialog (desktop) that starts a background
// import: export steps and the drop zone for a file source, what gets read
// and the connect button for an account, then the "got it" state. State comes
// from hooks/useImportStart.js; onboarding and Settings both render this.
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { findImportSource } from '@plot/core/onboardingSetup.js';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
import { IMPORT_JOBS } from '../copy/importJobs.js';
import { COMMON } from '../copy/common.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import ImportSourceIcon from './ImportSourceIcon.jsx';
import './ImportSourcePicker.css';

const S = ONBOARDING_FLOW.importSources;
const I = IMPORT_JOBS.onboarding;

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  );
}

function ReadsList({ id }) {
  const reads = S.reads[id] || [];
  const not = S.readsNot[id];
  return (
    <ul className="isp-reads">
      {reads.map(line => <li key={line}><CheckIcon /><span>{line}</span></li>)}
      {not && <li className="is-not"><span className="isp-reads-dash" aria-hidden="true">–</span><span>{not}</span></li>}
    </ul>
  );
}

/** Server then profile, as radio lists. Shared with the Settings source detail. */
export function PlexPicker({ plex }) {
  return (
    <div className="isp-plex">
      {plex.servers.length > 0 && (
        <>
          <div className="isp-lbl">{I.plexServer}</div>
          <div className="isp-radios" role="radiogroup" aria-label={I.plexServer}>
            {plex.servers.map(server => {
              const on = plex.serverId === server.clientIdentifier;
              return (
                <button type="button" role="radio" aria-checked={on} key={server.clientIdentifier} className={`isp-radio${on ? ' is-on' : ''}`} disabled={plex.busy} onClick={() => plex.choose(server.clientIdentifier)}>
                  <i aria-hidden="true" /><span>{server.name}</span>{server.owned != null && <em>{server.owned ? I.plexOwned : I.plexShared}</em>}
                </button>
              );
            })}
          </div>
        </>
      )}
      {plex.profiles.length > 0 && (
        <>
          <div className="isp-lbl">{I.plexProfile}</div>
          <div className="isp-radios" role="radiogroup" aria-label={I.plexProfile}>
            {plex.profiles.map(profile => {
              const on = plex.selection?.profileName === profile.name;
              return (
                <button type="button" role="radio" aria-checked={on} key={profile.accountID} className={`isp-radio${on ? ' is-on' : ''}`} disabled={plex.busy} onClick={() => plex.choose(plex.serverId, profile.accountID)}>
                  <i aria-hidden="true" /><span>{profile.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {plex.selected && plex.selection && <p className="isp-import-body">{I.plexSelected(plex.selection.name, plex.selection.profileName)}</p>}
      {!plex.selected && !plex.busy && plex.servers.length === 0 && <p className="isp-import-body">{I.plexServerLater}</p>}
      {plex.busy && <div className="isp-import-wait"><PlotLoader size="sm" /><span>{COMMON.loading}</span></div>}
      {plex.error && <p className="isp-error">{plex.error}</p>}
    </div>
  );
}

/**
 * @param {{
 *   start: ReturnType<typeof import('../hooks/useImportStart.js').useImportStart>,
 *   onContinue: () => void, continueLabel?: string, onAddAnother?: () => void,
 * }} props
 */
export default function ImportSourceDialog({ start, onContinue, continueLabel = I.continue, onAddAnother }) {
  const src = findImportSource(start.source);
  if (!src || start.phase === 'pick') return null;
  const name = src.name;
  const { phase, plex, pendingFiles } = start;
  const title = (
    <span className="isp-dialog-title"><ImportSourceIcon id={src.id} name={name} size={28} /><span>{name}</span></span>
  );

  let body;
  if (phase === 'queued') {
    body = (
      <div className="isp-import isp-import--done" role="status">
        <div className="isp-import-check"><CheckIcon /></div>
        <p className="isp-import-title">{start.queuedBehind ? I.queuedBehind(name, start.queuedBehind) : I.queued(name)}</p>
        <p className="isp-import-body">{I.queuedBody}</p>
        <button type="button" className="onboarding-cta" onClick={onContinue}>{continueLabel}</button>
        {onAddAnother && <button type="button" className="isp-link" onClick={onAddAnother}>{I.addAnother}</button>}
      </div>
    );
  } else if (src.lane === 'upload') {
    const ready = pendingFiles?.length > 0;
    body = (
      <div className="isp-import">
        <p className="isp-import-body isp-import-body--lead">{src.hint}.{src.noRatings && S.noRatings[src.id] ? ` ${S.noRatings[src.id]}` : ''}</p>
        {start.error && <p className="isp-error">{start.error}</p>}
        {ready && phase !== 'uploading' ? (
          <div className="isp-drop is-ready" role="status">
            <CheckIcon />
            <span className="isp-drop-title">{S.fileReady(pendingFiles.map(f => f.name).join(', '), start.pendingRows)}</span>
            <button type="button" className="isp-link" onClick={() => start.attachFiles([])}>{S.changeFile}</button>
          </div>
        ) : (
          <label className={`isp-drop${phase === 'uploading' ? ' is-busy' : ''}`}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); if (phase === 'file' && e.dataTransfer?.files?.length) start.attachFiles(e.dataTransfer.files); }}>
            <input type="file" accept={src.accept} multiple disabled={phase === 'uploading'}
              onChange={e => { if (e.target.files?.length) start.attachFiles(e.target.files); e.target.value = ''; }} />
            {phase === 'uploading' ? <PlotLoader size="sm" /> : <UploadIcon />}
            <span className="isp-drop-title">{phase === 'uploading' ? I.uploading : S.dropTitle}</span>
            <span className="isp-drop-hint">{S.dropFormats(src.formats)}</span>
          </label>
        )}
        {src.steps && (
          <ol className="isp-steps">
            {src.steps.map((step, i) => <li key={step}><i>{i + 1}</i><span>{step}</span></li>)}
          </ol>
        )}
        <p className="isp-privacy"><LockIcon /><span>{src.noRatings ? S.privacyNoRatings : S.privacy}</span></p>
        <button type="button" className="onboarding-cta" disabled={!ready || phase === 'uploading'} onClick={start.upload}>
          {phase === 'uploading' ? I.uploading : S.importRows(start.pendingRows)}
        </button>
      </div>
    );
  } else if (phase === 'connect') {
    body = (
      <div className="isp-import">
        {start.error && <p className="isp-error">{start.error}</p>}
        <ReadsList id={src.id} />
        <button type="button" className="onboarding-cta" onClick={start.connect}>{S.continueTo(name)}</button>
      </div>
    );
  } else if (phase === 'connecting') {
    body = (
      <div className="isp-import">
        <div className="isp-import-wait"><PlotLoader size="sm" /><span>{I.connecting}</span></div>
        <button type="button" className="isp-link" onClick={start.connect}>{S.openAgain}</button>
      </div>
    );
  } else {
    // 'ready' | 'starting'
    body = (
      <div className="isp-import">
        {start.error && <p className="isp-error">{start.error}</p>}
        <p className="isp-import-status"><span className="isp-st isp-st--ok"><i>✓</i>{S.tileConnected}</span>{start.connectedAs ? I.connectedAs(start.connectedAs) : null}</p>
        {plex && <PlexPicker plex={plex} />}
        <button type="button" className="onboarding-cta" disabled={phase === 'starting' || (plex && !plex.selected)} onClick={start.startJob}>
          {phase === 'starting' ? I.starting : plex ? I.startPlexImport : I.startImport}
        </button>
      </div>
    );
  }

  return (
    <ResponsiveDialog title={title} onClose={start.busy ? () => {} : start.close} size="compact" contentClassName="isp-dialog-content">
      {body}
    </ResponsiveDialog>
  );
}
