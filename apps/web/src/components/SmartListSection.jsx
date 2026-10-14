// A smart list's own page (Premium): the rules as a sentence of chips that
// stay editable on the page (B3), the matches they find right now with the
// ones new since the last visit grouped first (A4), and Rename / Edit rules /
// Delete, and on a new-discoveries list a switch for the weekly roll-up.
// Finding matches is @plot/core/useSmartList.js and what counts as new
// is @plot/core/useSmartListSeen.js; mobile has no counterpart yet (see issue
// 1094, Mobile parity: smart lists).
import { useMemo, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useGenreCatalog } from '../hooks/useGenres.js';
import { useSmartList } from '@plot/core/useSmartList.js';
import { useSmartListSeen } from '@plot/core/useSmartListSeen.js';
import { normalizeSmartListRules, smartListInRollUp, smartListRollUpEligible } from '@plot/core/smartLists.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { dateToLocalStr, shortDayMonth } from '@plot/core/date.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { isSmartListPremiumError } from '@plot/core/customListCreation.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { COMMON } from '../copy/common.js';
import { MEDIA } from '../copy/media.js';
import { favoriteWords } from '../utils/spelling.js';
import { posterUrl } from '../utils/images.js';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { EVENTS, track } from '../lib/analytics.js';
import { CardGrid, ListCard } from './ListCards.jsx';
import { listWatchStatus } from '@plot/core/listWatchStatus.js';
import { Empty, ListPageRow, ListSection } from './ListSections.jsx';
import { cardActions, cardState } from './listCardActions.js';
import ConfirmModal from './ConfirmModal.jsx';
import KebabMenu from './KebabMenu.jsx';
import SmartListDialog from './SmartListDialog.jsx';
import SmartListRules from './SmartListRules.jsx';
import { SettingsSwitch } from './SettingsPage.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import './SmartListDialog.css';

const NOT_SELECTING = { editMode: false, selected: new Set() };

/** "22 Sep" from a timestamp, in the viewer's own day. */
const dayLabel = (iso) => (iso ? shortDayMonth(dateToLocalStr(new Date(iso))) : '');

/**
 * @param {{
 *   list: { id: string, name: string, rules: any },
 *   customLists: any,
 *   historyEntries: any[],
 *   historyReady: boolean,
 *   refine?: (items: any[]) => any[],  the page's search and sort
 *   onDeleted?: () => void,
 *   Frame?: any,
 *   pageLayout?: boolean,
 *   catalog?: { movie: any[], tv: any[] } | null,  Storybook: genres without a fetch
 *   clients?: { tmdb?: any, db?: any } | null,  Storybook: TMDB and seen rows without a network
 * }} props
 */
export function SmartListSection({ list, customLists, historyEntries, historyReady, refine = (i) => i, onDeleted, Frame = ListSection, pageLayout = false, catalog: seedCatalog = null, clients = null }) {
  const { user, openPanel, favorites, watchlist, watching, privateNotes, profile } = useApp();
  const art = useUserArtwork();
  const catalog = useGenreCatalog(seedCatalog);
  const fw = favoriteWords(profile?.region);
  const premium = isPremiumProfile(profile);
  const hasServices = pickerProviderIds(profile?.streaming_providers).length > 0;
  // A chip change shows at once; the saved rules catch up, or it rolls back.
  const [draftRules, setDraftRules] = useState(null);
  const savedRules = useMemo(() => normalizeSmartListRules(list.rules), [list.rules]);
  const rules = draftRules ?? savedRules;
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  // The roll-up switch shows the new value at once and rolls back if not saved.
  const [rollUpDraft, setRollUpDraft] = useState(/** @type {boolean | null} */ (null));
  const [rollUpError, setRollUpError] = useState(false);

  const smart = useSmartList({
    rules,
    enabled: premium,
    watchlistItems: watchlist.items,
    historyEntries,
    ready: !watchlist.loading && historyReady,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
    hideKids: !profile?.include_kids_content,
    client: clients?.tmdb,
  });
  const seen = useSmartListSeen({
    listId: list.id,
    userId: user?.id,
    items: smart.items,
    ready: premium && !smart.loading && !smart.error,
    client: clients?.db,
  });
  const visible = refine(smart.items);
  const freshVisible = refine(seen.fresh);
  const restVisible = refine(seen.rest);

  // B3: a chip edits the saved rules in place.
  const changeRules = async (next) => {
    if (!premium) { openUpgrade(); return; }
    setDraftRules(next);
    try {
      await customLists.updateSmartList(list.id, next);
    } catch (failure) {
      if (isSmartListPremiumError(failure)) openUpgrade();
    } finally {
      // Saved: list.rules now holds them. Not saved: back to what is stored.
      setDraftRules(null);
    }
  };

  // Only lists of new discoveries are in the roll-up, and only their owner
  // (smart lists are never shared) on Premium can change it.
  const rollUpShown = premium && smartListRollUpEligible(rules) && (!list.user_id || list.user_id === user?.id);
  const inRollUp = rollUpDraft ?? smartListInRollUp(list);
  const toggleRollUp = async () => {
    if (rollUpDraft !== null) return;
    const next = !inRollUp;
    setRollUpDraft(next);
    setRollUpError(false);
    const ok = await customLists.setSmartListDigest(list.id, next);
    if (!ok) setRollUpError(true);
    setRollUpDraft(null);
  };

  const openUpgrade = () => {
    track(EVENTS.PREMIUM_GATE_HIT, { feature: 'smart_lists' });
    setUpgrade(true);
  };
  const submitRename = async () => {
    if (!renameValue.trim()) return;
    const ok = await customLists.renameList(list.id, renameValue);
    if (ok) setRenaming(false);
  };
  const saveRules = async (_name, next) => {
    try {
      const saved = await customLists.updateSmartList(list.id, next);
      if (saved) setEditing(false);
      return saved;
    } catch (failure) {
      if (isSmartListPremiumError(failure)) { setEditing(false); openUpgrade(); return null; }
      throw failure;
    }
  };

  const menuItems = [
    { label: 'Rename', onClick: () => { setRenameValue(list.name); setRenaming(true); } },
    { label: SMART_LISTS.editRules, onClick: () => (premium ? setEditing(true) : openUpgrade()) },
    { label: 'Delete list', onClick: () => setConfirmDelete(true), danger: true },
  ];

  const meta = (item) => (item.media_type === 'tv' ? MEDIA.series : MEDIA.movie);
  const card = (item) => {
    const title = item.title || MEDIA.unknown;
    return (
      <ListCard
        key={item.id}
        title={title}
        img={posterUrl(displayPosterPath(art.apply(item)), 'w185')}
        meta={meta(item)}
        {...(pageLayout ? cardState(item, historyEntries, privateNotes, watching?.items) : {})}
        {...(pageLayout ? cardActions(item, favorites, watchlist, fw) : {})}
        onOpen={() => openPanel(item.tmdb_id, item.media_type)}
      />
    );
  };

  let body;
  if (!rules) {
    body = <Empty>{SMART_LISTS.loadFailed}</Empty>;
  } else if (!premium) {
    body = (
      <div className="smart-locked">
        <p className="smart-locked-title">{SMART_LISTS.lockedTitle}</p>
        <p className="smart-locked-body">{SMART_LISTS.lockedBody}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={openUpgrade}>{SMART_LISTS.lockedAction}</button>
      </div>
    );
  } else if (smart.loading) {
    body = <div className="loading-state" style={{ minHeight: 120 }}><PlotLoader size="sm" /></div>;
  } else if (smart.error) {
    body = (
      <p className="mylists-empty">
        {SMART_LISTS.loadFailed}{' '}
        <button type="button" className="btn btn-ghost btn-xs" onClick={smart.retry}>{SMART_LISTS.retry}</button>
      </p>
    );
  } else if (smart.items.length === 0) {
    body = <Empty>{SMART_LISTS.empty}</Empty>;
  } else if (visible.length === 0) {
    // The page's search emptied it. Load more stays reachable below, since
    // the search only sees the pages fetched so far.
    body = (
      <>
        <Empty>{CUSTOM_LISTS.noMatch}</Empty>
        {smart.hasMore && (
          <div className="smart-more">
            <button type="button" className="btn btn-secondary btn-sm" disabled={smart.loadingMore} onClick={smart.loadMore}>
              {smart.loadingMore ? <PlotLoader size="sm" /> : SMART_LISTS.loadMore}
            </button>
          </div>
        )}
      </>
    );
  } else {
    const grid = (items, key) => (
      <div className={pageLayout ? 'list-page-items' : ''} key={key}>
        <CardGrid>{items.map(card)}</CardGrid>
        {pageLayout && (
          <div className="list-page-rows">
            {items.map(item => (
              <ListPageRow
                key={`row:${item.id}`}
                item={item}
                title={item.title || MEDIA.unknown}
                meta={meta(item)}
                open={() => openPanel(item.tmdb_id, item.media_type)}
                selection={NOT_SELECTING}
                watchStatus={listWatchStatus(item, historyEntries, watching?.items)}
              />
            ))}
          </div>
        )}
      </div>
    );
    body = (
      <>
        {/* A4: new matches since the last visit lead, then everything else. */}
        {freshVisible.length > 0 ? (
          <>
            <section className="smart-group smart-group--new" aria-label={SMART_LISTS.newSince}>
              <div className="smart-group-head">
                <h2 className="smart-group-title">{SMART_LISTS.newSince}</h2>
                <span className="smart-group-count">
                  {freshVisible.length}{seen.since ? ` · ${SMART_LISTS.sinceDate(dayLabel(seen.since))}` : ''}
                </span>
              </div>
              {grid(freshVisible, 'fresh')}
            </section>
            {restVisible.length > 0 && (
              <section className="smart-group" aria-label={SMART_LISTS.everythingElse}>
                <div className="smart-group-head">
                  <h2 className="smart-group-title">{SMART_LISTS.everythingElse}</h2>
                  <span className="smart-group-count">{restVisible.length}</span>
                </div>
                {grid(restVisible, 'rest')}
              </section>
            )}
          </>
        ) : grid(visible, 'all')}
        {smart.hasMore && (
          <div className="smart-more">
            <button type="button" className="btn btn-secondary btn-sm" disabled={smart.loadingMore} onClick={smart.loadMore}>
              {smart.loadingMore ? <PlotLoader size="sm" /> : SMART_LISTS.loadMore}
            </button>
          </div>
        )}
        {smart.unchecked > 0 && <p className="smart-note">{SMART_LISTS.unchecked(smart.unchecked)}</p>}
      </>
    );
  }

  // B3: the rules stay on the page as chips. Free viewers see them read-only.
  const rulesLine = rules && (
    <>
      <SmartListRules
        className="smart-page-rules"
        variant="page"
        rules={rules}
        catalog={catalog}
        hasServices={hasServices}
        onChange={premium ? changeRules : undefined}
      />
      {premium && !smart.loading && !smart.error && (
        <p className="smart-page-meta">{SMART_LISTS.matchCount(smart.items.length)} · {SMART_LISTS.tapHint}</p>
      )}
      {rollUpShown && (
        <div className="smart-builder-switch smart-page-rollup">
          <span className="smart-page-rollup-text">
            <span>{SMART_LISTS.rollUp}</span>
            <span className={`smart-page-rollup-hint${rollUpError ? ' smart-page-rollup-hint--error' : ''}`} role={rollUpError ? 'alert' : undefined}>
              {rollUpError ? SMART_LISTS.rollUpFailed : inRollUp ? SMART_LISTS.rollUpOn : SMART_LISTS.rollUpOff}
            </span>
          </span>
          <SettingsSwitch label={SMART_LISTS.rollUp} checked={inRollUp} disabled={rollUpDraft !== null} onChange={toggleRollUp} />
        </div>
      )}
    </>
  );

  return (
    <Frame
      title={list.name}
      count={premium ? smart.items.length : 0}
      subtitle={seen.since ? SMART_LISTS.lastOpened(dayLabel(seen.since)) : SMART_LISTS.badge}
      headerRight={<KebabMenu ariaLabel={`Open options for ${list.name}`} items={menuItems} />}
    >
      {renaming && (
        <div className="mylists-rename">
          <input
            type="text"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(false); }}
            autoFocus
            aria-label={`Rename ${list.name}`}
          />
          <button className="btn btn-primary btn-xs" onClick={submitRename}>{COMMON.save}</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setRenaming(false)}>{COMMON.cancel}</button>
        </div>
      )}

      {rulesLine}
      {body}

      {editing && (
        <SmartListDialog
          list={list}
          lists={[...customLists.lists, ...(customLists.smartLists || [])]}
          onConfirm={saveRules}
          onClose={() => setEditing(false)}
          onPremium={() => { setEditing(false); openUpgrade(); }}
        />
      )}
      {upgrade && <UpgradeSheet reason="smartLists" onClose={() => setUpgrade(false)} />}
      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${list.name}"?`}
          message="This can't be undone."
          confirmLabel="Delete list"
          danger
          onConfirm={async () => { await customLists.deleteList(list.id); onDeleted?.(); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Frame>
  );
}
