import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { useApp } from '../hooks/useApp.js';
import {
  useTonightPicker, pickerTimeOfDay,
  PICKER_STEPS, PICKER_RUNTIMES, PICKER_TV_FORMATS, PICKER_EPISODE_RUNTIMES,
  PICKER_ERAS, PICKER_MIN_SCORES, PICKER_LANGUAGES, PICKER_MODES, FEATURED_GENRE_COUNT,
} from '../hooks/useTonightPicker.js';
import { TONIGHT_PICKER as T } from '../copy/tonightPicker.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { posterUrl, backdropUrl } from '../utils/images.js';
import { EVENTS, track } from '../lib/analytics.js';
import { SettingsSwitch } from './SettingsPage.jsx';
import './TonightView.css';

/* Pick a Plot. Phone: one column, a Filters panel that folds away, and a
   sticky bar with the sentence and Go. Desktop (>=1024px): the same 264px
   side column of cards as History and Settings (your request, the four
   questions, filters) beside the current question. Both layouts render; CSS
   shows one. The title and subline come from the app shell. */

const IconSparkle = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 3.5 11.6 8.4 16.5 10 11.6 11.6 10 16.5 8.4 11.6 3.5 10 8.4 8.4Z" /><path d="M18 14.5v5M15.5 17h5" /><path d="M18.5 3.5v3M17 5h3" /></svg>
);
const IconBack = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>;
const IconNext = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>;
const IconChevron = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>;
const IconTick = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>;
const IconMovie = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2" /><path d="m3 6 3-3M9 6l3-3M15 6l3-3M3 10h18" /></svg>
);
const IconTv = () => <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="13" rx="2" /><path d="M8 21h8M12 18v3" /></svg>;

function PremiumGate({ navigate }) {
  useEffect(() => { track(EVENTS.PREMIUM_GATE_HIT, { feature: 'tonight_picker' }); }, []);
  return (
    <div className="empty-state tonight-gate">
      <div className="empty-title">{T.gateTitle}</div>
      <div className="empty-body">{T.gateBody}</div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(premiumPlansPath('/tonight'))}>
        {PLANS_PAGE.previewAction}
      </button>
    </div>
  );
}

function Sentence({ parts, className = '' }) {
  return (
    <p className={`tonight-sentence ${className}`} aria-live="polite">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span className={p.kind === 'plain' ? undefined : `tonight-sentence-${p.kind}`}>{p.text}</span>
        </span>
      ))}
    </p>
  );
}

function Tile({ selected, onClick, label, hint, role = 'radio' }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      className={`tonight-tile${selected ? ' selected' : ''}`}
      onClick={onClick}
    >
      <span className="tonight-tile-label">{label}</span>
      {hint && <span className="tonight-tile-hint">{hint}</span>}
    </button>
  );
}

function Progress({ step }) {
  return (
    <div className="tonight-progress" role="progressbar" aria-label={T.progress(step + 1, PICKER_STEPS.length)} aria-valuemin={1} aria-valuemax={PICKER_STEPS.length} aria-valuenow={step + 1}>
      {PICKER_STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : undefined} />)}
    </div>
  );
}

/* ── The four questions ── */
function Question({ picker }) {
  const { options, setOption, toggleGenre, genres, step, nextStep } = picker;
  const [allGenres, setAllGenres] = useState(false);
  const tv = options.mediaType === 'tv';
  const key = PICKER_STEPS[step];
  const title = key === 'length' ? (tv ? T.steps.length.tvTitle : T.steps.length.movieTitle) : T.steps[key].title;
  const subline = T.steps[key].subline;
  const shownGenres = allGenres ? genres : genres.slice(0, FEATURED_GENRE_COUNT);

  return (
    <section className="tonight-question" aria-labelledby="tonight-question-title">
      <h2 id="tonight-question-title" className="tonight-question-title">{title}</h2>
      {subline && <p className="tonight-question-sub">{subline}</p>}
      <Progress step={step} />

      {key === 'type' && (
        <div className="tonight-tiles tonight-tiles--type" role="radiogroup" aria-label={title}>
          {['movie', 'tv'].map(t => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={options.mediaType === t}
              className={`tonight-type${options.mediaType === t ? ' selected' : ''}`}
              onClick={() => { setOption('mediaType', t); nextStep(); }}
            >
              {t === 'movie' ? <IconMovie /> : <IconTv />}
              <span className="tonight-type-text">
                <span className="tonight-type-label">{T.mediaTypes[t].label}</span>
                <span className="tonight-tile-hint">{T.mediaTypes[t].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {key === 'length' && !tv && (
        <div className="tonight-tiles tonight-tiles--two" role="radiogroup" aria-label={title}>
          {PICKER_RUNTIMES.map(m => (
            <Tile key={m ?? 'any'} label={T.runtimes(m)} selected={options.maxRuntime === m}
              onClick={() => { setOption('maxRuntime', m); nextStep(); }} />
          ))}
        </div>
      )}
      {key === 'length' && tv && (
        <>
          <div className="tonight-group-label">{T.tvFormatLabel}</div>
          <div className="tonight-tiles tonight-tiles--two" role="radiogroup" aria-label={T.tvFormatLabel}>
            {PICKER_TV_FORMATS.map(f => (
              <Tile key={f} label={T.tvFormats[f]} selected={options.tvFormat === f} onClick={() => setOption('tvFormat', f)} />
            ))}
          </div>
          <div className="tonight-group-label">{T.episodeLabel}</div>
          <div className="tonight-tiles tonight-tiles--four" role="radiogroup" aria-label={T.episodeLabel}>
            {PICKER_EPISODE_RUNTIMES.map(m => (
              <Tile key={m ?? 'any'} label={T.episodeRuntime(m)} selected={options.maxEpisodeRuntime === m} onClick={() => setOption('maxEpisodeRuntime', m)} />
            ))}
          </div>
        </>
      )}

      {key === 'kind' && (
        <>
          <div className="tonight-tiles tonight-tiles--genres" role="group" aria-label={title}>
            {shownGenres.map(g => (
              <Tile key={g.id} role="checkbox" label={g.name} hint={g.mood} selected={options.genreIds.includes(g.id)} onClick={() => toggleGenre(g.id)} />
            ))}
          </div>
          {genres.length > FEATURED_GENRE_COUNT && (
            <button type="button" className="tonight-link" onClick={() => setAllGenres(v => !v)}>
              {allGenres ? T.showFewerGenres : T.showAllGenres(genres.length)}
            </button>
          )}
        </>
      )}

      {key === 'quality' && (
        <>
          <div className="tonight-group-label">{T.eraLabel}</div>
          <div className="tonight-tiles tonight-tiles--three" role="radiogroup" aria-label={T.eraLabel}>
            {PICKER_ERAS.map(e => (
              <Tile key={e.id} label={T.eras[e.id]} selected={options.era === e.id} onClick={() => setOption('era', e.id)} />
            ))}
          </div>
          <div className="tonight-group-label">{T.scoreLabel}</div>
          <div className="tonight-tiles tonight-tiles--four" role="radiogroup" aria-label={T.scoreLabel}>
            {PICKER_MIN_SCORES.map(m => (
              <Tile key={m ?? 'any'} label={T.score(m)} selected={options.minScore === m} onClick={() => setOption('minScore', m)} />
            ))}
          </div>
          <p className="tonight-hint">{T.scoreHint}</p>
        </>
      )}
    </section>
  );
}

function StepNav({ picker }) {
  const first = picker.step === 0;
  const last = picker.step === PICKER_STEPS.length - 1;
  return (
    <div className="tonight-stepnav">
      {first ? <span /> : <button type="button" className="btn btn-secondary btn-sm tonight-stepbtn" onClick={picker.prevStep}><IconBack />{T.back}</button>}
      {last ? <span /> : <button type="button" className="btn btn-secondary btn-sm tonight-stepbtn" onClick={picker.nextStep}>{T.next}<IconNext /></button>}
    </div>
  );
}

function LanguageSelect({ picker, id }) {
  return (
    <select
      id={id}
      className="tonight-select"
      value={picker.options.language ?? ''}
      onChange={e => picker.setOption('language', e.target.value || null)}
    >
      {PICKER_LANGUAGES.map(code => <option key={code ?? 'any'} value={code ?? ''}>{T.languages[code ?? 'any']}</option>)}
    </select>
  );
}

/* Phone: folding panel with switches, like Settings rows. */
function FiltersPanel({ picker }) {
  const [open, setOpen] = useState(false);
  const { options, setOption } = picker;
  const switchRow = (label, checked, onChange, disabled, hint) => (
    <div className={`tonight-filter-row${disabled ? ' disabled' : ''}`}>
      <span>
        <span className="tonight-filter-label">{label}</span>
        {hint && <span className="tonight-filter-hint">{hint}</span>}
      </span>
      <SettingsSwitch label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
  return (
    <section className="tonight-filters">
      <button type="button" className="tonight-filters-head" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className="tonight-filter-label">{T.filtersTitle}</span>
        <span className="tonight-filters-summary">
          {open ? null : picker.filtersSummary}
          <span className={`tonight-chev${open ? ' open' : ''}`}><IconChevron /></span>
        </span>
      </button>
      {open && (
        <div className="tonight-filters-body">
          {switchRow(T.onlyServices, options.onlyServices && picker.hasServices, () => setOption('onlyServices', !options.onlyServices), !picker.hasServices, picker.hasServices ? null : T.onlyServicesMissing)}
          {switchRow(T.onlyWatchlist, options.onlyWatchlist && picker.hasWatchlist, () => setOption('onlyWatchlist', !options.onlyWatchlist), !picker.hasWatchlist, picker.hasWatchlist ? null : T.onlyWatchlistMissing(options.mediaType))}
          {switchRow(T.hideKids, options.hideKids, () => setOption('hideKids', !options.hideKids), false, null)}
          <div className="tonight-filter-row">
            <label className="tonight-filter-label" htmlFor="tonight-lang-m">{T.languageLabel}</label>
            <LanguageSelect picker={picker} id="tonight-lang-m" />
          </div>
        </div>
      )}
    </section>
  );
}

/* Desktop side column: the same card and filter-row styles History uses. */
function SideColumn({ picker, results }) {
  const { options, setOption } = picker;
  const tickRow = (label, on, onToggle, disabled) => (
    <button type="button" role="checkbox" aria-checked={on} disabled={disabled}
      className={`cal-filter-row${on ? '' : ' cal-filter-row--off'}`} onClick={onToggle}>
      <span className="cal-filter-name">{label}</span>
      {on && <span className="cal-filter-tick"><IconTick /></span>}
    </button>
  );
  return (
    <aside className="tonight-side">
      <section className="hist-card" aria-label={T.yourRequest}>
        <div className="hist-card-head"><span className="hist-card-title">{T.yourRequest}</span></div>
        <Sentence parts={picker.sentence} className="tonight-sentence--side" />
        <div className="tonight-side-actions">
          {results ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={picker.backToOptions}>{T.changeOptions}</button>
              {picker.canSpinAgain && <button type="button" className="btn btn-primary btn-sm" onClick={picker.spinAgain}>{T.spinAgain}</button>}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm tonight-surprise" onClick={() => picker.go('surprise')}><IconSparkle />{T.surpriseMe}</button>
              <button type="button" className="btn btn-primary btn-sm tonight-go" onClick={() => picker.go('five')}>{T.go}</button>
            </>
          )}
        </div>
      </section>

      <section className="hist-card" aria-label={T.questionsTitle}>
        <div className="hist-card-head"><span className="hist-card-title">{T.questionsTitle}</span></div>
        <div>
          {PICKER_STEPS.map((key, i) => {
            const current = !results && picker.step === i;
            return (
              <button key={key} type="button" className="tonight-qrow" aria-current={current ? 'step' : undefined} onClick={() => picker.goToStep(i)}>
                <span className={`tonight-qnum${current ? ' current' : ''}`}>{i + 1}</span>
                <span className="tonight-qtext">
                  <span className="tonight-qtitle">{T.steps[key].shortTitle}</span>
                  <span className="tonight-qanswer">{picker.answers[key]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="hist-card" aria-label={T.filtersTitle}>
        <div className="cal-filter">
          <div className="cal-filter-label">{T.filtersTitle}</div>
          <div>
            {tickRow(T.onlyServices, options.onlyServices && picker.hasServices, () => setOption('onlyServices', !options.onlyServices), !picker.hasServices)}
            {tickRow(T.onlyWatchlist, options.onlyWatchlist && picker.hasWatchlist, () => setOption('onlyWatchlist', !options.onlyWatchlist), !picker.hasWatchlist)}
            {tickRow(T.hideKids, options.hideKids, () => setOption('hideKids', !options.hideKids), false)}
            <div className="cal-filter-row tonight-lang-row">
              <label className="cal-filter-name" htmlFor="tonight-lang-d">{T.languageLabel}</label>
              <LanguageSelect picker={picker} id="tonight-lang-d" />
            </div>
          </div>
        </div>
      </section>
    </aside>
  );
}

/* Slot-machine reels (three stand in for five). The hook holds the phase
   for at least PICKER_MIN_SPIN_MS so it always reads as a spin. */
function Spinner({ mode }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine(n => (n + 1) % T.spinning.length), 450);
    return () => clearInterval(t);
  }, []);
  const slots = Math.min(3, PICKER_MODES[mode] ?? 3);
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
      <p className="tonight-spin-line">{T.spinning[line]}…</p>
    </section>
  );
}

function resultMeta(item) {
  const tv = item.media_type === 'tv';
  return [
    (item.release_date || '').slice(0, 4),
    tv && item.miniseries ? T.miniseries : null,
    tv && !item.miniseries && item.seasons ? T.seasons(item.seasons) : null,
    item.runtime ? (tv ? T.episodeMinutes(item.runtime) : T.minutes(item.runtime)) : null,
    item.vote_average ? T.score10(item.vote_average) : null,
  ].filter(Boolean).join(' · ');
}

function Chips({ item }) {
  if (!item.onWatchlist) return null;
  return (
    <span className="tonight-chips">
      <span className="tonight-chip">{T.onYourWatchlist}</span>
    </span>
  );
}

function TopPick({ item, onOpen }) {
  const bg = backdropUrl(item.backdrop_path, 'w1280') || posterUrl(item.poster_path, 'w780');
  return (
    <button type="button" className="tonight-hero" onClick={() => onOpen(item)}>
      {bg && <img src={bg} alt="" />}
      <span className="tonight-hero-scrim" aria-hidden="true" />
      <span className="tonight-hero-body">
        <span className="tonight-hero-chip">{T.topPick}</span>
        <span className="tonight-hero-title">{item.title}</span>
        <span className="tonight-hero-meta">{resultMeta(item)}</span>
      </span>
    </button>
  );
}

function PickCard({ item, index, onOpen }) {
  const img = posterUrl(item.poster_path, 'w185');
  return (
    <button type="button" className="tonight-card" onClick={() => onOpen(item)} style={{ '--reveal-delay': `${(index + 1) * 90}ms` }}>
      <span className="tonight-card-poster">{img ? <img src={img} alt="" loading="lazy" /> : null}</span>
      <span className="tonight-card-body">
        <span className="tonight-card-title">{item.title}</span>
        <span className="tonight-card-meta">{resultMeta(item)}</span>
        <Chips item={item} />
      </span>
    </button>
  );
}

function Results({ picker, onOpen }) {
  if (picker.phase !== 'results') {
    return (
      <div className="empty-state tonight-empty">
        <div className="empty-title">{picker.phase === 'error' ? T.loadError : T.emptyTitle}</div>
        {picker.phase === 'empty' && <div className="empty-body">{T.emptyBody}</div>}
      </div>
    );
  }
  const [top, ...rest] = picker.results;
  return (
    <section className="tonight-results" aria-live="polite">
      <h2 className="tonight-question-title">{T.heading[pickerTimeOfDay()]}</h2>
      <p className="tonight-question-sub">{T.resultsSubline}</p>
      <div className="tonight-results-list">
        {top && <TopPick item={top} onOpen={onOpen} />}
        {rest.length > 0 && (
          <div className="tonight-cards">
            {rest.map((item, i) => <PickCard key={item.id} item={item} index={i} onOpen={onOpen} />)}
          </div>
        )}
      </div>
    </section>
  );
}

/* Presentational: every piece of state arrives as a prop so Storybook can
   render each state without an auth session or network. */
export function TonightPage({ premium, picker, onOpen, navigate }) {
  if (!premium) return <div className="tonight-view"><PremiumGate navigate={navigate} /></div>;
  const inResults = picker.phase === 'results' || picker.phase === 'empty' || picker.phase === 'error';
  const spinning = picker.phase === 'spinning';

  return (
    <div className="tonight-view">
      <div className="tonight-layout">
        <SideColumn picker={picker} results={inResults} />
        <div className="tonight-main">
          {spinning ? <Spinner mode={picker.mode} />
            : inResults ? <Results picker={picker} onOpen={onOpen} />
            : (
              <>
                <Question picker={picker} />
                <FiltersPanel picker={picker} />
                <StepNav picker={picker} />
              </>
            )}
        </div>
      </div>

      {/* Phone only: the sentence and actions stay in reach above the tab bar. */}
      {!spinning && (
        <div className="tonight-bar">
          {inResults ? (
            <div className="tonight-bar-actions">
              <button type="button" className="btn btn-secondary" onClick={picker.backToOptions}>{T.changeOptions}</button>
              {picker.canSpinAgain && <button type="button" className="btn btn-primary" onClick={picker.spinAgain}>{T.spinAgain}</button>}
            </div>
          ) : (
            <>
              <Sentence parts={picker.sentence} />
              <div className="tonight-bar-actions">
                <button type="button" className="btn btn-secondary tonight-surprise" onClick={() => picker.go('surprise')}><IconSparkle />{T.surpriseMe}</button>
                <button type="button" className="btn btn-primary tonight-go" onClick={() => picker.go('five')}>{T.go}</button>
              </div>
            </>
          )}
        </div>
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
  });

  return (
    <TonightPage
      premium={premium}
      picker={picker}
      onOpen={(item) => openPanel(item.id, item.media_type)}
      navigate={navigate}
    />
  );
}
