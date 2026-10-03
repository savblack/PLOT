// The onboarding screens, render only. OnboardingFlow.jsx owns the data and
// the writes and passes everything in, so Storybook can show every step
// without an account.
import { posterUrl, logoUrl } from '../utils/images.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import PlotLogo from '../components/PlotLogo.jsx';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';
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
 *   services: { list: Array<{ id: number, name: string, logo_path: string | null }> | null, error: boolean,
 *               selectedIds: number[], onToggle: (id: number) => void, region: string, editingRegion: boolean,
 *               onEditRegion: () => void, onRegion: (code: string) => void, onRegionDone: () => void,
 *               matchLine: string, onContinue: () => void },
 *   building: { leaving: boolean, fan: any[], lines: string[], lineIndex: number },
 * }} props
 */
export default function OnboardingScreen({ step, firstName, saving, saveError, canGoBack, onBack, onSkip, seed, onPickImport, services, building }) {
  const regionName = REGIONS.find(r => r.code === services.region)?.name || services.region;
  const columnClass = step === 'seed' ? 'ob-column ob-column--wide' : step === 'services' ? 'ob-column ob-column--services' : 'ob-column';

  return (
    <div className="ob-page">
      <div className="ob-topbar">
        <div className="ob-topbar-logo">
          {canGoBack && (
            <button type="button" className="onboarding-back" onClick={onBack} aria-label={F.goBack}>
              <Chevron left className="" />
            </button>
          )}
          <PlotLogo />
        </div>
        {step !== 'building' && (
          <button type="button" className="ob-skip" disabled={saving} onClick={onSkip}>{F.skip}</button>
        )}
      </div>

      <div className={columnClass}>
        <Progress step={step} />

        {/* ── 1 · Save a few, or switch ── */}
        {step === 'seed' && (
          <>
            <div className="ob-head ob-head--wide">
              <h1 className="ob-title">{F.seed.title(firstName)}</h1>
              <p className="ob-sub">{F.seed.subtitle}</p>
            </div>
            <button type="button" className="ob-switch" onClick={seed.onSwitch}>
              <span className="ob-switch-marks" aria-hidden="true"><span>L</span><span>T</span><span>N</span></span>
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
                        <span className="ob-poster-mark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg></span>
                      </>
                    )}
                  </button>
                );
              })}
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
              {IMPORT_SOURCES.map(src => (
                <button key={src.id} type="button" className="ob-source" onClick={() => onPickImport(src.id)}>
                  <span className="ob-source-mark" aria-hidden="true">{src.name[0]}</span>
                  <span className="ob-source-text">
                    <span className="ob-source-name">{src.name}</span>
                    <span className="ob-source-hint">{src.hint}</span>
                  </span>
                  <Chevron />
                </button>
              ))}
            </nav>
            <div className="ob-note"><Check /><span>{F.importSources.note}</span></div>
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
            <div className="ob-match" aria-live="polite"><Check /><span>{services.matchLine}</span></div>
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
              {building.fan.map(item => (
                <div key={item.id} className="ob-fan-card">{item.poster_path && <img src={posterUrl(item.poster_path, 'w185')} alt="" />}</div>
              ))}
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
