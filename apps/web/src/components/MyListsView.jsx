import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useSelection } from '../hooks/useSelection.js';
import { localDateStr } from '../utils/date.js';
import { favoriteWords } from '../utils/spelling.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { COMMON } from '../copy/common.js';
import { PROFILE_PRIVACY } from '../copy/profilePrivacy.js';
import { listVisibility } from '@plot/core/customLists.js';
import ListsLoading from './ListsLoading.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import KebabMenu from './KebabMenu.jsx';
import ListCover from './ListCover.jsx';
import { Tag } from './Chip.jsx';
import { EVENTS, track } from '../lib/analytics.js';
import { canCreateCustomList, isPremiumProfile } from '@plot/core/premium.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { parseSmartListDraft, serialiseSmartListDraft, smartListDraftKey } from '@plot/core/smartLists.js';
import { useSmartListNewCounts } from '@plot/core/useSmartListSeen.js';
import { readStorage, removeStorage, writeStorage } from '../utils/storage.js';
import UpgradeSheet from './UpgradeSheet.jsx';
import SmartListDialog from './SmartListDialog.jsx';
import NewListChoice from './NewListChoice.jsx';
import { collectionPath, customListKey, titleCount, wantToWatchItems } from '@plot/core/listCollections.js';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import {
  CreateListModal, HeaderIconButton, ListSection, NewTile, TickIcon, TopFiveSection, TrashIcon, WatchingSection,
} from './ListSections.jsx';
import { ListCoverMenu, MemberStack, NewSharedListDialog, PlusSmallIcon } from './CollaborativeListParts.jsx';
import { COLLABORATIVE_LISTS } from '@plot/core/copy/collaborativeLists.js';
import { listOwner, splitListsBySharing } from '@plot/core/sharedLists.js';
import { personName } from '@plot/core/watchTogether.js';
import { SHOW_WATCH_TOGETHER } from '../launchFeatures.js';
import {
  defaultUiPrefs, moveMyListsSection, nudgeMyListsSection, orderMyListsSections, resetMyListsOrder, setMyListsCollapsed,
} from '@plot/core/uiPrefs.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { PUBLIC_PROFILE_PAGE } from '@plot/core/copy/publicProfilePage.js';
import { SectionFoldContext } from './sectionFold.js';
import MyListsLayoutSheet from './MyListsLayoutSheet.jsx';
import ActivationNudge from './ActivationNudge.jsx';
import { useActivationNudge } from '../hooks/useActivationNudge.js';

/* My Lists on the Calendar/History shell: a narrow left column beside one wide
   stream. The column is the index — every list with its count, capped by a
   "View more" row. It has no type or genre filters: a list's own page has them.
   The stream keeps what shipped in PR 918: the Watching shelf, the Top 5 podium,
   then every list as a cover that opens its own page.

   Below the sidebar breakpoint `.cal-side` hides itself, as it does on the
   Guide.

   History is not here: it has had its own page since it left the sub-tabs, and
   a cover that navigated off /my-lists was the only one that did. */

const posters = (art, items) => items.map(item => displayPosterPath(art.apply(item)));

// How many rows the column shows before it offers the rest. Eight clears a
// free account at its cap (Want to Watch + Favourites + five custom lists), so
// only an unlimited collection is ever folded.
const JUMP_CAP = 8;

const ChevronDown = () => <svg viewBox="0 0 24 24"><polyline points="6,9 12,15 18,9" /></svg>;
const ChevronUp   = () => <svg viewBox="0 0 24 24"><polyline points="18,15 12,9 6,15" /></svg>;

/* The index. One row per collection, name and count, in the same row style as
   History's filters. */
function JumpToCard({ collections, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  // Folding one row away would cost a row to save a row.
  const folds = collections.length > JUMP_CAP + 1;
  const shown = folds && !expanded ? collections.slice(0, JUMP_CAP) : collections;
  return (
    <div className="hist-card mylists-jump">
      <div className="hist-card-head">
        <span className="hist-card-title">{CUSTOM_LISTS.jumpTo}</span>
      </div>
      <div>
        {shown.map(c => (
          <button key={c.key} type="button" className="cal-filter-row" onClick={onOpen(c.key)}>
            <span className="cal-filter-name">{c.name}</span>
            <span className="mylists-jump-count">{c.items.length}</span>
          </button>
        ))}
        {folds && (
          <button
            type="button"
            className="cal-filter-row mylists-jump-more"
            aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}
          >
            <span className="cal-filter-name">
              {expanded ? CUSTOM_LISTS.viewLess : CUSTOM_LISTS.viewMore(collections.length - JUMP_CAP)}
            </span>
            <span className="cal-filter-chev">{expanded ? <ChevronUp /> : <ChevronDown />}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* The Smart lists group in the column: each smart list, with "2 new" when
   the weekly roll-up found something (A4), and New smart list under them. */
function SmartJumpCard({ collections, newCounts, onOpen, onNew }) {
  return (
    <div className="hist-card mylists-jump">
      <div className="hist-card-head">
        <span className="hist-card-title">{SMART_LISTS.section}</span>
      </div>
      <div>
        {collections.map(c => (
          <button key={c.key} type="button" className="cal-filter-row" onClick={onOpen(c.key)}>
            <span className="cal-filter-name">{c.name}</span>
            {newCounts[c.list.id] > 0 && <span className="mylists-jump-count smart-new-count">{SMART_LISTS.newCount(newCounts[c.list.id])}</span>}
          </button>
        ))}
        <button type="button" className="cal-filter-row mylists-jump-more" onClick={onNew}>
          <span className="cal-filter-name"><PlusSmallIcon /> {SMART_LISTS.newSmartList}</span>
        </button>
      </div>
    </div>
  );
}

/* B1's Shared group in the column: each shared list with its avatar stack,
   and New shared list under them. */
function SharedJumpCard({ collections, onOpen, onNew }) {
  const S = COLLABORATIVE_LISTS.myLists;
  return (
    <div className="hist-card mylists-jump">
      <div className="hist-card-head">
        <span className="hist-card-title">{S.shared}</span>
      </div>
      <div>
        {collections.map(c => (
          <button key={c.key} type="button" className="cal-filter-row" onClick={onOpen(c.key)}>
            <span className="cal-filter-name">{c.name}</span>
            <MemberStack people={c.others} />
          </button>
        ))}
        <button type="button" className="cal-filter-row mylists-jump-more" onClick={onNew}>
          <span className="cal-filter-name"><PlusSmallIcon /> {S.newShared}</span>
        </button>
      </div>
    </div>
  );
}

/* The page's section order and folds. Signed in, they are the viewer's
   ui_prefs (saved, and the same on their other devices). Without the app's
   prefs (Storybook), the same rules run on local state. */
function useMyListsLayout(uiPrefs) {
  const [local, setLocal] = useState(defaultUiPrefs);
  if (uiPrefs) {
    return {
      prefs: uiPrefs.prefs.myLists, error: uiPrefs.error,
      nudge: uiPrefs.nudgeMyLists, move: uiPrefs.moveMyLists, toggle: uiPrefs.toggleMyListsCollapsed, reset: uiPrefs.resetMyLists,
    };
  }
  return {
    prefs: local.myLists, error: null,
    nudge: (ids, id, delta) => setLocal(p => nudgeMyListsSection(p, ids, id, delta)),
    move: (ids, id, to) => setLocal(p => moveMyListsSection(p, ids, id, to)),
    toggle: (id) => setLocal(p => setMyListsCollapsed(p, id)),
    reset: () => setLocal(p => resetMyListsOrder(p)),
  };
}

/** @param {{ newCounts?: Record<string, number> | null }} props  newCounts: Storybook's "2 new" without a network */
export default function MyListsView({ newCounts: seedNewCounts = null } = {}) {
  const art = useUserArtwork();
  const { user, profile, topLists, favorites, customLists, watching, watchlist, uiPrefs } = useApp();
  const layout = useMyListsLayout(uiPrefs);
  const [customizing, setCustomizing] = useState(false);
  const fw = favoriteWords(profile?.region);
  const navigate = useNavigate();
  // The sheet can replace the create-list dialog; focus comes back here after.
  const newListRef = useRef(null);
  const selection = useSelection();
  const [creatingList,  setCreatingList]  = useState(false);
  const [showCapNotice, setShowCapNotice] = useState(false);
  // Which upgrade sheet is open: the Free list cap, or smart lists.
  const [upgradeReason, setUpgradeReason] = useState('lists');
  const [creatingSmart, setCreatingSmart] = useState(false);
  // B1: "New list" asks which kind. B5: a Free viewer's rules, kept.
  const [choosingKind, setChoosingKind] = useState(false);
  const [smartDraft, setSmartDraft] = useState(null);
  const [rulesKept, setRulesKept] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creatingShared, setCreatingShared] = useState(false);

  const want = useMemo(() => wantToWatchItems(watchlist.items, watching.items, localDateStr()), [watchlist.items, watching.items]);
  const smartIds = useMemo(() => (customLists.smartLists || []).map(l => l.id), [customLists.smartLists]);
  const liveNewCounts = useSmartListNewCounts(smartIds, { enabled: !seedNewCounts && !!user && isPremiumProfile(profile) });
  const newCounts = seedNewCounts ?? liveNewCounts;
  // An account with nothing saved anywhere gets the one "start here" card
  // instead of a wall of empty sections (15 Nov 2026, review finding 8).
  const nudge = useActivationNudge();

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <ListsLoading />;
  }

  const { lists, smartLists = [], ownedCount, createList, createSmartList, deleteList } = customLists;
  // Lists, a Top 5 or favorites count as started even with no titles saved.
  const startedLists = (lists?.length ?? 0) + smartLists.length > 0
    || Object.values(topLists.lists || {}).some(items => items.length > 0)
    || (favorites.favorites?.length ?? 0) > 0;
  // Collaborative lists (PLO-525, canvas B1): shared lists get their own
  // section, split by who started them. Off with Watch together.
  const split = SHOW_WATCH_TOGETHER
    ? splitListsBySharing(lists, user.id)
    : { own: lists, sharedByMe: [], sharedWithMe: [] };
  // What Select can delete: lists you own, shared or not. A list you joined
  // is left from its own menu.
  const ownLists = [...lists.filter(l => l.role !== 'member'), ...smartLists];
  const S = COLLABORATIVE_LISTS.myLists;

  // One index behind both the column and the covers, so the two can't drift.
  const collections = [
    { key: 'want',      name: CUSTOM_LISTS.wantToWatch, items: want,              empty: 'Nothing saved yet'  },
    ...(FAVOURITES_ENABLED ? [{ key: 'favorites', name: fw.plural, items: favorites.favorites, empty: 'Nothing hearted yet' }] : []),
    ...split.own.map(list => ({
      key: customListKey(list.id),
      name: list.name,
      // Newest first, the way a cover fans them.
      items: [...(list.items || [])].reverse(),
      empty: 'Empty',
      list,
    })),
  ];
  // Smart lists find their titles when opened, so their covers are bare.
  // Their own section and column group, after Lists and before Shared.
  const smartCollections = smartLists.map(list => ({
    key: customListKey(list.id),
    name: list.name,
    items: [],
    empty: SMART_LISTS.coverCount,
    list,
    smart: true,
  }));

  const sharedCollection = (list) => ({
    key: customListKey(list.id),
    name: list.name,
    items: [...(list.items || [])].reverse(),
    empty: 'Empty',
    list,
    others: (list.people || []).filter(p => p.user_id !== user.id),
  });
  const sharedByMe = split.sharedByMe.map(sharedCollection);
  const sharedWithMe = split.sharedWithMe.map(sharedCollection);
  const sharedCollections = [...sharedByMe, ...sharedWithMe];

  // No type or genre filter here (Nov 2026): on this page you pick a list,
  // not a title, and filtering titles left half-empty covers. Each list's own
  // page filters what is in it.

  // Free accounts get FREE_CUSTOM_LIST_CAP lists; Premium unlimited. The
  // DB (RLS insert policy) is the authority; this is just friendlier UX.
  const requestCreate = () => {
    if (!canCreateCustomList(ownedCount ?? lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setUpgradeReason('lists');
      setShowCapNotice(true);
      return;
    }
    setShowCapNotice(false);
    setCreatingList(true);
  };
  // Smart lists are Premium. The database refuses rules from anyone else.
  // A Free viewer can still build rules and see the count (B5): Create keeps
  // them and opens this sheet, saying so.
  const openSmartGate = ({ kept = false } = {}) => {
    track(EVENTS.PREMIUM_GATE_HIT, { feature: 'smart_lists' });
    setCreatingList(false);
    setCreatingSmart(false);
    setRulesKept(kept);
    setUpgradeReason('smartLists');
    setShowCapNotice(true);
  };
  const draftKey = smartListDraftKey(user?.id);
  const requestSmartCreate = () => {
    setCreatingList(false);
    setChoosingKind(false);
    setShowCapNotice(false);
    setSmartDraft(parseSmartListDraft(readStorage(draftKey)));
    setCreatingSmart(true);
  };
  const keepSmartDraft = (name, rules) => {
    writeStorage(draftKey, serialiseSmartListDraft({ name, rules }));
    openSmartGate({ kept: true });
  };
  // Both creates offer Undo in the toast. Undoing a smart list also leaves
  // its page, if that is still where the viewer is.
  const handleSmartCreate = async (name, rules) => {
    let path = null;
    const created = await createSmartList(name, rules, {
      undo: true,
      onUndone: () => { if (path && window.location.pathname === path) navigate(-1); },
    });
    if (created) {
      removeStorage(draftKey);
      setCreatingSmart(false);
      path = collectionPath(customListKey(created.id));
      navigate(path);
    }
    return created;
  };
  const handleCreate = async (name) => {
    const created = await createList(name, { undo: true });
    if (created) setCreatingList(false);
    return created;
  };
  // New shared list (canvas B2) is Premium: Free accounts get the upgrade
  // sheet (S1) first, the same one Invite people opens.
  const requestShared = () => {
    if (!isPremiumProfile(profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'collaborative_lists' });
      setUpgradeReason('collaborativeLists');
      setShowCapNotice(true);
      return;
    }
    setCreatingShared(true);
  };
  const deleteSelected = async () => {
    for (const id of selection.selected) await deleteList(id);
    setConfirmDelete(false);
    selection.exit();
  };

  const open = (key) => () => { if (!selection.editMode) navigate(collectionPath(key)); };
  const jumpTo = (key) => () => {
    const target = document.getElementById(`collection-${key}`);
    if (!target) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    target.querySelector('button')?.focus({ preventScroll: true });
  };

  const selectedLists = ownLists.filter(l => selection.selected.has(l.id));
  const selectedTitles = selectedLists.reduce((n, l) => n + (l.items || []).length, 0);

  const listActions = selection.editMode ? (
    <>
      {selection.selected.size > 0 && (
        <HeaderIconButton label={`Delete ${selection.selected.size} selected`} onClick={() => setConfirmDelete(true)} danger>
          <TrashIcon />
        </HeaderIconButton>
      )}
      <HeaderIconButton label="Done selecting" onClick={selection.exit} success>
        <TickIcon />
      </HeaderIconButton>
    </>
  ) : (
    <KebabMenu
      ariaLabel="Lists options"
      items={[
        { label: 'New list', onClick: requestCreate },
        { label: SMART_LISTS.newSmartList, onClick: requestSmartCreate },
        ...(SHOW_WATCH_TOGETHER ? [{ label: S.newShared, onClick: requestShared }] : []),
        ...(ownLists.length > 0 ? [{ label: 'Select lists', onClick: selection.start }] : []),
      ]}
    />
  );

  const cover = (c) => {
    const owner = c.others && c.list.role === 'member' ? listOwner(c.list) : null;
    const byline = c.others && (
      <>
        <MemberStack people={c.others} />
        <span>{owner ? S.from(personName(owner)) : S.withNames(c.others.map(personName))}</span>
      </>
    );
    return (
      <ListCover
        key={c.key}
        anchorId={`collection-${c.key}`}
        name={c.name}
        count={c.smart ? c.empty : titleCount(c.items.length, c.empty)}
        posters={posters(art, c.items)}
        badge={c.list && listVisibility(c.list) !== 'private' && <Tag className="mylists-public-badge" label={PROFILE_PRIVACY.listVisibilityBadge[listVisibility(c.list)]} />}
        byline={byline}
        menu={c.list && !c.smart ? <ListCoverMenu list={c.list} /> : null}
        onOpen={open(c.key)}
        editMode={selection.editMode}
        selectable={!!c.list && c.list.role !== 'member'}
        selected={c.list ? selection.selected.has(c.list.id) : false}
        onToggleSelect={c.list ? () => selection.toggle(c.list.id) : undefined}
      />
    );
  };

  // The sections, in the viewer's order. Each is wrapped in a fold below, so
  // its heading folds it shut. Shared is only there with Watch together.
  const sectionLabels = {
    watching: MEDIA_PANEL.watching, top: PUBLIC_PROFILE_PAGE.topFive, lists: PUBLIC_PROFILE_PAGE.lists,
    smart: SMART_LISTS.section, shared: S.shared,
  };
  const shownSections = orderMyListsSections(layout.prefs.order).filter(id => id !== 'shared' || SHOW_WATCH_TOGETHER);
  const toggleSection = (id) => {
    track(EVENTS.MY_LISTS_LAYOUT_CHANGED, { action: layout.prefs.collapsed.includes(id) ? 'expand' : 'collapse', section: id });
    layout.toggle(id);
  };
  const sectionNodes = {
    watching: <WatchingSection watching={watching} />,
    top: <TopFiveSection topLists={topLists} />,
    lists: (
      <ListSection title={sectionLabels.lists} headerRight={listActions}>
                <div className="list-covers">
                  {collections.map(cover)}
                  {!selection.editMode && (
                    <button ref={newListRef} type="button" className="list-cover list-cover--new interactive-surface"
                      onClick={() => setChoosingKind(v => !v)} aria-label="Create new list" aria-haspopup="menu" aria-expanded={choosingKind}>
                      <span className="list-cover-art list-cover-art--dashed">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      </span>
                      <span className="list-cover-label"><span className="list-cover-name list-cover-name--muted">New list</span></span>
                    </button>
                  )}
                </div>
              </ListSection>
    ),
    smart: (
      <ListSection title={SMART_LISTS.section} subtitle={SMART_LISTS.sectionNote}>
      <div className="list-covers">
        {smartCollections.map(cover)}
        {!selection.editMode && <NewTile label={SMART_LISTS.newSmartList} note={SMART_LISTS.newTileNote} onClick={requestSmartCreate} />}
      </div>
    </ListSection>
    ),
    shared: (
      <ListSection title={S.shared}>
      <div className="mylists-shared-group">
        <h3 className="mylists-shared-label">{S.sharedByMe}</h3>
        <div className="list-covers">
          {sharedByMe.map(cover)}
          {!selection.editMode && <NewTile label={S.newShared} note={S.newSharedNote} onClick={requestShared} />}
        </div>
      </div>
      {sharedWithMe.length > 0 && (
        <div className="mylists-shared-group">
          <h3 className="mylists-shared-label">{S.sharedWithMe}</h3>
          <div className="list-covers">{sharedWithMe.map(cover)}</div>
        </div>
      )}
    </ListSection>
    ),
  };

  return (
    <div className="hist-page mylists-page">
      <div className="cal-body">
        <aside className="cal-side mylists-side">
          <JumpToCard collections={collections} onOpen={jumpTo} />
          <SmartJumpCard collections={smartCollections} newCounts={newCounts} onOpen={jumpTo} onNew={requestSmartCreate} />
          {SHOW_WATCH_TOGETHER && <SharedJumpCard collections={sharedCollections} onOpen={jumpTo} onNew={requestShared} />}
        </aside>

        <div className="cal-stream mylists-stream">
          {nudge.show && !startedLists ? (
            <ActivationNudge surface="my_lists" sources={nudge.sources} />
          ) : (
            <div className="discover-sections">
              {shownSections.map(id => (
                <SectionFoldContext.Provider key={id} value={{
                  collapsed: layout.prefs.collapsed.includes(id),
                  onToggle: () => toggleSection(id),
                  hint: (layout.prefs.collapsed.includes(id) ? CUSTOM_LISTS.sections.expand : CUSTOM_LISTS.sections.collapse)(sectionLabels[id]),
                }}>
                  {sectionNodes[id]}
                </SectionFoldContext.Provider>
              ))}
              {/* Customize sits at the foot of the page at every width, as on
                  every page that has one (Savannah, 12 Nov 2026). */}
              <div className="page-customize-foot"><button type="button" className="home-page-nav-customize" onClick={() => setCustomizing(true)}>{DISCOVER_VIEW.customize.action}</button></div>
            </div>
          )}
        </div>
      </div>

      {customizing && (
        <MyListsLayoutSheet
          sections={shownSections.map(id => ({ id, label: sectionLabels[id] }))}
          isDefault={layout.prefs.order.length === 0}
          error={layout.error}
          onNudge={(id, delta) => { track(EVENTS.MY_LISTS_LAYOUT_CHANGED, { action: 'reorder', section: id }); layout.nudge(shownSections, id, delta); }}
          onMove={(id, to) => { track(EVENTS.MY_LISTS_LAYOUT_CHANGED, { action: 'reorder', section: id }); layout.move(shownSections, id, to); }}
          onReset={() => { track(EVENTS.MY_LISTS_LAYOUT_CHANGED, { action: 'reset' }); layout.reset(); }}
          onClose={() => setCustomizing(false)}
        />
      )}
      {choosingKind && (
        <NewListChoice anchorRef={newListRef} onClose={() => setChoosingKind(false)}
          onList={() => { setChoosingKind(false); requestCreate(); }}
          onSmart={requestSmartCreate}
          onShared={SHOW_WATCH_TOGETHER ? () => { setChoosingKind(false); requestShared(); } : undefined} />
      )}
      {showCapNotice && <UpgradeSheet reason={upgradeReason} kept={upgradeReason === 'smartLists' && rulesKept}
        onClose={() => setShowCapNotice(false)} returnFocusRef={newListRef} />}
      {creatingList && (
        <CreateListModal lists={ownLists} onConfirm={handleCreate} onClose={() => setCreatingList(false)}
          onLimit={() => { setCreatingList(false); setUpgradeReason('lists'); setShowCapNotice(true); }} />
      )}
      {creatingSmart && (
        <SmartListDialog
          lists={ownLists}
          initialRules={smartDraft?.rules ?? null}
          initialName={smartDraft?.name ?? ''}
          premium={isPremiumProfile(profile)}
          onConfirm={handleSmartCreate}
          onClose={() => setCreatingSmart(false)}
          onPremium={() => openSmartGate()}
          onLocked={keepSmartDraft}
          onLimit={() => { setCreatingSmart(false); setUpgradeReason('lists'); setShowCapNotice(true); }}
        />
      )}
      {creatingShared && <NewSharedListDialog onClose={() => setCreatingShared(false)} />}
      {confirmDelete && (
        <ConfirmModal
          title={selectedLists.length === 1 ? `Delete "${selectedLists[0].name}"?` : `Delete ${selectedLists.length} lists?`}
          message={selectedTitles > 0
            ? `${selectedTitles === 1 ? 'One title is' : `${selectedTitles} titles are`} on ${selectedLists.length === 1 ? 'this list' : 'these lists'}. This can't be undone.`
            : "This can't be undone."}
          confirmLabel={selectedLists.length === 1 ? 'Delete list' : 'Delete lists'}
          danger
          onConfirm={deleteSelected}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
