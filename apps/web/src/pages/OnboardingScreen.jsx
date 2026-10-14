// The onboarding screens, render only. OnboardingFlow.jsx owns the data and
// the writes and passes everything in, so Storybook can show every step
// without an account.
import { posterUrl, logoUrl } from '../utils/images.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import PlotLogo from '../components/PlotLogo.jsx';
import ImportSourceIcon from '../components/ImportSourceIcon.jsx';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
import { IMPORT_JOBS } from '../copy/importJobs.js';
import { COMMON } from '../copy/common.js';
import { REGIONS } from '@plot/core/regions.js';
import { IMPORT_SOURCES, ONBOARDING_PROGRESS, ONBOARDING_PROGRESS_TOTAL } from '@plot/core/onboardingSetup.js';
import './OnboardingFlow.css';

const F = ONBOARDING_FLOW;

function Chevron({ left = false, className = 'ob-chevron' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={left ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
  );
}

/* The picked source's panel: a file drop for an export, or connect + import
   for an account. Once the job is queued, setup carries on. */
function ImportPanel({ importStep }) {
  const I = IMPORT_JOBS.onboarding;
  const src = IMPORT_SOURCES.find(s => s.id === importStep.source);
  const name = src?.name || importStep.source;
  const { phase } = importStep;
  if (phase === 'queued') {
    return (
      <div className="ob-import ob-import--done" role="status">
        <div className="ob-import-check"><Check /></div>
        <p className="ob-import-title">{I.queued(name)}</p>
        <p className="ob-import-body">{I.queuedBody}</p>
        <button type="button" className="onboarding-cta" onClick={importStep.onContinue}>{I.continue}</button>
      </div>
    );
  }
  const plex = importStep.plex;
  return (
    <div className="ob-import">
      {importStep.error && <p className="ob-error">{importStep.error}</p>}
      {(phase === 'file' || phase === 'uploading') && (
        <label className={`ob-drop${phase === 'uploading' ? ' is-busy' : ''}`}
          onDragOver={e => { e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); if (phase === 'file' && e.dataTransfer?.files?.length) importStep.onFiles(e.dataTransfer.files); }}>
          <input type="file" accept={importStep.accept} multiple disabled={phase === 'uploading'}
            onChange={e => { if (e.target.files?.length) importStep.onFiles(e.target.files); e.target.value = ''; }} />
          {phase === 'uploading' ? <PlotLoader size="sm" /> : <UploadIcon />}
          <span className="ob-drop-title">{phase === 'uploading' ? I.uploading : I.chooseFile}</span>
          <span className="ob-drop-hint">{I.chooseFileHint(importStep.formats)}</span>
        </label>
      )}
      {phase === 'connect' && (
        <button type="button" className="onboarding-cta" onClick={importStep.onConnect}>{I.connect(name)}</button>
      )}
      {phase === 'connecting' && (
        <div className="ob-import-wait"><PlotLoader size="sm" /><span>{I.connecting}</span></div>
      )}
      {(phase === 'ready' || phase === 'starting') && (
        <>
          <p className="ob-import-title">{I.connected(name)}</p>
          {plex && (
            <div className="ob-import-plex">
              {(plex.servers || []).map(server => <button type="button" key={server.clientIdentifier} className={`ob-chip${plex.serverId === server.clientIdentifier ? ' is-on' : ''}`} disabled={plex.busy} onClick={() => plex.choose(server.clientIdentifier)}>{server.name}</button>)}
              {(plex.profiles || []).map(profile => <button type="button" key={profile.accountID} className="ob-chip" disabled={plex.busy} onClick={() => plex.choose(plex.serverId, profile.accountID)}>{profile.name}</button>)}
              {!plex.selected && <p className="ob-import-body">{I.plexServerLater}</p>}
              {plex.error && <p className="ob-error">{plex.error}</p>}
            </div>
          )}
          <button type="button" className="onboarding-cta" disabled={phase === 'starting' || (plex && !plex.selected)} onClick={importStep.onStartImport}>{I.startImport}</button>
        </>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
  );
}

function Progress({ step }) {
  const on = ONBOARDING_PROGRESS[step];
  return (
    <div className="ob-progress" role="img" aria-label={F.stepLabel(on, ONBOARDING_PROGRESS_TOTAL)}>
      {Array.from({ length: ONBOARDING_PROGRESS_TOTAL }, (_, i) => <span key={i} className={i < on ? 'is-on' : ''} />)}
    </div>
  );
}

/**
 * @param {{
 *   step: import('@plot/core/onboardingSetup.js').OnboardingStep,
 *   firstName: string, saving: boolean, saveError: string | null,
 *   canGoBack: boolean, onBack: () => void, onSkip: () => void,
 *   seed: { query: string, onQuery: (q: string) => void, searching: boolean, items: any[], selectedIds: Set<number>,
 *           count: number, onToggle: (item: any) => void, onContinue: () => void, onSwitch: () => void },
 *   onPickImport: (id: string) => void,
 *   importStep: { source: string | null, phase: 'pick' | 'file' | 'uploading' | 'connect' | 'connecting' | 'ready' | 'starting' | 'queued',
 *                 error: string | null, accept: string, formats: string, connectedName: string | null,
 *                 plex: { servers: any[], profiles: any[], serverId: string | null, selected: boolean, busy: boolean, error: string | null, choose: (server?: string, profile?: string) => void } | null,
 *                 onFiles: (files: FileList | File[]) => void, onConnect: () => void, onStartImport: () => void, onContinue: () => void },
 *   services: { list: Array<{ id: number, name: string, logo_path: string | null }> | null, error: boolean,
 *               selectedIds: number[], onToggle: (id: number) => void, region: string, editingRegion: boolean,
 *               onEditRegion: () => void, onRegion: (code: string) => void, onRegionDone: () => void,
 *               onContinue: () => void },
 *   building: { leaving: boolean, fan: any[], lines: string[], lineIndex: number },
 * }} props
 */
export default function OnboardingScreen({ step, firstName, saving, saveError, canGoBack, onBack, onSkip, seed, onPickImport, importStep, services, building }) {
  const regionName = REGIONS.find(r => r.code === services.region)?.name || services.region;
  const columnClass = step === 'seed' ? 'ob-column ob-column--wide' : step === 'services' ? 'ob-column ob-column--services' : 'ob-column';

  return (
    <div className={`ob-page${step === 'seed' ? ' ob-page--fixed' : ''}`}>
      <div className="ob-topbar">
        <div className="ob-topbar-logo"><PlotLogo /></div>
        {step !== 'building' && (
          <button type="button" className="ob-skip" disabled={saving} onClick={onSkip}>{F.skip}</button>
        )}
      </div>

      <div className={columnClass}>
        <Progress step={step} />
        {canGoBack && (
          <button type="button" className="ob-back" onClick={onBack} aria-label={F.goBack}>
            <Chevron left className="ob-back-icon" />{COMMON.back}
          </button>
        )}

        {/* ── 1 · Save a few, or switch ── */}
        {step === 'seed' && (
          <>
            <div className="ob-head ob-head--center ob-head--wide">
              <h1 className="ob-title">{F.seed.title(firstName)}</h1>
              <p className="ob-sub">{F.seed.subtitle}</p>
            </div>
            <button type="button" className="ob-switch" onClick={seed.onSwitch}>
              <span className="ob-switch-marks" aria-hidden="true">{IMPORT_SOURCES.slice(0, 3).map(src => <span key={src.id}><ImportSourceIcon id={src.id} name={src.name} size={26} /></span>)}</span>
              <span className="ob-switch-text"><strong>{F.seed.switchingLead}</strong> {F.seed.switchingBody}</span>
              <Chevron />
            </button>
            <div className="ob-search">
              <svg className="ob-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input
                className="onboarding-input"
                aria-label={F.step2.searchPlaceholder}
                placeholder={F.step2.searchPlaceholder}
                value={seed.query}
                onChange={e => seed.onQuery(e.target.value)}
              />
              {seed.query && (
                <button type="button" className="search-input-clear" onClick={() => seed.onQuery('')} aria-label={F.clearSearch}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
            {seed.searching && <div className="loading-state" style={{ minHeight: 60 }}><PlotLoader size="sm" /></div>}
            <div className="ob-grid-scroll">
            <div className="ob-grid">
              {seed.items.map(item => {
                const on = seed.selectedIds.has(item.id);
                const title = item.title || item.name || F.untitled;
                return (
                  <button
                    key={`${item.media_type}-${item.id}`}
                    type="button"
                    className={`ob-poster${on ? ' is-on' : ''}`}
                    onClick={() => seed.onToggle(item)}
                    aria-pressed={on}
                    aria-label={`${on ? F.step2.remove : F.step2.add} ${title}`}
                  >
                    {item.poster_path && <img src={posterUrl(item.poster_path, 'w185')} alt="" loading="lazy" />}
                    {on && (
                      <>
                        <span className="ob-poster-tint" />
                        <span className="ob-poster-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v16l-6-3.75L6 20.5v-16Z" fill="currentColor" /></svg></span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            </div>
            <div className="ob-foot ob-foot--end">
              {saveError && <p className="ob-error">{saveError}</p>}
              <button type="button" className="onboarding-cta" disabled={seed.count === 0} onClick={seed.onContinue}>
                {seed.count === 0 ? F.seed.tapAFew : F.seed.continueWith(seed.count)}
              </button>
            </div>
          </>
        )}

        {/* ── 1b · Bring my history over ── */}
        {step === 'import' && (
          <>
            <div className="ob-head ob-head--center">
              <h1 className="ob-title">{F.importSources.title}</h1>
              <p className="ob-sub">{F.importSources.subtitle}</p>
            </div>
            <nav className="ob-sources" aria-label={F.importSources.sourcesLabel}>
              {IMPORT_SOURCES.map(src => {
                const on = importStep.source === src.id;
                return (
                  <button key={src.id} type="button" className={`ob-source${on ? ' is-on' : ''}`} aria-pressed={on} disabled={importStep.phase === 'queued' && !on} onClick={() => onPickImport(src.id)}>
                    <ImportSourceIcon id={src.id} name={src.name} />
                    <span className="ob-source-text">
                      <span className="ob-source-name">{src.name}</span>
                      <span className="ob-source-hint">{src.hint}</span>
                    </span>
                    <Chevron />
                  </button>
                );
              })}
            </nav>
            {importStep.source ? <ImportPanel importStep={importStep} /> : <div className="ob-note"><Check /><span>{F.importSources.note}</span></div>}
            {saveError && <div className="ob-foot ob-foot--plain"><p className="ob-error">{saveError}</p></div>}
          </>
        )}

        {/* ── 2 · Where do you watch ── */}
        {step === 'services' && (
          <>
            <div className="ob-head ob-head--center">
              <h1 className="ob-title">{F.services.title}</h1>
              <p className="ob-sub">{F.services.subtitle}</p>
            </div>
            {services.error ? (
              <p className="ob-region">{F.services.loadError}</p>
            ) : !services.list ? (
              <div className="loading-state" style={{ minHeight: 200 }}><PlotLoader size="sm" /></div>
            ) : (
              <div className="ob-services">
                {services.list.map(s => {
                  const on = services.selectedIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" className={`ob-service${on ? ' is-on' : ''}`} onClick={() => services.onToggle(s.id)} aria-pressed={on}>
                      {s.logo_path && <img src={logoUrl(s.logo_path, 'w92')} alt="" />}
                      <span className="ob-service-name">{s.name}</span>
                      {on && <span className="ob-service-check"><Check /></span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="ob-region">
              {services.editingRegion ? (
                <label>
                  {F.services.regionLabel}
                  <select
                    value={services.region}
                    autoFocus
                    onChange={e => services.onRegion(e.target.value)}
                    onBlur={services.onRegionDone}
                  >
                    {REGIONS.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </label>
              ) : (
                <>{F.services.regionLine(regionName)} <button type="button" onClick={services.onEditRegion}>{F.services.changeRegion}</button></>
              )}
            </div>
            <div className="ob-foot ob-foot--plain">
              {saveError && <p className="ob-error">{saveError}</p>}
              <button type="button" className="onboarding-cta" onClick={services.onContinue} disabled={saving}>{F.continueArrow}</button>
            </div>
          </>
        )}

        {/* ── 3 · Building your Plot ── */}
        {step === 'building' && (
          <div className={`ob-building${building.leaving ? ' is-leaving' : ''}`}>
            <div className="ob-fan" aria-hidden="true">
              {building.fan.map((item, i) => {
                // A full fan shuffles: each new line brings the next poster to the front.
                const slots = ['left', 'right', 'front'].slice(-building.fan.length);
                const slot = building.fan.length === 3 ? slots[(i + building.lineIndex) % 3] : slots[i];
                return (
                <div key={item.id} className={`ob-fan-card is-${slot}`} style={{ animationDelay: `${i * 140}ms` }}>{item.poster_path && <img src={posterUrl(item.poster_path, 'w185')} alt="" />}</div>
                );
              })}
            </div>
            <h1 className="ob-building-title">{F.building.heading} <PlotLogo style={{ fontSize: 30 }} /></h1>
            <div className="ob-lines" role="status">
              <span className="ob-sr">{F.building.status}</span>
              {building.lines.map((text, i) => (
                <div key={text} className={`ob-line${i === building.lineIndex ? ' is-on' : ''}`} aria-hidden="true">
                  <svg className="ob-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>
                  {text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
