// A smart list's own page (Premium): the rules in the subtitle, the matches
// they find right now, and Rename / Edit rules / Delete. Finding matches is
// @plot/core/useSmartList.js; mobile has no counterpart yet (see issue 1094,
// Mobile parity: smart lists).
import { useMemo, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useSmartList } from '@plot/core/useSmartList.js';
import { normalizeSmartListRules, smartListSummary } from '@plot/core/smartLists.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { isSmartListPremiumError } from '@plot/core/customListCreation.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { COMMON } from '../copy/common.js';
import { MEDIA } from '../copy/media.js';
import { favoriteWords } from '../utils/spelling.js';
import { posterUrl } from '../utils/images.js';
import { EVENTS, track } from '../lib/analytics.js';
import { CardGrid, ListCard } from './ListCards.jsx';
import { Empty, ListPageRow, ListSection } from './ListSections.jsx';
import { cardActions, cardState } from './listCardActions.js';
import ConfirmModal from './ConfirmModal.jsx';
import KebabMenu from './KebabMenu.jsx';
import SmartListDialog from './SmartListDialog.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import './SmartListDialog.css';

const NOT_SELECTING = { editMode: false, selected: new Set() };

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
 * }} props
 */
export function SmartListSection({ list, customLists, historyEntries, historyReady, refine = (i) => i, onDeleted, Frame = ListSection, pageLayout = false }) {
  const { openPanel, favorites, watchlist, privateNotes, profile } = useApp();
  const { genres } = useGenres();
  const fw = favoriteWords(profile?.region);
  const premium = isPremiumProfile(profile);
  const rules = useMemo(() => normalizeSmartListRules(list.rules), [list.rules]);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [upgrade, setUpgrade] = useState(false);

  const smart = useSmartList({
    rules,
    enabled: premium,
    watchlistItems: watchlist.items,
    historyEntries,
    ready: !watchlist.loading && historyReady,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
    hideKids: !profile?.include_kids_content,
  });
  const visible = refine(smart.items);

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
        img={posterUrl(item.poster_path, 'w185')}
        meta={meta(item)}
        {...(pageLayout ? cardState(item, historyEntries, privateNotes) : {})}
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
  } else {
    body = (
      <>
        <div className={pageLayout ? 'list-page-items' : ''}>
          <CardGrid>{visible.map(card)}</CardGrid>
          {pageLayout && (
            <div className="list-page-rows">
              {visible.map(item => (
                <ListPageRow
                  key={`row:${item.id}`}
                  item={item}
                  title={item.title || MEDIA.unknown}
                  meta={meta(item)}
                  open={() => openPanel(item.tmdb_id, item.media_type)}
                  selection={NOT_SELECTING}
                />
              ))}
            </div>
          )}
        </div>
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

  return (
    <Frame
      title={list.name}
      count={premium ? smart.items.length : 0}
      subtitle={rules ? smartListSummary(rules, { genres }) : SMART_LISTS.badge}
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
