import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { useApp } from '../hooks/useApp.js';
import {
  useTonightPicker, PICKER_RUNTIMES, PICKER_ERAS, PICKER_MIN_SCORES, PICKER_LANGUAGES, PICKER_MODES,
} from '../hooks/useTonightPicker.js';
import { TONIGHT_PICKER } from '../copy/tonightPicker.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { posterUrl } from '../utils/images.js';
import { EVENTS, track } from '../lib/analytics.js';
import './TonightView.css';

function PremiumGate({ navigate }) {
  useEffect(() => { track(EVENTS.PREMIUM_GATE_HIT, { feature: 'tonight_picker' }); }, []);
  return (
    <div className="empty-state tonight-gate">
      <div className="empty-title">{TONIGHT_PICKER.gateTitle}</div>
      <div className="empty-body">{TONIGHT_PICKER.gateBody}</div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(premiumPlansPath('/tonight'))}>
        {PLANS_PAGE.previewAction}
      </button>
    </div>
  );
}

/** Single-select chip row (radiogroup). */
function ChipRow({ label, values, value, labelFor, onChange }) {
  return (
    <div className="tonight-field" role="radiogroup" aria-label={label}>
      <div className="tonight-field-label">{label}</div>
      <div className="tonight-chips">
        {values.map(v => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            className={`tonight-chip${value === v ? ' active' : ''}`}
            onClick={() => onChange(v)}
          >
            {labelFor(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Check({ checked, disabled, label, hint, onChange }) {
  return (
    <label className={`tonight-check${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="tonight-check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <span>
        <span className="tonight-check-label">{label}</span>
        {hint && <span className="tonight-check-hint">{hint}</span>}
      </span>
    </label>
  );
}

function OptionsPanel({ picker }) {
  const { options, setOption, toggleGenre, genres } = picker;
  return (
    <section className="tonight-panel" aria-label={TONIGHT_PICKER.title}>
      <ChipRow
        label={TONIGHT_PICKER.timeLabel}
        values={PICKER_RUNTIMES}
        value={options.maxRuntime}
        labelFor={TONIGHT_PICKER.runtime}
        onChange={v => setOption('maxRuntime', v)}
      />

      <div className="tonight-field" role="group" aria-label={TONIGHT_PICKER.genresLabel}>
        <div className="tonight-field-label">{TONIGHT_PICKER.genresLabel}</div>
        <div className="tonight-field-hint">{TONIGHT_PICKER.genresHint}</div>
        <div className="tonight-chips">
          {genres.map(g => {
            const on = options.genreIds.includes(g.id);
            return (
              <button key={g.id} type="button" aria-pressed={on} className={`tonight-chip${on ? ' active' : ''}`} onClick={() => toggleGenre(g.id)}>
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <ChipRow
        label={TONIGHT_PICKER.eraLabel}
        values={PICKER_ERAS.map(e => e.id)}
        value={options.era}
        labelFor={id => TONIGHT_PICKER.eras[id]}
        onChange={v => setOption('era', v)}
      />
      <ChipRow
        label={TONIGHT_PICKER.scoreLabel}
        values={PICKER_MIN_SCORES}
        value={options.minScore}
        labelFor={TONIGHT_PICKER.score}
        onChange={v => setOption('minScore', v)}
      />
      <ChipRow
        label={TONIGHT_PICKER.languageLabel}
        values={PICKER_LANGUAGES}
        value={options.language}
        labelFor={code => TONIGHT_PICKER.languages[code ?? 'any']}
        onChange={v => setOption('language', v)}
      />

      <div className="tonight-field" role="group" aria-label={TONIGHT_PICKER.limitLabel}>
        <div className="tonight-field-label">{TONIGHT_PICKER.limitLabel}</div>
        <Check
          checked={options.onlyServices && picker.hasServices}
          disabled={!picker.hasServices}
          label={TONIGHT_PICKER.onlyServices}
          hint={picker.hasServices ? null : TONIGHT_PICKER.onlyServicesMissing}
          onChange={v => setOption('onlyServices', v)}
        />
        <Check
          checked={options.onlyWatchlist && picker.hasWatchlist}
          disabled={!picker.hasWatchlist}
          label={TONIGHT_PICKER.onlyWatchlist}
          hint={picker.hasWatchlist ? null : TONIGHT_PICKER.onlyWatchlistMissing}
          onChange={v => setOption('onlyWatchlist', v)}
        />
      </div>

      <div className="tonight-actions">
        <button type="button" className="btn btn-primary tonight-go" onClick={() => picker.go('three')}>{TONIGHT_PICKER.go}</button>
        <button type="button" className="btn btn-secondary" onClick={() => picker.go('random')}>{TONIGHT_PICKER.randomSelect}</button>
      </div>
    </section>
  );
}

/* Slot-machine reels: one per result slot. Pure CSS motion; the hook keeps
   the phase up for at least PICKER_MIN_SPIN_MS so it always reads as a spin. */
function Spinner({ slots }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine(n => (n + 1) % TONIGHT_PICKER.spinning.length), 450);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="tonight-spin" aria-live="polite" aria-busy="true">
      <div className={`tonight-reels tonight-reels--${slots}`}>
        {Array.from({ length: slots }, (_, i) => (
          <div key={i} className="tonight-reel" style={{ '--reel-delay': `${i * 90}ms` }}>
            <div className="tonight-reel-strip">
              {Array.from({ length: 8 }, (_, j) => <span key={j} className="tonight-reel-frame" />)}
            </div>
          </div>
        ))}
      </div>
      <p className="tonight-spin-line">{TONIGHT_PICKER.spinning[line]}…</p>
    </section>
  );
}

function ResultCard({ item, index, onOpen }) {
  const img = posterUrl(item.poster_path, 'w342');
  const meta = [
    (item.release_date || '').slice(0, 4),
    item.runtime ? TONIGHT_PICKER.minutes(item.runtime) : null,
    item.vote_average ? TONIGHT_PICKER.score10(item.vote_average) : null,
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" className="tonight-result interactive-surface" style={{ '--reveal-delay': `${index * 120}ms` }} onClick={() => onOpen(item)}>
      <div className="tonight-result-img">
        {img ? <img src={img} alt="" /> : <div className="media-card-img-placeholder" />}
      </div>
      <div className="tonight-result-title">{item.title}</div>
      {meta && <div className="tonight-result-meta">{meta}</div>}
      {item.onWatchlist && <div className="tonight-result-tag">{TONIGHT_PICKER.onYourWatchlist}</div>}
    </button>
  );
}

/* Presentational: every piece of state arrives as a prop so Storybook can
   render each state without an auth session or network. */
export function TonightPage({ premium, picker, onOpen, navigate }) {
  return (
    <div className="tonight-view">
      <div className="view-header">
        <h1 className="view-title">{TONIGHT_PICKER.title}</h1>
        <p className="tonight-intro">{TONIGHT_PICKER.intro}</p>
      </div>

      {!premium ? <PremiumGate navigate={navigate} />
        : picker.phase === 'spinning' ? <Spinner slots={PICKER_MODES[picker.mode]} />
        : picker.phase === 'setup' ? <OptionsPanel picker={picker} />
        : (
          <section className="tonight-results-wrap" aria-live="polite">
            {picker.phase === 'results' ? (
              <>
                <h2 className="rail-title tonight-results-title">
                  {picker.mode === 'random' ? TONIGHT_PICKER.randomTitle : TONIGHT_PICKER.resultsTitle}
                </h2>
                <div className={`tonight-results tonight-results--${picker.results.length}`}>
                  {picker.results.map((item, i) => <ResultCard key={item.id} item={item} index={i} onOpen={onOpen} />)}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-title">{picker.phase === 'error' ? TONIGHT_PICKER.loadError : TONIGHT_PICKER.emptyTitle}</div>
                {picker.phase === 'empty' && <div className="empty-body">{TONIGHT_PICKER.emptyBody}</div>}
              </div>
            )}
            <div className="tonight-actions tonight-actions--center">
              {picker.phase === 'results' && (
                <button type="button" className="btn btn-primary" onClick={picker.spinAgain}>{TONIGHT_PICKER.spinAgain}</button>
              )}
              <button type="button" className="btn btn-secondary" onClick={picker.backToOptions}>{TONIGHT_PICKER.changeOptions}</button>
            </div>
          </section>
        )}
    </div>
  );
}

export default function TonightView() {
  const { user, profile, watchlist, openPanel } = useApp();
  const navigate = useNavigate();
  const premium = isPremiumProfile(profile);

  const picker = useTonightPicker({
    enabled: premium,
    userId: user?.id,
    watchlistItems: watchlist.items,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
    hideKids: !(profile?.include_kids_content ?? true),
  });

  return (
    <TonightPage
      premium={premium}
      picker={picker}
      onOpen={(item) => openPanel(item.id, 'movie')}
      navigate={navigate}
    />
  );
}
