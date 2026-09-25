import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { useApp } from '../hooks/useApp.js';
import {
  useTonightPicker, pickerTimeOfDay,
  PICKER_STEPS, PICKER_RUNTIMES, PICKER_TV_FORMATS, PICKER_EPISODE_RUNTIMES,
  PICKER_ERAS, PICKER_MIN_SCORES, PICKER_LANGUAGES, PICKER_MODES, FEATURED_GENRE_COUNT, FEATURED_GENRE_COUNT_WIDE,
  pickerGenreTiles,
} from '../hooks/useTonightPicker.js';
import { TONIGHT_PICKER as T } from '../copy/tonightPicker.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { readStorage, writeStorage, removeStorage } from '../utils/storage.js';
import { posterUrl, backdropUrl } from '../utils/images.js';
import { EVENTS, track } from '../lib/analytics.js';
import { SettingsSwitch } from './SettingsPage.jsx';
import './TonightView.css';

/* Pick for Me. Phone: one column, a Filters panel that folds away, and a
   sticky bar with the sentence and Pick. Desktop (>=1024px): the same 264px
   side column of cards as History and Settings (your request, the four
   questions) beside the current question, with the same Filters panel under
   it. Both layouts render; CSS shows one. The title and subline come from
   the app shell. */

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

const IconLock = () => <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const IconClose = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>;

/* What sits behind the upgrade pop-up: the results layout with no titles or
   images, blurred. Nothing here is fetched. */
function LockedPreview() {
  return (
    <div className="tonight-locked-preview" aria-hidden="true">
      <div className="tonight-question-title">{T.heading[pickerTimeOfDay()]}</div>
      <div className="tonight-results-list">
        <div className="tonight-hero tonight-hero--placeholder"><span className="tonight-hero-body"><span className="tonight-hero-chip">{T.topPick}</span></span></div>
        <div className="tonight-cards">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="tonight-card tonight-card--placeholder">
              <span className="tonight-card-poster" />
              <span className="tonight-card-body"><span className="tonight-placeholder-line" /><span className="tonight-placeholder-line tonight-placeholder-line--short" /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Free viewers answer every question; Go and Surprise me open this. Their
   answers are kept (see useTonightPicker), so upgrading lands them back on
   their request with the picks drawn. */
function UnlockDialog({ picker, navigate }) {
  const ref = useRef(null);
  useEffect(() => {
    track(EVENTS.PREMIUM_GATE_HIT, { feature: 'tonight_picker' });
    ref.current?.focus();
  }, []);
  return (
    <section ref={ref} className="tonight-unlock" role="dialog" aria-modal="false" aria-labelledby="tonight-unlock-title" tabIndex={-1}
      onKeyDown={(e) => { if (e.key === 'Escape') picker.closeLock(); }}>
      <button type="button" className="tonight-unlock-close" aria-label={T.gate.close} onClick={picker.closeLock}><IconClose /></button>
      <span className="tonight-unlock-badge" aria-label={T.gate.label}>
        <span className="tonight-unlock-brand" aria-hidden="true">{T.gate.brand}</span>
        <span aria-hidden="true">{T.gate.premium}</span>
      </span>
      <h2 id="tonight-unlock-title" className="tonight-unlock-title">{T.gate.title}</h2>
      <p className="tonight-unlock-body">{T.gate.body}</p>
      <ul className="tonight-unlock-benefits">
        {T.gate.benefits.map(b => (
          <li key={b.title}>
            <IconTick />
            <span><span className="tonight-unlock-benefit-title">{b.title}</span><span className="tonight-unlock-benefit-body">{b.body}</span></span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary tonight-unlock-cta" onClick={() => navigate(premiumPlansPath('/tonight'))}>
        {PLANS_PAGE.upgradeAction}
      </button>
      <p className="tonight-unlock-price">{PLANS_PAGE.premium.priceSummary}</p>
    </section>
  );
}

// The desktop breakpoint TonightView.css switches layouts at.
const WIDE_QUERY = '(min-width: 1024px)';
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_QUERY);
    if (!mq) return undefined;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
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
  const { options, setOption, toggleGenre, genres, step } = picker;
  const [allGenres, setAllGenres] = useState(false);
  const tv = options.mediaType === 'tv';
  const key = PICKER_STEPS[step];
  const title = key === 'length' ? (tv ? T.steps.length.tvTitle : T.steps.length.movieTitle) : T.steps[key].title;
  const subline = T.steps[key].subline;
  const wide = useWide();
  const featuredCount = wide ? FEATURED_GENRE_COUNT_WIDE : FEATURED_GENRE_COUNT;
  const shownGenres = pickerGenreTiles(genres, { count: featuredCount, all: allGenres });

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
              onClick={() => setOption('mediaType', t)}
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
              onClick={() => setOption('maxRuntime', m)} />
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
          {genres.length > featuredCount && (
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

function PickButton({ picker, premium, className = '' }) {
  return (
    <button type="button" className={`btn btn-primary tonight-go ${className}`} onClick={() => picker.go('five')}
      aria-label={premium ? undefined : `${T.go}, ${T.gate.locked}`}>
      {!premium && <IconLock />}{T.go}
    </button>
  );
}

/* On the last question Pick takes Next's place (desktop; on phone it lives in
   the sticky bar). */
function StepNav({ picker, premium }) {
  const first = picker.step === 0;
  const last = picker.step === PICKER_STEPS.length - 1;
  return (
    <div className="tonight-stepnav">
      {first ? <span /> : <button type="button" className="btn btn-secondary btn-sm tonight-stepbtn" onClick={picker.prevStep}><IconBack />{T.back}</button>}
      {last
        ? <PickButton picker={picker} premium={premium} className="btn-sm tonight-stepbtn tonight-stepnav-pick" />
        : <button type="button" className="btn btn-secondary btn-sm tonight-stepbtn" onClick={picker.nextStep}>{T.next}<IconNext /></button>}
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

/* Desktop side column: the same cards History uses. Filters sit under the
   question on both layouts, as a panel that folds away. */
function SideColumn({ picker, results }) {
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
            <div className="tonight-side-or">
              <span>{T.orSurprise}</span>
              <button type="button" className="btn btn-secondary btn-sm tonight-surprise" onClick={() => picker.go('surprise')}><IconSparkle />{T.surpriseMe}</button>
            </div>
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
  const locked = picker.phase === 'locked';
  const inResults = picker.phase === 'results' || picker.phase === 'empty' || picker.phase === 'error';
  const spinning = picker.phase === 'spinning';

  return (
    <div className="tonight-view">
      <div className="tonight-layout">
        <SideColumn picker={picker} results={inResults} />
        <div className="tonight-main">
          {locked ? (
            <div className="tonight-locked">
              <LockedPreview />
              <UnlockDialog picker={picker} navigate={navigate} />
            </div>
          ) : spinning ? <Spinner mode={picker.mode} />
            : inResults ? <Results picker={picker} onOpen={onOpen} />
            : (
              <>
                <Question picker={picker} />
                <FiltersPanel picker={picker} />
                <StepNav picker={picker} premium={premium} />
              </>
            )}
        </div>
      </div>

      {/* Phone only: the sentence and actions stay in reach above the tab bar. */}
      {!spinning && !locked && (
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
                <PickButton picker={picker} premium={premium} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const PICKER_STORAGE = { getItem: (k) => readStorage(k), setItem: writeStorage, removeItem: removeStorage };

export default function TonightView() {
  const { user, profile, watchlist, openPanel } = useApp();
  const navigate = useNavigate();
  const premium = isPremiumProfile(profile);

  const picker = useTonightPicker({
    enabled: premium,
    storage: PICKER_STORAGE,
    userId: user?.id,
    watchlistItems: watchlist.items,
    watchlistReady: !watchlist.loading,
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
