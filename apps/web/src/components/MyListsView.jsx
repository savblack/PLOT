import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { useSelection } from '../hooks/useSelection.js';
import { localDateStr } from '../utils/date.js';
import { favoriteWords } from '../utils/spelling.js';
import { COMMON } from '../copy/common.js';
import { HISTORY_VIEW } from '../copy/historyView.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import KebabMenu from './KebabMenu.jsx';
import ListCover from './ListCover.jsx';
import { EVENTS, track } from '../lib/analytics.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { collectionPath, customListKey, titleCount, wantToWatchItems } from '@plot/core/listCollections.js';
import { ALL_TYPES, filterByTypeAndGenre, isTypeNarrowed } from '@plot/core/mediaFilters.js';
import { TypeGenreFilter } from './ListCards.jsx';
import {
  CreateListModal, HeaderIconButton, ListSection, TopFiveSection, TrashIcon, WatchingSection,
} from './ListSections.jsx';

/* My Lists: the Watching shelf on top, since it is the list you glance at
   most, the Top 5 podium under it, then every other list as a cover in one grid. It used to be seven
   sub-tabs under a sticky toolbar, every title a full-width row. Each cover
   opens its own page (ListPage); History has had one since it left the tabs.
   The ··· on the Lists heading is where a list is created and where lists
   are selected in bulk; only custom lists can be deleted. */

const posters = (items) => items.map(i => i.poster_path);

export default function MyListsView() {
  const { user, profile, topLists, favorites, customLists, watching, watchlist } = useApp();
  const fw = favoriteWords(profile?.region);
  const navigate = useNavigate();
  const { entries: history, loading: historyLoading } = useHistory(user?.id);
  const selection = useSelection();
  const [creatingList,  setCreatingList]  = useState(false);
  const [showCapNotice, setShowCapNotice] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);

  const want = useMemo(() => wantToWatchItems(watchlist.items, watching.items, localDateStr()), [watchlist.items, watching.items]);

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <LoadingSpinner />;
  }

  const { lists, createList, deleteList } = customLists;

  // The pill narrows the whole page. A cover keeps its place but shows how
  // much of it matches, and only the matching posters; a list with nothing
  // matching dims. Only Want to Watch stores genres today, so a genre pick
  // leaves the other lists' counts unchanged.
  const narrowed = isTypeNarrowed(typeFilters) || genreFilters.length > 0;
  const apply = (items) => filterByTypeAndGenre(items, typeFilters, genreFilters);
  const coverCount = (items, emptyLabel) => {
    if (!narrowed) return titleCount(items.length, emptyLabel);
    const n = apply(items).length;
    return `${n} of ${items.length} match`;
  };

  // Free accounts get FREE_CUSTOM_LIST_CAP lists; Premium unlimited. The
  // DB (RLS insert policy) is the authority; this is just friendlier UX.
  const requestCreate = () => {
    if (!canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setShowCapNotice(true);
      return;
    }
    setShowCapNotice(false);
    setCreatingList(true);
  };
  const handleCreate = async (name) => {
    const created = await createList(name);
    if (created) setCreatingList(false);
    return created;
  };
  const deleteSelected = async () => {
    for (const id of selection.selected) await deleteList(id);
    setConfirmDelete(false);
    selection.exit();
  };

  const open = (key) => () => { if (!selection.editMode) navigate(collectionPath(key)); };

  const selectedLists = lists.filter(l => selection.selected.has(l.id));
  const selectedTitles = selectedLists.reduce((n, l) => n + (l.items || []).length, 0);

  const listActions = selection.editMode ? (
    <>
      {selection.selected.size > 0 && (
        <HeaderIconButton label={`Delete ${selection.selected.size} selected`} onClick={() => setConfirmDelete(true)} danger>
          <TrashIcon />
        </HeaderIconButton>
      )}
      <HeaderIconButton label="Done selecting" onClick={selection.exit}>
        <span className="mylists-done">{COMMON.done}</span>
      </HeaderIconButton>
    </>
  ) : (
    <KebabMenu
      ariaLabel="Lists options"
      items={[
        { label: 'New list', onClick: requestCreate },
        ...(lists.length > 0 ? [{ label: 'Select lists', onClick: selection.start }] : []),
      ]}
    />
  );

  const cover = (key, name, items, emptyLabel) => {
    const visible = narrowed ? apply(items) : items;
    return (
      <ListCover
        key={key}
        name={name}
        count={coverCount(items, emptyLabel)}
        posters={posters(visible)}
        dim={narrowed && visible.length === 0 && items.length > 0}
        onOpen={open(key)}
        editMode={selection.editMode}
        selectable={false}
      />
    );
  };

  return (
    <div>
      <div className="page-toolbar mylists-toolbar">
        <span />
        <TypeGenreFilter
          mobileControls
          ariaLabel="Filter lists"
          typeFilters={typeFilters}
          setTypeFilters={setTypeFilters}
          genreFilters={genreFilters}
          setGenreFilters={setGenreFilters}
        />
      </div>

      <div className="discover-sections">
        <WatchingSection watching={watching} hidden={isTypeNarrowed(typeFilters) && !typeFilters.includes('tv')} />

        <TopFiveSection topLists={topLists} />

        <ListSection title="Lists" headerRight={listActions}>
          {showCapNotice && (
            <div className="mylists-cap-notice" role="status">
              <strong>{CUSTOM_LISTS.limitTitle}</strong> {CUSTOM_LISTS.limitMessage}
            </div>
          )}

          <div className="list-covers">
            {cover('want', 'Want to Watch', want, 'Nothing saved yet')}
            {cover('favorites', fw.plural, favorites.favorites, 'Nothing hearted yet')}
            {lists.map(list => (
              <ListCover
                key={list.id}
                name={list.name}
                count={coverCount(list.items || [], 'Empty')}
                posters={posters(narrowed ? apply([...(list.items || [])].reverse()) : [...(list.items || [])].reverse())}
                dim={narrowed && (list.items || []).length > 0 && apply(list.items).length === 0}
                badge={list.is_public && <span className="mylists-public-badge">Public</span>}
                onOpen={open(customListKey(list.id))}
                editMode={selection.editMode}
                selectable
                selected={selection.selected.has(list.id)}
                onToggleSelect={() => selection.toggle(list.id)}
              />
            ))}
            {cover('history', 'History', history, historyLoading ? '' : HISTORY_VIEW.emptyTitle)}
            {!selection.editMode && (
              <button type="button" className="list-cover list-cover--new interactive-surface" onClick={requestCreate} aria-label="Create new list">
                <span className="list-cover-art list-cover-art--dashed">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </span>
                <span className="list-cover-label"><span className="list-cover-name list-cover-name--muted">New list</span></span>
              </button>
            )}
          </div>
        </ListSection>
      </div>

      {creatingList && (
        <CreateListModal lists={lists} onConfirm={handleCreate} onClose={() => setCreatingList(false)} />
      )}
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
