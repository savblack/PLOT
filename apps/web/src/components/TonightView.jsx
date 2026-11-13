import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { useApp } from '../hooks/useApp.js';
import {
  useTonightPicker, pickerTimeOfDay, savedSearchDate, PICKER_LANGUAGES, pickResultMeta,
} from '../hooks/useTonightPicker.js';
import { TONIGHT_PICKER as T } from '../copy/tonightPicker.js';
import { readStorage, writeStorage, removeStorage } from '../utils/storage.js';
import { posterUrl, backdropUrl } from '../utils/images.js';
import { SettingsSwitch } from './SettingsPage.jsx';
import SmartListDialog from './SmartListDialog.jsx';
import { smartListRulesFromPicker } from '@plot/core/smartLists.js';
import { collectionPath, customListKey } from '@plot/core/listCollections.js';
import { favoriteWords } from '../utils/spelling.js';
import './TonightView.css';
import { SaveButton, FavoriteButton } from './TitleActions.jsx';
import { Tag } from './Chip.jsx';
import EmptyState from './EmptyState.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import TonightShelves, { PickForMe, ShelfChips } from './TonightShelves.jsx';

/* Just Decide (Nov 2026 redesign, option D). It opens on chips and shelves
   of titles that fit tonight (TonightShelves.jsx), laid out like Home.
   "Pick one for me" and "Surprise me" run the picker on the chips' options
   and show its results here; Free viewers get one pick a day, then the
   upgrade sheet. Phone keeps the actions in a bar above the tab bar. The
   title and subline come from the app shell. */

const IconSparkle = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 3.5 11.6 8.4 16.5 10 11.6 11.6 10 16.5 8.4 11.6 3.5 10 8.4 8.4Z" /><path d="M18 14.5v5M15.5 17h5" /><path d="M18.5 3.5v3M17 5h3" /></svg>
);
const IconChevron = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>;

// Two arrows round: a list that keeps looking (A1).
const IconKeepFinding = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>
);

const IconClose = () => <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>;
// A pin, not the bookmark: the bookmark means the watchlist everywhere else.
const IconPin = ({ filled }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={filled ? 'filled' : undefined}><path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></svg>
);

/* Saved searches: the desktop side card and the phone section share rows. */
// Two rows until opened, so the desktop column fits a laptop window without scrolling.
const SAVED_SHOWN = 2;
function SavedSearches({ picker, className = '' }) {
  const [all, setAll] = useState(false);
  if (!picker.savedSearches?.length) return null;
  const shown = all ? picker.savedSearches : picker.savedSearches.slice(0, SAVED_SHOWN);
  return (
    <section className={`hist-card tonight-saved ${className}`} aria-label={T.savedTitle}>
      <div className="hist-card-head"><span className="hist-card-title">{T.savedTitle}</span></div>
      <ul className="tonight-saved-list">
        {shown.map(item => (
          <li key={item.id} className="tonight-saved-row">
            <button type="button" className="tonight-saved-open" onClick={() => picker.openSavedSearch(item.id)}>
              <span className="tonight-saved-label" title={item.label}>{item.label}</span>
              <span className="tonight-saved-meta">{T.savedMeta(item.results.length, savedSearchDate(item.savedAt))}</span>
            </button>
            <button type="button" className="tonight-saved-remove" aria-label={T.removeSaved(item.label)} onClick={() => picker.removeSavedSearch(item.id)}><IconClose /></button>
          </li>
        ))}
      </ul>
      {picker.savedSearches.length > SAVED_SHOWN && (
        <button type="button" className="tonight-saved-more" onClick={() => setAll(v => !v)}>
          {all ? T.savedFewer : T.savedAll(picker.savedSearches.length)}
        </button>
      )}
    </section>
  );
}

/* What sits behind the upgrade pop-up: the results layout with no titles or
   images, blurred. Nothing here is fetched. */
function LockedPreview() {
  return (
    <div className="tonight-locked-preview" aria-hidden="true">
      <div className="discover-section-title">{T.heading[pickerTimeOfDay()]}</div>
      <div className="tonight-results-list">
        <div className="tonight-hero tonight-hero--placeholder"><span className="tonight-hero-body"><Tag tone="artwork" label={T.topPick} /></span></div>
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

/* Free viewers answer every question; Go and Surprise me open the upgrade
   sheet over the blurred preview. Their answers are kept (see
   useTonightPicker), so upgrading lands them back on their request with the
   picks drawn. The sheet reports `premium_gate_hit` (tonight_picker). */







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


/* "Finding…": the viewer's own sentence, answered phrases highlighted one by
   one while picks load. It sits where the Top pick will land, so when the
   picks arrive the words dissolve into the image (see Results `reveal`). */
function FindingSentence({ parts, className = '' }) {
  let filled = 0;
  return (
    <p className={`tonight-finding ${className}`}>
      <span>{parts.map((p, i) => {
        const text = i === 0 ? T.sentence.finding : p.text;
        const hl = p.kind === 'filled' ? filled++ : -1;
        return (
          <span key={i}>
            {i > 0 && ' '}
            {hl >= 0 ? <span className="tonight-finding-hl" style={{ '--hl-delay': `${hl * 300}ms` }}>{text}</span> : text}
          </span>
        );
      })}</span>
    </p>
  );
}

function Finding({ picker }) {
  return (
    <section className="tonight-results" aria-live="polite" aria-busy="true">
      <div className="tonight-results-head tonight-results-head--hidden" aria-hidden="true">
        <span className="discover-section-title">{T.heading[pickerTimeOfDay()]}</span>
      </div>
      <div className="tonight-results-list">
        <div className="tonight-hero-slot tonight-hero-slot--finding"><FindingSentence parts={picker.sentence} /></div>
      </div>
    </section>
  );
}

function Chips({ item }) {
  if (!item.onWatchlist) return null;
  return <Tag tone="sage" label={T.onYourWatchlist} />;
}

/* Favourite and watchlist, the same buttons as on Home: on the Top pick the
   hero's corner buttons, on cards the Top 20 chart row's buttons on the
   right. Desktop reveals them on hover; touch screens always show them.
   `actions` is absent in stories without them. */
function FavSave({ item, actions, variant }) {
  if (!actions) return null;
  const { watchlist, favorites, favWords } = actions;
  const typed = { ...item, media_type: item.media_type || 'movie' };
  if (variant === 'hero') {
    return (
      <div className="discover-hero-corner-btns">
        <FavoriteButton variant="hero" item={typed} favorites={favorites} favWords={favWords} style={{ top: 10, left: 10 }} />
        <SaveButton variant="hero" item={typed} watchlist={watchlist} source="tonight" style={{ top: 10, right: 10 }} />
      </div>
    );
  }
  // Cards: Home's chart-row buttons on the right, revealed on hover.
  return (
    <span className="tonight-card-actions search-row-actions">
      <FavoriteButton variant="row" item={typed} favorites={favorites} favWords={favWords} />
      <SaveButton variant="row" item={typed} watchlist={watchlist} source="tonight" />
    </span>
  );
}

/* Tiles are not buttons themselves, so the favourite and watchlist buttons can
   sit inside them: the title is the button, stretched over the whole tile. */
function TopPick({ item, onOpen, actions, className = '' }) {
  const bg = backdropUrl(item.backdrop_path, 'w1280') || posterUrl(item.poster_path, 'w780');
  return (
    <div className={`tonight-hero ${className}`}>
      {bg && <img src={bg} alt="" />}
      <span className="tonight-hero-scrim" aria-hidden="true" />
      <span className="tonight-hero-body">
        <Tag tone="artwork" label={T.topPick} />
        <button type="button" className="tonight-hero-title tonight-tile-open" onClick={() => onOpen(item)}>{item.title}</button>
        <span className="tonight-hero-meta">{pickResultMeta(item)}</span>
      </span>
      <FavSave item={item} actions={actions} variant="hero" />
    </div>
  );
}

function PickCard({ item, index, onOpen, reveal, actions }) {
  const img = posterUrl(item.poster_path, 'w185');
  return (
    <div className={`tonight-card${reveal ? ' tonight-card--dissolve' : ''}`}
      style={reveal ? { '--dissolve-delay': `${600 + index * 250}ms` } : { '--reveal-delay': `${(index + 1) * 90}ms` }}>
      <span className="tonight-card-poster">{img ? <img src={img} alt="" loading="lazy" /> : null}</span>
      <span className="tonight-card-body">
        <button type="button" className="tonight-card-title tonight-tile-open" onClick={() => onOpen(item)}>{item.title}</button>
        <span className="tonight-card-meta">{pickResultMeta(item)}</span>
        <Chips item={item} />
      </span>
      <FavSave item={item} actions={actions} />
    </div>
  );
}

/* `reveal`: straight after a pick, the "Finding…" sentence dissolves into the
   Top pick in the same spot, the heading and Save are simply there, and the
   cards dissolve in one by one. Reopened or restored picks skip this. */
function Results({ picker, onOpen, reveal, actions, onKeepFinding }) {
  if (picker.phase !== 'results') {
    return (
      <EmptyState className="tonight-empty" title={picker.phase === 'error' ? T.loadError : T.emptyTitle} body={picker.phase === 'empty' ? T.emptyBody : undefined} />
    );
  }
  const [top, ...rest] = picker.results;
  return (
    <section className="tonight-results" aria-live="polite">
      <div className="tonight-results-head">
        <h2 className="discover-section-title">{T.heading[pickerTimeOfDay()]}</h2>
        <div className="tonight-results-actions">
          {/* A1: save the answers as a smart list, beside Save search (the snapshot). */}
          {onKeepFinding && <span className="tonight-keep-hint">{T.createSmartListHint}</span>}
          {picker.canSave && (
            <button type="button" className={`btn btn-secondary btn-sm tonight-save${picker.isSaved ? ' saved' : ''}`}
              aria-pressed={picker.isSaved} aria-label={picker.isSaved ? T.savedLabel : T.saveLabel} onClick={picker.toggleSaveSearch}>
              <IconPin filled={picker.isSaved} />{picker.isSaved ? T.saved : T.save}
            </button>
          )}
          {onKeepFinding && (
            <button type="button" className="btn btn-primary btn-sm tonight-keep" onClick={onKeepFinding}>
              <IconKeepFinding />{T.createSmartList}
            </button>
          )}
        </div>
      </div>
      <div className="tonight-results-list">
        {top && (
          <div className="tonight-hero-slot">
            <TopPick item={top} onOpen={onOpen} actions={actions} className={reveal ? 'tonight-hero--dissolve' : ''} />
            {reveal && <FindingSentence parts={picker.sentence} className="tonight-finding--out" />}
          </div>
        )}
        {rest.length > 0 && (
          <div className="tonight-cards">
            {rest.map((item, i) => <PickCard key={item.id} item={item} index={i} onOpen={onOpen} reveal={reveal} actions={actions} />)}
          </div>
        )}
      </div>
    </section>
  );
}

/* Presentational: every piece of state arrives as a prop so Storybook can
   render each state without an auth session or network. */
/**
 * `smartList`: what "Create smart list" needs (the viewer's lists, how to
 * create one, and in Storybook a genre catalog and a count). Absent, the
 * button is not shown.
 */
export function TonightPage({ premium, picker, onOpen, navigate, actions, smartList = null, useShelves }) {
  const [keepFinding, setKeepFinding] = useState(false);
  const locked = picker.phase === 'locked';
  const inResults = picker.phase === 'results' || picker.phase === 'empty' || picker.phase === 'error';
  const spinning = picker.phase === 'spinning';
  // Picks that arrive straight from a spin get the reveal; anything else
  // (a saved search, a restored page) shows as is.
  const [lastPhase, setLastPhase] = useState(picker.phase);
  const [reveal, setReveal] = useState(false);
  if (picker.phase !== lastPhase) {
    setLastPhase(picker.phase);
    setReveal(picker.phase === 'results' ? lastPhase === 'spinning' || reveal : false);
  }

  // History's frame in every state: the request on the left (chips, Pick,
  // filters, saved searches), the shelves or the picks on the right.
  const side = (
    <aside className="hist-side tonight-side">
      {inResults ? (
        <section className="hist-card tonight-side-card">
          <div className="hist-card-head"><span className="hist-card-title">{T.yourRequest}</span></div>
          <div className="tonight-side-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={picker.backToOptions}>{T.changeOptions}</button>
            {picker.canSpinAgain && <button type="button" className="btn btn-primary btn-sm" onClick={picker.spinAgain}>{T.spinAgain}</button>}
          </div>
        </section>
      ) : (
        <section className="hist-card tonight-side-card" aria-label={T.chips.label}>
          <div className="hist-card-head"><span className="hist-card-title">{T.chips.label}</span></div>
          <ShelfChips picker={picker} />
          <div className="tonight-side-actions tonight-side-actions--desk">
            <PickForMe picker={picker} premium={premium} className="btn-sm" />
            <button type="button" className="btn btn-secondary btn-sm tonight-surprise" onClick={() => picker.go('surprise')}><IconSparkle />{T.surpriseMe}</button>
          </div>
          {picker.freePickLeft && <p className="tonight-hint tonight-side-actions--desk">{T.freePickNote}</p>}
        </section>
      )}
      {!inResults && <FiltersPanel picker={picker} />}
      <SavedSearches picker={picker} />
    </aside>
  );

  return (
    <div className="hist-page tonight-view">
      <div className="hist-body">
        {!locked && !spinning && side}
        <div className="hist-stream tonight-stream">
          {locked ? (
            <div className="tonight-locked">
              <LockedPreview />
              <UpgradeSheet reason="justDecide" onClose={picker.closeLock} />
            </div>
          ) : spinning ? <Finding picker={picker} />
            : inResults ? (
              <Results picker={picker} onOpen={onOpen} reveal={reveal} actions={actions}
                onKeepFinding={smartList && premium && picker.phase === 'results' ? () => setKeepFinding(true) : null} />
            ) : <TonightShelves picker={picker} premium={premium} useShelves={useShelves} />}
        </div>
      </div>

      {keepFinding && smartList && (
        <SmartListDialog
          origin="picker"
          initialRules={smartListRulesFromPicker(picker.options, { hasServices: picker.hasServices })}
          lists={smartList.lists}
          onConfirm={async (name, rules) => {
            // Undo in the toast deletes the list and comes back here.
            let path = null;
            const created = await smartList.create(name, rules, {
              undo: true,
              onUndone: () => { if (path && window.location.pathname === path) navigate?.(-1); },
            });
            if (created) {
              setKeepFinding(false);
              path = collectionPath(customListKey(created.id));
              navigate?.(path);
            }
            return created;
          }}
          onClose={() => setKeepFinding(false)}
          onPremium={() => setKeepFinding(false)}
          catalog={smartList.catalog ?? null}
          preview={smartList.preview ?? null}
        />
      )}

      {/* Phone only: the actions stay in reach above the tab bar. */}
      {!spinning && !locked && (
        <div className="tonight-bar">
          <div className="tonight-bar-actions">
            {inResults ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={picker.backToOptions}>{T.changeOptions}</button>
                {picker.canSpinAgain && <button type="button" className="btn btn-primary" onClick={picker.spinAgain}>{T.spinAgain}</button>}
              </>
            ) : (
              <>
                <button type="button" className="btn btn-secondary tonight-surprise" onClick={() => picker.go('surprise')}><IconSparkle />{T.surpriseMe}</button>
                <PickForMe picker={picker} premium={premium} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PICKER_STORAGE = { getItem: (k) => readStorage(k), setItem: writeStorage, removeItem: removeStorage };

export default function TonightView() {
  const { user, profile, watchlist, favorites, customLists, openPanel } = useApp();
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
      onOpen={(item) => { picker.openPick(item); openPanel(item.id, item.media_type); }}
      navigate={navigate}
      actions={{ watchlist, favorites, favWords: favoriteWords(profile?.region) }}
      smartList={customLists?.createSmartList ? {
        lists: [...(customLists.lists || []), ...(customLists.smartLists || [])],
        create: customLists.createSmartList,
      } : null}
    />
  );
}
