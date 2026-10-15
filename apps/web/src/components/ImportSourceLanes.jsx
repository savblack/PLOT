// The two lanes of import sources (Connect an account, Upload an export) as
// logo tiles, and the one-line progress pill that follows a pick. Shared by
// onboarding's switching-apps step and Settings › Connections › Add a source.
import { availableImportSources } from '@plot/core/onboardingSetup.js';
import { importTileState as tileStateFor } from '@plot/core/importJobs.js';
import { getConfig } from '@plot/core/config.js';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
import ImportSourceIcon from './ImportSourceIcon.jsx';
import './ImportSourcePicker.css';

const S = ONBOARDING_FLOW.importSources;

function SourceTile({ src, state, disabled, onPick, onDropFiles }) {
  const label = state === 'importing' ? S.tileImporting : state === 'queued' ? S.tileQueued : state === 'connected' ? S.tileConnected : src.name;
  const droppable = src.lane === 'upload' && !disabled && !!onDropFiles;
  return (
    <button type="button" className={`isp-tile${state ? ` is-${state}` : ''}`} disabled={disabled} aria-pressed={!!state} onClick={() => onPick(src.id)}
      onDragOver={droppable ? (e => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }) : undefined}
      onDragLeave={droppable ? (e => e.currentTarget.classList.remove('is-over')) : undefined}
      onDrop={droppable ? (e => { e.preventDefault(); e.currentTarget.classList.remove('is-over'); if (e.dataTransfer?.files?.length) onDropFiles(src.id, e.dataTransfer.files); }) : undefined}
      aria-label={state ? `${src.name}: ${label}` : `${src.name}. ${src.hint}`}>
      <ImportSourceIcon id={src.id} name={src.name} size={34} />
      <span className="isp-tile-name">{label}</span>
    </button>
  );
}

/**
 * @param {{
 *   jobs: any[], current: any, connectedIds: string[],
 *   onPick: (id: string) => void, onDropFiles?: (id: string, files: FileList) => void,
 * }} props
 */
export default function ImportSourceLanes({ jobs, current, connectedIds = [], onPick, onDropFiles }) {
  const sources = availableImportSources(getConfig());
  const lane = (key) => sources.filter(src => src.lane === key);
  return (
    <div className="isp-lanes" aria-label={S.sourcesLabel}>
      <section className="isp-lane isp-lane--connect">
        <h2 className="isp-lane-title">{S.connectLane}</h2>
        <p className="isp-lane-hint">{S.connectLaneHint}</p>
        <div className="isp-tiles isp-tiles--connect">
          {lane('connect').map(src => {
            const held = tileStateFor(jobs, current, src.id);
            return <SourceTile key={src.id} src={src} state={held || (connectedIds.includes(src.id) ? 'connected' : null)} disabled={!!held} onPick={onPick} />;
          })}
        </div>
      </section>
      <section className="isp-lane isp-lane--upload">
        <h2 className="isp-lane-title">{S.uploadLane}</h2>
        <p className="isp-lane-hint"><span className="isp-only-phone">{S.uploadLaneHint}</span><span className="isp-only-desktop">{S.uploadLaneHintDesktop}</span></p>
        <div className="isp-tiles">
          {lane('upload').map(src => {
            const held = tileStateFor(jobs, current, src.id);
            return <SourceTile key={src.id} src={src} state={held} disabled={!!held} onPick={onPick} onDropFiles={onDropFiles} />;
          })}
        </div>
      </section>
    </div>
  );
}

/** The one-line import progress shown above whatever follows a pick. */
export function ImportPill({ pill }) {
  if (!pill) return null;
  return (
    <div className="isp-pill" role="status">
      <ImportSourceIcon id={pill.source} name={pill.name} size={22} />
      <span className="isp-pill-title">{pill.title}</span>
      <span className="isp-pill-bar" aria-hidden="true"><i className={pill.pct == null ? 'is-indeterminate' : ''} style={pill.pct == null ? undefined : { width: `${pill.pct}%` }} /></span>
      <span className="isp-pill-line">{pill.line}</span>
    </div>
  );
}
