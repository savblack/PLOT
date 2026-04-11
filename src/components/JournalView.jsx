import { useState, useEffect } from 'react';
import ImportModal from './ImportModal';
import JournalBoardTab from './JournalBoardTab';
import { MOODS } from '../constants';

function ListStack({ list, items, onListClick }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = { current: null };
  const resetRef    = { current: null };
  const maxItems = Math.min(items.length, 10);

  const startCycle = () => {
    clearTimeout(resetRef.current);
    setIsHovered(true);
    if (maxItems > 1) {
      intervalRef.current = setInterval(
        () => setActiveIdx(p => (p + 1) % maxItems),
        550
      );
    }
  };

  const stopCycle = () => {
    clearInterval(intervalRef.current);
    setIsHovered(false);
    resetRef.current = setTimeout(() => setActiveIdx(0), 400);
  };

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    clearTimeout(resetRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items.length === 0) {
    return (
      <div className="list-stack empty" onClick={() => onListClick(list)}>
        <div className="stack-container">
          <div className="stack-card empty">
            <span>Empty List</span>
          </div>
        </div>
        <div className="stack-info">
          <h3>{list.name}</h3>
          <p>0 items</p>
          {list.is_public && <span className="list-public-badge">Public</span>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="list-stack"
      onMouseEnter={startCycle}
      onMouseLeave={stopCycle}
      onClick={() => onListClick(list)}
    >
      <div className="stack-container">
        <div className="stack-card stack-card-depth" style={{
          zIndex: 1,
          transform: isHovered ? 'rotate(5deg) translateY(5px) scale(0.95)' : 'rotate(3deg) translateY(3px) scale(0.97)',
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
        <div className="stack-card stack-card-depth" style={{
          zIndex: 1,
          transform: isHovered ? 'rotate(-4deg) translateY(4px) scale(0.97)' : 'rotate(-2deg) translateY(2px) scale(0.98)',
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />

        {items.slice(0, maxItems).map((item, idx) => (
          <div
            key={item.id || idx}
            className="stack-card"
            style={{
              zIndex: 2,
              opacity: idx === activeIdx ? 1 : 0,
              transition: 'opacity 0.35s ease',
            }}
          >
            {item.poster_path
              ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
              : <div className="no-image">{item.title || item.name}</div>
            }
          </div>
        ))}
      </div>
      <div className="stack-info">
        <h3>{list.name}</h3>
        <p>{items.length} {items.length === 1 ? 'item' : 'items'}</p>
        {list.is_public && <span className="list-public-badge">Public</span>}
      </div>
    </div>
  );
}

export default function JournalView({
  user, watched, mediaFilter, setMediaFilter,
  userLists, listItems, activeList, setActiveList,
  journalTab, setJournalTab,
  profile,
  createList, deleteList, renameList, toggleListItem,
  toggleListPublic, copyLink, copiedLink,
  onItemClick,
  setShowAuth,
  deleteFromJournal,
}) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showJournalNewList, setShowJournalNewList] = useState(false);
  const [journalNewListName, setJournalNewListName] = useState('');
  const [editingListName, setEditingListName] = useState(false);
  const [editListNameValue, setEditListNameValue] = useState('');
  const [showListEditMenu, setShowListEditMenu] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMoveList, setShowMoveList] = useState(false);
  const [pendingHistoryDelete, setPendingHistoryDelete] = useState(null);

  // Watch History filters
  const [historyMoodFilter, setHistoryMoodFilter] = useState('');
  const [historyRatingFilter, setHistoryRatingFilter] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('');
  const [historySearchFilter, setHistorySearchFilter] = useState('');
  const [historySort, setHistorySort] = useState('date-desc');

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowMoveList(false);
  };

  useEffect(() => {
    exitSelectMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList?.id]);

  const toggleItemSelect = (tmdbId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const tmdbIds = [...selectedIds];
    await Promise.all(tmdbIds.map(id => toggleListItem(activeList.id, { id }, false)));
    const inHistory = tmdbIds.filter(id =>
      watched.some(w => (w.tmdb_id || w.id) === id)
    );
    if (inHistory.length > 0) {
      setPendingHistoryDelete(inHistory);
    } else {
      exitSelectMode();
    }
  };

  const handleBulkMove = async (targetListId) => {
    const tmdbIds = [...selectedIds];
    const itemsToMove = activeListItems.filter(item =>
      tmdbIds.includes(item.tmdb_id || item.id)
    );
    await Promise.all(tmdbIds.map(id => toggleListItem(activeList.id, { id }, false)));
    await Promise.all(itemsToMove.map(item =>
      toggleListItem(targetListId, {
        id: item.tmdb_id || item.id,
        media_type: item.media_type || (item.title ? 'movie' : 'tv'),
        title: item.title || item.name,
        poster_path: item.poster_path,
      }, true)
    ));
    setShowMoveList(false);
    exitSelectMode();
  };

  // Watch History filtered + sorted list
  const historyFiltered = watched
    .filter(item => {
      const matchMedia = mediaFilter === 'all' || (item.media_type || (item.title ? 'movie' : 'tv')) === mediaFilter;
      const matchMood = !historyMoodFilter || item.mood === historyMoodFilter;
      const matchRating = !historyRatingFilter || item.rating === parseInt(historyRatingFilter);
      const matchStatus = !historyStatusFilter || item.watchStatus === historyStatusFilter;
      const matchSearch = !historySearchFilter || (item.title || item.name || '').toLowerCase().includes(historySearchFilter.toLowerCase());
      return matchMedia && matchMood && matchRating && matchStatus && matchSearch;
    })
    .sort((a, b) => {
      if (historySort === 'rating-desc') return (b.rating || 0) - (a.rating || 0);
      if (historySort === 'title-asc') return (a.title || a.name || '').localeCompare(b.title || b.name || '');
      // date-desc (default)
      return new Date(b.watched_at || 0) - new Date(a.watched_at || 0);
    });

  // Active list items (real lists only)
  const activeListItems = activeList
    ? listItems.filter(li => li.list_id === activeList.id)
    : [];

  return (
    <section className="watchlist">
      {activeList ? (
        <div className="list-detail-view animate-in">
          <div className="list-detail-header">
            <button className="back-btn" onClick={() => { setActiveList(null); setEditingListName(false); exitSelectMode(); }}>← <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15em' }}>Journal</span></button>
            <div className="section-header-row">
              {editingListName ? (
                <input
                  className="list-rename-input"
                  value={editListNameValue}
                  autoFocus
                  onChange={e => setEditListNameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameList(activeList.id, editListNameValue);
                    if (e.key === 'Escape') setEditingListName(false);
                  }}
                  onBlur={() => renameList(activeList.id, editListNameValue)}
                />
              ) : (
                <h2 className="section-title">{activeList.name}</h2>
              )}
              {!selectMode && (
                <div className="list-edit-menu-wrapper">
                  <button className="new-list-header-btn list-edit-btn" onClick={() => setShowListEditMenu(v => !v)}>
                    Edit
                  </button>
                  {showListEditMenu && (
                    <>
                      <div className="list-edit-backdrop" onClick={() => setShowListEditMenu(false)} />
                      <div className="list-edit-dropdown">
                        <button onClick={() => { setSelectMode(true); setShowListEditMenu(false); }}>
                          Select
                        </button>
                        <button onClick={() => { setEditListNameValue(activeList.name); setEditingListName(true); setShowListEditMenu(false); }}>
                          Edit name
                        </button>
                        <button onClick={() => { toggleListPublic(activeList.id); setShowListEditMenu(false); }}>
                          {activeList.is_public ? 'Make private' : 'Make public'}
                        </button>
                        {activeList.is_public && profile?.username && (
                          <button onClick={() => { copyLink('list', activeList.id); setShowListEditMenu(false); }}>
                            {copiedLink === activeList.id ? 'Copied!' : 'Copy list link'}
                          </button>
                        )}
                        <button className="danger" onClick={() => { if (window.confirm(`Delete "${activeList.name}"?`)) { deleteList(activeList.id); setShowListEditMenu(false); } }}>
                          Delete list
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {selectMode && (
                <button className="new-list-header-btn list-edit-btn" onClick={exitSelectMode}>
                  Cancel
                </button>
              )}
            </div>
          </div>
          {selectMode && selectedIds.size > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="select-action-bar">
              <span className="select-count">{selectedIds.size} selected</span>
              <div className="select-actions">
                <button className="select-action-btn" onClick={() => setShowMoveList(v => !v)}>
                  Move to list
                </button>
                <button className="select-action-btn danger" onClick={handleBulkDelete}>
                  Delete
                </button>
              </div>
            </div>
            </div>
          )}

          <div className="bento-grid">
            {activeListItems.map((item, index) => {
              const tmdbId = item.tmdb_id || item.id;
              const isSelected = selectedIds.has(tmdbId);
              return (
                <div
                  key={item.id || index}
                  className={`bento-item glass list-detail-item${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    if (selectMode) {
                      toggleItemSelect(tmdbId);
                    } else {
                      onItemClick({ ...item, id: item.tmdb_id });
                    }
                  }}
                >
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                    : <div className="no-image">{item.title || item.name}</div>
                  }
                  <div className="overlay">
                    {(item.release_date || item.first_air_date) && (
                      <div className="overlay-year">{(item.release_date || item.first_air_date).slice(0, 4)}</div>
                    )}
                    <h3>{item.title || item.name}</h3>
                    {item.vote_average > 0 && (
                      <div className="overlay-rating">★ {item.vote_average.toFixed(1)}</div>
                    )}
                  </div>
                  {selectMode && (
                    <div className={`item-select-overlay${isSelected ? ' checked' : ''}`}>
                      <div className="item-checkbox">
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                  {!selectMode && (
                    <button
                      className="remove-item-btn"
                      onClick={e => { e.stopPropagation(); toggleListItem(activeList.id, { id: item.tmdb_id }, false); }}
                      title="Remove from list"
                    >×</button>
                  )}
                </div>
              );
            })}
            {activeListItems.length === 0 && (
              <p className="empty-list-msg">Nothing here yet.</p>
            )}
          </div>

          {showMoveList && (
            <>
              <div className="move-list-backdrop" onClick={() => setShowMoveList(false)} />
              <div className="move-to-list-popup">
                <h4>Move to list</h4>
                {userLists
                  .filter(l => l.id !== activeList.id)
                  .map(l => (
                    <button key={l.id} onClick={() => handleBulkMove(l.id)}>
                      {l.name}
                    </button>
                  ))
                }
                {userLists.filter(l => l.id !== activeList.id).length === 0 && (
                  <p style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No other lists. Create one first.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="journal-section">
          <div className="section-header-row">
            <h2 className="section-title">Journal</h2>
            <div className="section-header-right">
              <div className="mobile-filter-row">
                <button className={mediaFilter === 'all' ? 'active' : ''} onClick={() => setMediaFilter('all')}>All</button>
                <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
                <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
              </div>
            </div>
          </div>

          <div className="journal-tab-nav">
            {[
              { id: 'taste',     label: 'Journal' },
              { id: 'watchlist', label: 'Watchlist' },
              { id: 'lists',     label: 'My Lists' },
              { id: 'history',   label: 'History' },
            ].map(t => (
              <button
                key={t.id}
                className={`journal-tab-btn ${journalTab === t.id ? 'active' : ''}`}
                onClick={() => setJournalTab(t.id)}
              >{t.label}</button>
            ))}
          </div>
          {journalTab === 'lists' && !showJournalNewList && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem', marginTop: '0.35rem' }}>
              <button className="new-list-header-btn" onClick={() => setShowJournalNewList(true)}>
                Create list
              </button>
            </div>
          )}

          {journalTab === 'history' && (
            <div className="history-tab">
              <div className="history-filters">
                <input
                  className="history-search-input"
                  type="text"
                  placeholder="Search titles…"
                  value={historySearchFilter}
                  onChange={e => setHistorySearchFilter(e.target.value)}
                />
                <select value={historySort} onChange={e => setHistorySort(e.target.value)}>
                  <option value="date-desc">Newest first</option>
                  <option value="rating-desc">Top rated</option>
                  <option value="title-asc">A–Z</option>
                </select>
                <select value={historyMoodFilter} onChange={e => setHistoryMoodFilter(e.target.value)}>
                  <option value="">Mood</option>
                  {MOODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={historyRatingFilter} onChange={e => setHistoryRatingFilter(e.target.value)}>
                  <option value="">Rating</option>
                  {[10,9,8,7,6,5,4,3,2,1].map(r => <option key={r} value={r}>{r}/10</option>)}
                </select>
                <select value={historyStatusFilter} onChange={e => setHistoryStatusFilter(e.target.value)}>
                  <option value="">Status</option>
                  {['Watched','Binged',"Didn't Finish",'Want to Watch'].map(s =>
                    <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {historyFiltered.length === 0 && (
                <p className="empty-list-msg">
                  {watched.length === 0
                    ? 'Nothing logged yet. Open any movie or show and hit Save.'
                    : 'No items match the selected filters.'}
                </p>
              )}
              <div className="bento-grid">
                {historyFiltered.map((item, idx) => (
                  <div key={item.id || idx} className="bento-item glass" onClick={() => onItemClick(item)}>
                    {item.poster_path
                      ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                      : <div className="no-image">{item.title || item.name}</div>
                    }
                    <div className="overlay">
                      {(item.release_date || item.first_air_date) && (
                        <div className="overlay-year">{(item.release_date || item.first_air_date).slice(0, 4)}</div>
                      )}
                      <h3>{item.title || item.name}</h3>
                      {item.rating > 0 ? (
                        <div className="overlay-rating my-rating">★ {item.rating}/10</div>
                      ) : item.vote_average > 0 ? (
                        <div className="overlay-rating">★ {item.vote_average.toFixed(1)}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {journalTab === 'lists' && (
            <>
              {!user && (
                <div className="journal-signin-prompt">
                  <p>Sign in to save lists across devices.</p>
                  <button className="new-list-header-btn" onClick={() => setShowAuth(true)}>Sign in</button>
                </div>
              )}
              {user && userLists.length === 0 && !showJournalNewList && (
                <div className="empty-journal-state">
                  <h3>No lists yet</h3>
                  <p>Create a list to organise your favourites.</p>
                </div>
              )}
              {showJournalNewList && (
                <div className="new-list-bar">
                  <input
                    type="text"
                    placeholder="List name..."
                    value={journalNewListName}
                    autoFocus
                    onChange={e => setJournalNewListName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (journalNewListName.trim()) {
                          await createList(journalNewListName.trim());
                          setJournalNewListName('');
                          setShowJournalNewList(false);
                        }
                      }
                      if (e.key === 'Escape') {
                        setJournalNewListName('');
                        setShowJournalNewList(false);
                      }
                    }}
                  />
                  <button onClick={async () => {
                    if (journalNewListName.trim()) {
                      await createList(journalNewListName.trim());
                      setJournalNewListName('');
                      setShowJournalNewList(false);
                    }
                  }}>Create</button>
                  <button className="cancel-btn" onClick={() => { setJournalNewListName(''); setShowJournalNewList(false); }}>Cancel</button>
                </div>
              )}
              <div className="lists-grid">
                {userLists.map(list => (
                  <ListStack
                    key={list.id}
                    list={list}
                    items={listItems.filter(li => li.list_id === list.id)}
                    onListClick={setActiveList}
                  />
                ))}
              </div>
            </>
          )}

          {journalTab === 'watchlist' && (() => {
            const wl = userLists.find(l => l.name === '__watchlist__');
            const wlItems = wl ? listItems.filter(li => li.list_id === wl.id) : [];
            if (!user) return (
              <div className="journal-signin-prompt">
                <p>Sign in to save upcoming releases.</p>
                <button className="new-list-header-btn" onClick={() => setShowAuth(true)}>Sign in</button>
              </div>
            );
            if (wlItems.length === 0) return (
              <div className="empty-journal-state">
                <h3>Nothing saved yet</h3>
                <p>Head to Upcoming and hit + to save releases you're looking forward to.</p>
              </div>
            );
            return (
              <div className="bento-grid">
                {wlItems.map((item, idx) => (
                  <div key={item.id || idx} className="bento-item glass" onClick={() => onItemClick({ ...item, id: item.tmdb_id })}>
                    {item.poster_path
                      ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                      : <div className="no-image">{item.title || item.name}</div>
                    }
                    <div className="overlay">
                      {(item.release_date || item.first_air_date) && (
                        <div className="overlay-year">{(item.release_date || item.first_air_date).slice(0, 4)}</div>
                      )}
                      <h3>{item.title || item.name}</h3>
                      {item.vote_average > 0 && (
                        <div className="overlay-rating">★ {item.vote_average.toFixed(1)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {journalTab === 'taste' && (
            <JournalBoardTab
              watched={watched}
              user={user}
              onItemClick={onItemClick}
            />
          )}
        </div>
      )}
      {showImportModal && (
        <ImportModal
          user={user}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {pendingHistoryDelete && (
        <>
          <div className="modal-backdrop" onClick={() => { setPendingHistoryDelete(null); exitSelectMode(); }} />
          <div className="confirm-modal">
            <p>
              {pendingHistoryDelete.length === 1 ? 'This item has' : `${pendingHistoryDelete.length} items have`} been removed from the list. Also remove from Watch History?
            </p>
            <div className="confirm-modal-actions">
              <button onClick={async () => {
                await deleteFromJournal(pendingHistoryDelete);
                setPendingHistoryDelete(null);
                exitSelectMode();
              }}>
                Yes, remove from history
              </button>
              <button onClick={() => { setPendingHistoryDelete(null); exitSelectMode(); }}>
                No, keep in history
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
