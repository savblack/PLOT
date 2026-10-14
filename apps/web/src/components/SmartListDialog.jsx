// Create or edit a smart list (A2 on the smart lists canvas, with the chip
// sentence from the phone save sheet). The rules read as one sentence of
// chips; a live count and a row of posters show what they find before
// anything is saved; the name is written from the rules until the viewer
// types their own.
//
// Opened three ways: "Create smart list" on Pick for Me (the answers become
// the rules), "New list" then "Smart list" on My Lists (default rules), and
// "Edit rules" on a smart list. Free viewers can build and count (B5); Create
// hands their rules to `onLocked`, which keeps them and opens the upgrade sheet.
//
// The rules and what they mean live in @plot/core/smartLists.js; the count is
// @plot/core/useSmartListPreview.js. Mobile has no counterpart yet: see issue
// 1094 (Mobile parity: smart lists).
import { useId, useMemo, useState } from 'react';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { isCustomListLimitError, isSmartListPremiumError } from '@plot/core/customListCreation.js';
import { defaultSmartListRules, normalizeSmartListRules, setSmartListRule, smartListGenres, suggestSmartListName } from '@plot/core/smartLists.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { useSmartListPreview } from '@plot/core/useSmartListPreview.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { COMMON } from '../copy/common.js';
import { useApp } from '../hooks/useApp.js';
import { useGenreCatalog } from '../hooks/useGenres.js';
import { useHistory } from '../hooks/useHistory.js';
import { posterUrl } from '../utils/images.js';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import SmartListRules from './SmartListRules.jsx';
import { SettingsSwitch } from './SettingsPage.jsx';
import './SmartListDialog.css';

const NONE = [];

/**
 * @param {{
 *   list?: { id: string, name: string, rules: any } | null,  editing when set
 *   initialRules?: import('@plot/core/smartLists.js').SmartListRules | null,  the answers, or a kept draft
 *   initialName?: string,
 *   origin?: 'picker' | 'lists',
 *   lists: any[],  every list the viewer owns, for the duplicate-name check
 *   premium?: boolean,  false: Create hands the rules to onLocked (B5)
 *   onConfirm: (name: string, rules: import('@plot/core/smartLists.js').SmartListRules) => Promise<any>,
 *   onClose: () => void,
 *   onPremium: () => void,  the server said this account is not Premium
 *   onLocked?: (name: string, rules: import('@plot/core/smartLists.js').SmartListRules) => void,
 *   onLimit?: () => void,
 *   catalog?: { movie: any[], tv: any[] } | null,  Storybook: genres without a fetch
 *   preview?: { count: number | null, items: any[], loading?: boolean, fromTmdb?: boolean } | null,  Storybook: a count without TMDB
 * }} props
 */
export default function SmartListDialog({
  list = null, initialRules = null, initialName = '', origin = 'lists', lists, premium = true,
  onConfirm, onClose, onPremium, onLocked, onLimit, catalog: seedCatalog = null, preview: seedPreview = null,
}) {
  const { user, profile, watchlist } = useApp();
  const art = useUserArtwork();
  const history = useHistory(user?.id);
  const catalog = useGenreCatalog(seedCatalog);
  const editing = !!list;
  const [rules, setRules] = useState(() => normalizeSmartListRules(list?.rules)
    ?? normalizeSmartListRules(initialRules) ?? defaultSmartListRules());
  const [name, setName] = useState(initialName);
  const [nameTouched, setNameTouched] = useState(!!initialName);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const hasServices = pickerProviderIds(profile?.streaming_providers).length > 0;
  const nameId = useId();

  // Until the viewer types a name, it follows the rules.
  const suggested = useMemo(() => suggestSmartListName(rules, { genres: smartListGenres(catalog, rules.mediaType) }), [rules, catalog]);
  const shownName = nameTouched ? name : suggested;

  const live = useSmartListPreview({
    rules,
    enabled: !seedPreview,
    watchlistItems: watchlist?.items ?? NONE,
    historyEntries: history.entries ?? NONE,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
    hideKids: !profile?.include_kids_content,
  });
  const count = seedPreview ? seedPreview.count : live.count;
  const posters = (seedPreview ? seedPreview.items : live.items) ?? [];
  const counting = seedPreview ? !!seedPreview.loading : live.loading;
  const fromTmdb = seedPreview ? seedPreview.fromTmdb !== false : live.fromTmdb;

  const submit = async () => {
    const finalName = shownName.trim();
    if ((!editing && !finalName) || submitting) return;
    // A services rule with no services saved would match nothing.
    const saving = hasServices ? rules : { ...rules, onlyServices: false };
    if (!premium && !editing) { onLocked?.(finalName, saving); return; }
    const duplicate = !editing && findDuplicateCustomList(lists, finalName);
    if (duplicate) { setError(`"${duplicate.name}" already exists.`); return; }
    setSubmitting(true);
    setError('');
    try {
      const saved = await onConfirm(editing ? list.name : finalName, saving);
      if (!saved) setError(SMART_LISTS.couldNotSave);
    } catch (failure) {
      if (isSmartListPremiumError(failure)) { onPremium(); return; }
      if (onLimit && isCustomListLimitError(failure)) { onLimit(); return; }
      setError(SMART_LISTS.couldNotSave);
    } finally {
      setSubmitting(false);
    }
  };

  const title = editing ? SMART_LISTS.editRules : SMART_LISTS.newSmartList;
  const intro = editing ? null : origin === 'picker' ? SMART_LISTS.fromAnswersIntro : SMART_LISTS.intro;
  const action = editing ? COMMON.save : SMART_LISTS.create;

  return (
    <ResponsiveDialog
      title={title}
      onClose={onClose}
      tall
      surfaceClassName="smart-builder-dialog"
      footer={(
        <div className="smart-footer">
          {error && <p className="smart-error" role="alert">{error}</p>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={submitting} onClick={onClose}>{COMMON.cancel}</button>
          <button type="button" className="btn btn-primary btn-sm smart-footer-primary" disabled={(!editing && !shownName.trim()) || submitting} onClick={submit}>
            {submitting ? (editing ? COMMON.saving : SMART_LISTS.creating) : action}
          </button>
        </div>
      )}
    >
      <div className="smart-builder">
        {intro && <p className="smart-intro smart-builder-intro">{intro}</p>}

        {!editing && (
          <div className="smart-field smart-builder-name">
            <label htmlFor={nameId} className="smart-label">{SMART_LISTS.nameLabel}</label>
            <input
              id={nameId}
              type="text"
              className="smart-input"
              placeholder={SMART_LISTS.namePlaceholder}
              value={shownName}
              disabled={submitting}
              maxLength={80}
              onChange={e => { setName(e.target.value); setNameTouched(true); if (error) setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            />
          </div>
        )}

        <div className="smart-field smart-builder-rules">
          <span className="smart-label">{origin === 'picker' && !editing ? SMART_LISTS.rulesFromAnswers : SMART_LISTS.rulesLabel}</span>
          <SmartListRules rules={rules} catalog={catalog} hasServices={hasServices} onChange={setRules} />
          {rules.source !== 'history' && (
            <div className="smart-builder-switch">
              <span>{SMART_LISTS.hideWatched}</span>
              <SettingsSwitch label={SMART_LISTS.hideWatched} checked={rules.hideWatched}
                onChange={() => setRules(prev => setSmartListRule(prev, 'hideWatched', !prev.hideWatched))} />
            </div>
          )}
        </div>

        <div className="smart-builder-preview" aria-live="polite">
          <div className="smart-builder-count">
            <span className="smart-builder-count-number">
              {count == null ? (counting ? SMART_LISTS.counting : SMART_LISTS.countFailed) : SMART_LISTS.liveCount(count)}
            </span>
            {count != null && fromTmdb && <span className="smart-builder-count-source">{SMART_LISTS.liveCountSource}</span>}
          </div>
          {posters.length > 0 && (
            <div className={`smart-builder-posters${counting ? ' smart-builder-posters--stale' : ''}`}>
              {posters.slice(0, 4).map(item => (
                <span key={item.id} className="smart-builder-poster">
                  {displayPosterPath(art.apply(item)) ? <img src={posterUrl(displayPosterPath(art.apply(item)), 'w185')} alt={item.title} loading="lazy" /> : null}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
