import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useSelection } from '../hooks/useSelection.js';
import { localDateStr } from '../utils/date.js';
import { favoriteWords } from '../utils/spelling.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { COMMON } from '../copy/common.js';
import { PROFILE_PRIVACY } from '../copy/profilePrivacy.js';
import { listVisibility } from '@plot/core/customLists.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import KebabMenu from './KebabMenu.jsx';
import ListCover from './ListCover.jsx';
import SideFilters from './SideFilters.jsx';
import { TYPE_ROWS } from './sideFilterRows.js';
import { EVENTS, track } from '../lib/analytics.js';
import { canCreateCustomList, isPremiumProfile } from '@plot/core/premium.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { parseSmartListDraft, serialiseSmartListDraft, smartListDraftKey } from '@plot/core/smartLists.js';
import { useSmartListNewCounts } from '@plot/core/useSmartListSeen.js';
import { readStorage, removeStorage, writeStorage } from '../utils/storage.js';
import UpgradeSheet from './UpgradeSheet.jsx';
import SmartListDialog from './SmartListDialog.jsx';
import NewListChoice from './NewListChoice.jsx';
import { collectionPath, customListKey, titleCount, wantToWatchItems, searchCollectionTitles, TOP_LIST_SIZE } from '@plot/core/listCollections.js';
import { ALL_TYPES, filterByTypeAndGenre, isTypeNarrowed } from '@plot/core/mediaFilters.js';
import { IconSearch } from './navIcons.jsx';
import { posterUrl } from '../utils/images.js';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { CardGrid, ListCard, TypeGenreFilter } from './ListCards.jsx';
import {
  CreateListModal, HeaderIconButton, ListSection, TickIcon, TopFiveSection, TrashIcon, WatchingSection,
} from './ListSections.jsx';
import { ListCoverMenu, MemberStack, NewSharedListDialog, PlusSmallIcon } from './CollaborativeListParts.jsx';
import { COLLABORATIVE_LISTS } from '@plot/core/copy/collaborativeLists.js';
import { listOwner, splitListsBySharing } from '@plot/core/sharedLists.js';
import { personName } from '@plot/core/watchTogether.js';
import { SHOW_WATCH_TOGETHER } from '../launchFeatures.js';

/* My Lists on the Calendar/History shell: a narrow left column beside one wide
   stream. The column is the index — every list with its count, capped by a
   "View more" row — with the Show and Genre filters beneath it, the same
   `SideFilters` rows History uses rather than the toolbar pill it used to be.
   The stream keeps what shipped in PR 918: the Watching shelf, the Top 5 podium,
   then every list as a cover that opens its own page.

   Below the sidebar breakpoint `.cal-side` hides itself, as it does on the
   Guide, and the toolbar's filter pill comes back for the phone.

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
   the filters under it. */
function JumpToCard({ collections, counts, onOpen }) {
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
            <span className="mylists-jump-count">{counts(c.items)}</span>
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

/** @param {{ newCounts?: Record<string, number> | null }} props  newCounts: Storybook's "2 new" without a network */
export default function MyListsView({ newCounts: seedNewCounts = null } = {}) {
  const art = useUserArtwork();
  const { user, profile, topLists, favorites, customLists, watching, watchlist, openPanel } = useApp();
  const fw = favoriteWords(profile?.region);
  const navigate = useNavigate();
  // The sheet can replace the create-list dialog; focus comes back here after.
  const newListRef = useRef(null);
  const { genres } = useGenres();
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
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const [query, setQuery] = useState('');
  const [creatingShared, setCreatingShared] = useState(false);

  const want = useMemo(() => wantToWatchItems(watchlist.items, watching.items, localDateStr()), [watchlist.items, watching.items]);
  const smartIds = useMemo(() => (customLists.smartLists || []).map(l => l.id), [customLists.smartLists]);
  const liveNewCounts = useSmartListNewCounts(smartIds, { enabled: !seedNewCounts && !!user && isPremiumProfile(profile) });
  const newCounts = seedNewCounts ?? liveNewCounts;

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <LoadingSpinner />;
  }

  const { lists, smartLists = [], ownedCount, createList, createSmartList, deleteList } = customLists;
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
    { key: 'want',      name: 'Want to Watch', items: want,                empty: 'Nothing saved yet'  },
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

  // The filters narrow the whole page. A cover keeps its place but shows how
  // much of it matches, and only the matching posters; a list with nothing
  // matching dims. Only Want to Watch stores genres today, so a genre pick
  // leaves the other lists' counts unchanged.
  const narrowed = isTypeNarrowed(typeFilters) || genreFilters.length > 0;
  const apply = (items) => filterByTypeAndGenre(items, typeFilters, genreFilters);
  const searching = query.trim().length > 0;
  const searchResults = searching ? searchCollectionTitles([
    watching.items.map(item => ({ ...item, media_type: 'tv' })),
    ...Object.entries(topLists.lists).map(([type, items]) => items.filter(item => item.rank <= TOP_LIST_SIZE).map(item => ({ ...item, media_type: type === 'tv' ? 'tv' : 'movie' }))),
    ...collections.map(c => c.items),
    ...sharedCollections.map(c => c.items),
  ].map(items => apply(items || [])), query) : [];
  const coverCount = (items, emptyLabel) => {
    if (!narrowed) return titleCount(items.length, emptyLabel);
    const n = apply(items).length;
    return `${n} of ${items.length} match`;
  };
  const jumpCount = (items) => (narrowed ? apply(items).length : items.length);

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
    const visible = narrowed ? apply(c.items) : c.items;
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
        count={c.smart ? c.empty : coverCount(c.items, c.empty)}
        posters={posters(art, visible)}
        dim={narrowed && visible.length === 0 && c.items.length > 0}
        badge={c.list && listVisibility(c.list) !== 'private' && <span className="mylists-public-badge">{PROFILE_PRIVACY.listVisibilityBadge[listVisibility(c.list)]}</span>}
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

  const allCollections = [...collections, ...smartCollections, ...sharedCollections];
  const titles = allCollections.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="hist-page mylists-page">
      <div className="hist-toolbar">
        <span className="hist-toolbar-sub">{CUSTOM_LISTS.summary(allCollections.length, titles)}</span>
        <div className="hist-toolbar-controls">
          {/* At sidebar widths the column carries the filters; below it, the
              pill and its sheet are how a phone reaches them. */}
          <span className="mylists-toolbar-filter">
            <TypeGenreFilter
              mobileControls
              ariaLabel="Filter lists"
              typeFilters={typeFilters}
              setTypeFilters={setTypeFilters}
              genreFilters={genreFilters}
              setGenreFilters={setGenreFilters}
            />
          </span>
          <label className="hist-search">
            <IconSearch />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={CUSTOM_LISTS.searchPlaceholder} aria-label={CUSTOM_LISTS.searchPlaceholder} />
          </label>
        </div>
      </div>

      <div className="cal-body">
        <aside className="cal-side mylists-side">
          <JumpToCard collections={collections} counts={jumpCount} onOpen={jumpTo} />
          <SmartJumpCard collections={smartCollections} newCounts={newCounts} onOpen={jumpTo} onNew={requestSmartCreate} />
          {SHOW_WATCH_TOGETHER && <SharedJumpCard collections={sharedCollections} onOpen={jumpTo} onNew={requestShared} />}
          <SideFilters
            typeRows={TYPE_ROWS}
            typeFilters={typeFilters}
            setTypeFilters={setTypeFilters}
            genreFilters={genreFilters}
            setGenreFilters={setGenreFilters}
            genres={genres}
          />
        </aside>

        <div className="cal-stream mylists-stream">
          {searching ? (
            <div className="discover-sections">
              <ListSection title={CUSTOM_LISTS.searchResults}>
                <p role="status">{searchResults.length ? CUSTOM_LISTS.searchCount(searchResults.length) : CUSTOM_LISTS.noSearchResults}</p>
                <CardGrid>
                  {searchResults.map(item => (
                    <ListCard key={`${item.media_type || 'movie'}:${item.tmdb_id ?? item.id}`} title={item.title || item.name} img={posterUrl(displayPosterPath(art.apply(item)), 'w185')} onOpen={() => openPanel(item.tmdb_id ?? item.id, item.media_type || 'movie')} />
                  ))}
                </CardGrid>
              </ListSection>
            </div>
          ) : (
            <div className="discover-sections">
              <WatchingSection watching={watching} hidden={isTypeNarrowed(typeFilters) && !typeFilters.includes('tv')} />

              <TopFiveSection topLists={topLists} />

              <ListSection title="Lists" headerRight={listActions}>
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

              {/* Smart lists: everyone sees the section. Free viewers can build
                  rules and see the count; Create opens the upgrade sheet (B5). */}
              <ListSection
                title={SMART_LISTS.section}
              >
                <div className="list-covers">
                  {smartCollections.map(cover)}
                  {!selection.editMode && (
                    <button type="button" className="list-cover list-cover--new interactive-surface" onClick={requestSmartCreate} aria-label={SMART_LISTS.newSmartList}>
                      <span className="list-cover-art list-cover-art--dashed">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      </span>
                      <span className="list-cover-label">
                        <span className="list-cover-name list-cover-name--muted">{SMART_LISTS.newSmartList}</span>
                        <span className="list-cover-count">{SMART_LISTS.newTileNote}</span>
                      </span>
                    </button>
                  )}
                </div>
              </ListSection>

              {SHOW_WATCH_TOGETHER && (
                <ListSection
                  title={S.shared}
                >
                  <div className="mylists-shared-group">
                    <h3 className="mylists-shared-label">{S.sharedByMe}</h3>
                    <div className="list-covers">
                      {sharedByMe.map(cover)}
                      {!selection.editMode && (
                        <button type="button" className="list-cover list-cover--new interactive-surface" onClick={requestShared} aria-label={S.newShared}>
                          <span className="list-cover-art list-cover-art--dashed">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          </span>
                          <span className="list-cover-label">
                            <span className="list-cover-name list-cover-name--muted">{S.newShared}</span>
                            <span className="list-cover-count">{S.newSharedNote}</span>
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  {sharedWithMe.length > 0 && (
                    <div className="mylists-shared-group">
                      <h3 className="mylists-shared-label">{S.sharedWithMe}</h3>
                      <div className="list-covers">{sharedWithMe.map(cover)}</div>
                    </div>
                  )}
                </ListSection>
              )}
            </div>
          )}
        </div>
      </div>

      {choosingKind && (
        <NewListChoice anchorRef={newListRef} onClose={() => setChoosingKind(false)}
          onList={() => { setChoosingKind(false); requestCreate(); }}
          onSmart={requestSmartCreate} />
      )}
      {showCapNotice && <UpgradeSheet reason={upgradeReason} kept={upgradeReason === 'smartLists' && rulesKept}
        onClose={() => setShowCapNotice(false)} returnFocusRef={newListRef} />}
      {creatingList && (
        <CreateListModal lists={ownLists} onConfirm={handleCreate} onClose={() => setCreatingList(false)}
          onLimit={() => { setCreatingList(false); setUpgradeReason('lists'); setShowCapNotice(true); }}
          onSmart={requestSmartCreate} />
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
