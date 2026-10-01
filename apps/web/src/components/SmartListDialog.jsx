// Create or edit a smart list's rules (Premium). The rules and what they mean
// live in @plot/core/smartLists.js; this is only the form. Mobile has no
// counterpart yet: see issue 1094 (Mobile parity: smart lists).
import { useEffect, useId, useState } from 'react';
import { tmdb } from '@plot/core/tmdb.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { isCustomListLimitError, isSmartListPremiumError } from '@plot/core/customListCreation.js';
import {
  SMART_LIST_ERAS, SMART_LIST_MEDIA_TYPES, SMART_LIST_MIN_SCORES, SMART_LIST_MOVIE_RUNTIMES,
  SMART_LIST_EPISODE_RUNTIMES, SMART_LIST_MY_RATINGS, SMART_LIST_SOURCES,
  defaultSmartListRules, normalizeSmartListRules, smartListGenres,
} from '@plot/core/smartLists.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { TONIGHT_PICKER } from '@plot/core/copy/tonightPicker.js';
import { COMMON } from '../copy/common.js';
import { useApp } from '../hooks/useApp.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import './SmartListDialog.css';

const T = TONIGHT_PICKER;

// One catalog request per session; an empty answer stays retryable.
let catalogPromise = null;
function useGenreCatalog() {
  const [catalog, setCatalog] = useState({ movie: [], tv: [] });
  useEffect(() => {
    let alive = true;
    catalogPromise ??= tmdb.getGenreCatalog().catch(() => ({ movie: [], tv: [] }));
    catalogPromise.then(c => {
      if (!c.movie.length && !c.tv.length) catalogPromise = null;
      if (alive) setCatalog(c);
    });
    return () => { alive = false; };
  }, []);
  return catalog;
}

function Choices({ label, options, value, onChange, labelFor, hintFor }) {
  const id = useId();
  return (
    <div className="smart-field">
      <div id={id} className="smart-label">{label}</div>
      <div className="smart-choices" role="radiogroup" aria-labelledby={id}>
        {options.map(option => (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`smart-choice${value === option ? ' selected' : ''}`}
            onClick={() => onChange(option)}
          >
            <span className="smart-choice-label">{labelFor(option)}</span>
            {hintFor && <span className="smart-choice-hint">{hintFor(option)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ label, options, value, onChange, labelFor }) {
  const id = useId();
  return (
    <label className="smart-row" htmlFor={id}>
      <span className="smart-row-label">{label}</span>
      <select id={id} className="smart-select" value={String(value ?? '')} onChange={e => {
        const picked = options.find(o => String(o ?? '') === e.target.value);
        onChange(picked ?? null);
      }}>
        {options.map(o => <option key={String(o ?? 'any')} value={String(o ?? '')}>{labelFor(o)}</option>)}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange, disabled, hint }) {
  const id = useId();
  return (
    <label className={`smart-row${disabled ? ' disabled' : ''}`} htmlFor={id}>
      <span>
        <span className="smart-row-label">{label}</span>
        {hint && <span className="smart-row-hint">{hint}</span>}
      </span>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * @param {{
 *   list?: { id: string, name: string, rules: any } | null,  editing when set
 *   lists: any[],  every list the viewer owns, for the duplicate-name check
 *   onConfirm: (name: string, rules: import('@plot/core/smartLists.js').SmartListRules) => Promise<any>,
 *   onClose: () => void,
 *   onPremium: () => void,  the server said this account is not Premium
 *   onLimit?: () => void,
 * }} props
 */
export default function SmartListDialog({ list = null, lists, onConfirm, onClose, onPremium, onLimit }) {
  const { profile } = useApp();
  const catalog = useGenreCatalog();
  const [name, setName] = useState(list?.name ?? '');
  const [rules, setRules] = useState(() => normalizeSmartListRules(list?.rules) ?? defaultSmartListRules());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const hasServices = pickerProviderIds(profile?.streaming_providers).length > 0;
  const genres = smartListGenres(catalog, rules.mediaType);
  const nameId = useId();

  // Normalizing on every change keeps the form to rules that apply: switching
  // to "Movies and shows" clears length, leaving history clears "hide watched".
  const set = (key, value) => setRules(prev => normalizeSmartListRules({ ...prev, [key]: value }));
  const setType = (mediaType) => setRules(prev => {
    const offered = new Set(smartListGenres(catalog, mediaType).map(g => g.id));
    return normalizeSmartListRules({ ...prev, mediaType, genreIds: prev.genreIds.filter(id => offered.has(id)) });
  });
  const toggleGenre = (id) => set('genreIds', rules.genreIds.includes(id)
    ? rules.genreIds.filter(g => g !== id)
    : [...rules.genreIds, id]);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    const duplicate = !list && findDuplicateCustomList(lists, name);
    if (duplicate) { setError(`"${duplicate.name}" already exists.`); return; }
    setSubmitting(true);
    setError('');
    try {
      // A services rule with no services saved would match nothing.
      const saved = await onConfirm(name, hasServices ? rules : { ...rules, onlyServices: false });
      if (!saved) setError(SMART_LISTS.couldNotSave);
    } catch (failure) {
      if (isSmartListPremiumError(failure)) { onPremium(); return; }
      if (onLimit && isCustomListLimitError(failure)) { onLimit(); return; }
      setError(SMART_LISTS.couldNotSave);
    } finally {
      setSubmitting(false);
    }
  };

  const runtimes = rules.mediaType === 'tv' ? SMART_LIST_EPISODE_RUNTIMES : SMART_LIST_MOVIE_RUNTIMES;

  return (
    <ResponsiveDialog
      title={list ? SMART_LISTS.editRules : SMART_LISTS.newSmartList}
      onClose={onClose}
      tall
      footer={(
        <div className="smart-footer">
          {error && <p className="smart-error" role="alert">{error}</p>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={submitting} onClick={onClose}>{COMMON.cancel}</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim() || submitting} onClick={submit}>
            {submitting ? (list ? COMMON.saving : SMART_LISTS.creating) : (list ? COMMON.save : SMART_LISTS.create)}
          </button>
        </div>
      )}
    >
      <div className="smart-form">
        {!list && (
          <>
            <p className="smart-intro">{SMART_LISTS.intro}</p>
            <div className="smart-field">
              <label htmlFor={nameId} className="smart-label">{SMART_LISTS.nameLabel}</label>
              <input
                id={nameId}
                type="text"
                className="smart-input"
                placeholder={SMART_LISTS.namePlaceholder}
                value={name}
                disabled={submitting}
                maxLength={80}
                autoFocus
                onChange={e => { setName(e.target.value); if (error) setError(''); }}
              />
            </div>
          </>
        )}

        <Choices
          label={SMART_LISTS.sourceLabel}
          options={SMART_LIST_SOURCES}
          value={rules.source}
          onChange={v => set('source', v)}
          labelFor={v => SMART_LISTS.sources[v].label}
          hintFor={v => SMART_LISTS.sources[v].hint}
        />
        <Choices
          label={SMART_LISTS.typeLabel}
          options={SMART_LIST_MEDIA_TYPES}
          value={rules.mediaType}
          onChange={setType}
          labelFor={v => SMART_LISTS.types[v]}
        />

        {/* Hidden rather than empty if TMDB's genre list did not load. */}
        {genres.length > 0 && (
        <div className="smart-field">
          <div className="smart-label">{SMART_LISTS.genresLabel}</div>
          <p className="smart-hint">{SMART_LISTS.genresHint}</p>
          <div className="smart-genres" role="group" aria-label={SMART_LISTS.genresLabel}>
            {genres.map(g => (
              <button
                key={g.id}
                type="button"
                aria-pressed={rules.genreIds.includes(g.id)}
                className={`smart-genre${rules.genreIds.includes(g.id) ? ' selected' : ''}`}
                onClick={() => toggleGenre(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="smart-rows">
          <Select label={T.eraLabel} options={SMART_LIST_ERAS} value={rules.era} onChange={v => set('era', v ?? 'any')} labelFor={v => T.eras[v]} />
          <Select label={T.scoreLabel} options={SMART_LIST_MIN_SCORES} value={rules.minScore} onChange={v => set('minScore', v)} labelFor={T.score} />
          {rules.mediaType !== 'any' && (
            <Select
              label={rules.mediaType === 'tv' ? T.episodeLabel : SMART_LISTS.lengthLabel}
              options={runtimes}
              value={rules.maxRuntime}
              onChange={v => set('maxRuntime', v)}
              labelFor={rules.mediaType === 'tv' ? T.episodeRuntime : T.runtimes}
            />
          )}
          {rules.source === 'history' && (
            <Select label={SMART_LISTS.myRatingLabel} options={SMART_LIST_MY_RATINGS} value={rules.minMyRating} onChange={v => set('minMyRating', v)} labelFor={SMART_LISTS.myRating} />
          )}
          <Check
            label={T.onlyServices}
            checked={rules.onlyServices && hasServices}
            disabled={!hasServices}
            hint={hasServices ? null : T.onlyServicesMissing}
            onChange={v => set('onlyServices', v)}
          />
          {rules.source !== 'history' && (
            <Check label={SMART_LISTS.hideWatched} checked={rules.hideWatched} onChange={v => set('hideWatched', v)} />
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
