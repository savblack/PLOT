import { useState, useEffect, useRef } from 'react';
import ImportModal from './ImportModal';
import { MOODS } from '../constants';

function ListStack({ list, items, onListClick }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef(null);
  const resetRef    = useRef(null);
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
    // Reset after the fade-out completes so there's no snap
    resetRef.current = setTimeout(() => setActiveIdx(0), 400);
  };

  useEffect(() => () => {
    clearInterval(intervalRef.current);
    clearTimeout(resetRef.current);
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
        {/* Static back cards for visual depth */}
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

        {/* All posters stacked — only active one is visible, crossfade via opacity only */}
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
  timelineView, setTimelineView,
  gridTimeframe, setGridTimeframe,
  gridNav, setGridNav,
  selectedGridDay, setSelectedGridDay,
  onItemClick, formatDate, toDateKey, moodLabel, tlScribble,
  setShowAuth,
  deleteFromJournal,
}) {
  const timelineScrollRef = useRef(null);

  useEffect(() => {
    if (journalTab === 'timeline' && timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = timelineScrollRef.current.scrollWidth;
    }
  }, [journalTab, watched]);

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
    if (isVirtualList) {
      await deleteFromJournal(tmdbIds);
      exitSelectMode();
    } else {
      await Promise.all(tmdbIds.map(id => toggleListItem(activeList.id, { id }, false)));
      const inHistory = tmdbIds.filter(id =>
        watched.some(w => (w.tmdb_id || w.id) === id)
      );
      if (inHistory.length > 0) {
        setPendingHistoryDelete(inHistory);
      } else {
        exitSelectMode();
      }
    }
  };

  const handleBulkMove = async (targetListId) => {
    const tmdbIds = [...selectedIds];
    const itemsToMove = activeListItems.filter(item =>
      tmdbIds.includes(item.tmdb_id || item.id)
    );
    if (!isVirtualList) {
      await Promise.all(tmdbIds.map(id => toggleListItem(activeList.id, { id }, false)));
    }
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

  const activeWatched = watched;
  const filteredWatched = activeWatched.filter(item => (item.media_type || (item.title ? 'movie' : 'tv')) === mediaFilter);
  const watchedByDate = filteredWatched.reduce((acc, item) => {
    const key = toDateKey(item.watched_at);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const isVirtualList = activeList && typeof activeList.id === 'string' &&
    (activeList.id === 'unlisted' || activeList.id.startsWith('status-') || activeList.id.startsWith('rating-') || activeList.id.startsWith('mood-'));

  const listedTmdbIds = new Set(listItems.map(li => li.tmdb_id));

  const activeListItems = activeList
    ? (isVirtualList
        ? watched.filter(w => {
            if (activeList.id === 'unlisted') return !listedTmdbIds.has(w.tmdb_id || w.id);
            if (activeList.id.startsWith('status-')) return w.watchStatus === activeList.id.slice(7);
            if (activeList.id.startsWith('rating-')) return w.rating === parseInt(activeList.id.slice(7));
            if (activeList.id.startsWith('mood-')) return w.mood === activeList.id.slice(5);
            return false;
          })
        : listItems.filter(li => li.list_id === activeList.id))
    : [];

  return (
    <section className="watchlist">
      {activeList ? (
        <div className="list-detail-view animate-in">
          <div className="list-detail-header">
            <button className="back-btn" onClick={() => { setActiveList(null); setEditingListName(false); exitSelectMode(); }}>← <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15em' }}>Journal</span></button>
            <div className="section-header-row">
              {!isVirtualList && editingListName ? (
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
                        {!isVirtualList && (
                          <button onClick={() => { setEditListNameValue(activeList.name); setEditingListName(true); setShowListEditMenu(false); }}>
                            Edit name
                          </button>
                        )}
                        {!isVirtualList && (
                          <button onClick={() => { toggleListPublic(activeList.id); setShowListEditMenu(false); }}>
                            {activeList.is_public ? 'Make private' : 'Make public'}
                          </button>
                        )}
                        {!isVirtualList && activeList.is_public && profile?.username && (
                          <button onClick={() => { copyLink('list', activeList.id); setShowListEditMenu(false); }}>
                            {copiedLink === activeList.id ? 'Copied!' : 'Copy list link'}
                          </button>
                        )}
                        {!isVirtualList && (
                          <button className="danger" onClick={() => { if (window.confirm(`Delete "${activeList.name}"?`)) { deleteList(activeList.id); setShowListEditMenu(false); } }}>
                            Delete list
                          </button>
                        )}
                        {activeList.id === 'unlisted' && (
                          <button className="danger" onClick={() => {
                            if (window.confirm('Delete your entire Watch History? This will permanently remove all entries from your journal and cannot be undone.')) {
                              deleteFromJournal(activeListItems.map(item => item.tmdb_id || item.id));
                              setShowListEditMenu(false);
                            }
                          }}>
                            Delete Watch History
                          </button>
                        )}
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
                      onItemClick(isVirtualList ? item : { ...item, id: item.tmdb_id });
                    }
                  }}
                >
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                    : <div className="no-image">{item.title || item.name}</div>
                  }
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
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
                  {!selectMode && !isVirtualList && (
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
            {journalTab === 'lists' && !showJournalNewList && (
              <button className="new-list-header-btn" onClick={() => setShowJournalNewList(true)}>
                + New List
              </button>
            )}
          </div>

          <div className="journal-tab-nav">
            {['lists', 'mood', 'ratings', 'status', 'timeline'].map(tab => (
              <button
                key={tab}
                className={`journal-tab-btn ${journalTab === tab ? 'active' : ''}`}
                onClick={() => setJournalTab(tab)}
              >
                {tab === 'lists' ? 'My Lists' : tab === 'all' ? 'All' : tab === 'status' ? 'Status' : tab === 'ratings' ? 'Ratings' : tab === 'mood' ? 'Mood' : 'Timeline'}
              </button>
            ))}
          </div>

          {journalTab === 'lists' && (
            <>
              {!user && (
                <div className="journal-signin-prompt">
                  <p>Sign in to save lists across devices.</p>
                  <button className="new-list-header-btn" onClick={() => setShowAuth(true)}>Sign in</button>
                </div>
              )}
              {user && userLists.length === 0 && watched.length === 0 && !showJournalNewList && (
                <div className="empty-journal-state">
                  <h3>Your journal is empty</h3>
                  <p>Start by searching for a movie or show and adding it to your journal.</p>
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
                {watched.filter(w => !listedTmdbIds.has(w.tmdb_id || w.id)).length > 0 && (
                  <ListStack
                    key="unlisted"
                    list={{ id: 'unlisted', name: 'Watch History' }}
                    items={watched.filter(w => !listedTmdbIds.has(w.tmdb_id || w.id))}
                    onListClick={setActiveList}
                  />
                )}
              </div>
            </>
          )}

          {journalTab === 'all' && (
            <div className="bento-grid">
              {filteredWatched.length === 0 && (
                <p className="empty-list-msg">Nothing logged yet. Open any movie or show and hit Save.</p>
              )}
              {filteredWatched.map((item, index) => (
                <div
                  key={item.id || index}
                  className="bento-item glass"
                  onClick={() => onItemClick(item)}
                >
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                    : <div className="no-image">{item.title || item.name}</div>
                  }
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
                    {item.rating > 0 && <span className="rating-tag">{'★'.repeat(item.rating)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {journalTab === 'status' && (
            <div className="lists-grid">
              {['Watched', 'Binged', "Didn't Finish", 'Want to Watch'].map(status => (
                <ListStack
                  key={status}
                  list={{ id: `status-${status}`, name: status }}
                  items={filteredWatched.filter(w => w.watchStatus === status)}
                  onListClick={setActiveList}
                />
              ))}
            </div>
          )}

          {journalTab === 'ratings' && (
            <div className="lists-grid">
              {[5, 4, 3, 2, 1].map(star => (
                <ListStack
                  key={star}
                  list={{ id: `rating-${star}`, name: `${'★'.repeat(star)}${'☆'.repeat(5 - star)}` }}
                  items={filteredWatched.filter(w => w.rating === star)}
                  onListClick={setActiveList}
                />
              ))}
            </div>
          )}

          {journalTab === 'mood' && (
            <div className="lists-grid">
              {MOODS.map(m => (
                <ListStack
                  key={m.value}
                  list={{ id: `mood-${m.value}`, name: m.label }}
                  items={filteredWatched.filter(w => w.mood === m.value)}
                  onListClick={setActiveList}
                />
              ))}
            </div>
          )}

          {journalTab === 'timeline' && (
            <div className="timeline-tab">
              <div className="timeline-grid-header">
                <div className="timeline-grid-nav">
                  {timelineView === 'grid' && gridTimeframe === 'monthly' && (
                    <>
                      <button onClick={() => setGridNav(n => {
                        const d = new Date(n.year, n.month - 1, 1);
                        return { month: d.getMonth(), year: d.getFullYear() };
                      })}>‹</button>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {new Date(gridNav.year, gridNav.month).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                      </span>
                      <button onClick={() => setGridNav(n => {
                        const d = new Date(n.year, n.month + 1, 1);
                        return { month: d.getMonth(), year: d.getFullYear() };
                      })}>›</button>
                    </>
                  )}
                  {timelineView === 'grid' && gridTimeframe === 'yearly' && (
                    <>
                      <button onClick={() => setGridNav(n => ({ ...n, year: n.year - 1 }))}>‹</button>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{gridNav.year}</span>
                      <button onClick={() => setGridNav(n => ({ ...n, year: n.year + 1 }))}>›</button>
                    </>
                  )}
                </div>
                <div className="timeline-view-toggle">
                  <button className={timelineView === 'linear' ? 'active' : ''} onClick={() => setTimelineView('linear')}>Linear</button>
                  <button className={timelineView === 'grid' ? 'active' : ''} onClick={() => setTimelineView('grid')}>Grid</button>
                </div>
                {timelineView === 'grid' && (
                  <div className="timeline-view-toggle">
                    <button className={gridTimeframe === 'monthly' ? 'active' : ''} onClick={() => setGridTimeframe('monthly')}>Monthly</button>
                    <button className={gridTimeframe === 'yearly' ? 'active' : ''} onClick={() => setGridTimeframe('yearly')}>Yearly</button>
                  </div>
                )}
              </div>

              {filteredWatched.length === 0 && (
                <div className="empty-journal-state">
                  <h3>Nothing logged yet</h3>
                  <p>Your timeline will fill up as you log what you watch.</p>
                </div>
              )}

              {timelineView === 'linear' && (() => {
                const sorted = [...filteredWatched]
                  .filter(item => item.watched_at)
                  .sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));

                const ROW_SIZE = 4;
                const rows = [];
                for (let i = 0; i < sorted.length; i += ROW_SIZE) rows.push(sorted.slice(i, i + ROW_SIZE));

                const hLine = (w, seed) => {
                  const r = n => { const v = Math.sin(seed * 9.301 + n * 46.218) * 43758.5453; return v - Math.floor(v); };
                  const cy = 20;
                  return `M 0 ${cy} C ${w * 0.35} ${cy + (r(1) - 0.5) * 16} ${w * 0.65} ${cy + (r(2) - 0.5) * 16} ${w} ${cy}`;
                };

                return (
                  <div className="tl-snake-wrap" ref={timelineScrollRef}>
                    {rows.map((row, rowIdx) => {
                      const reversed = rowIdx % 2 === 1;
                      const displayRow = reversed ? [...row].reverse() : row;
                      const isLastRow = rowIdx === rows.length - 1;
                      const nextRow = rows[rowIdx + 1];
                      const days = nextRow
                        ? Math.round((new Date(nextRow[0].watched_at) - new Date(row[row.length - 1].watched_at)) / 86400000)
                        : 0;
                      const gapLabel = days >= 365 ? `${Math.round(days / 365)}y` : days >= 30 ? `${Math.round(days / 30)}mo` : days > 6 ? `${days}d` : null;
                      const turnH = Math.min(Math.max(80 + days * 0.4, 80), 160);

                      return (
                        <div key={rowIdx} className="tl-snake-section">
                          <div className="tl-snake-row">
                            {displayRow.map((item, colIdx) => (
                              <React.Fragment key={item.id || `${rowIdx}-${colIdx}`}>
                                {colIdx > 0 && (
                                  <div className="tl-h-connector">
                                    <svg width="60" height="40" viewBox="0 0 60 40" style={{ overflow: 'visible' }}>
                                      <path d={hLine(60, rowIdx * 10 + colIdx)} stroke="var(--text-primary)" fill="none" strokeWidth="1.5" strokeLinecap="round" opacity="0.22" />
                                    </svg>
                                  </div>
                                )}
                                <div className="tl-snake-card" onClick={() => onItemClick(item)}>
                                  <div className="tl-poster">
                                    {item.poster_path
                                      ? <img src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt={item.title || item.name}
                                          loading="lazy" decoding="async"
                                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                                        />
                                      : null
                                    }
                                    <div className="tl-no-poster" style={{ display: item.poster_path ? 'none' : 'block' }} />
                                  </div>
                                  <div className="tl-snake-info">
                                    <span className="tl-note-date">{formatDate(item.watched_at)}</span>
                                    <span className="tl-note-title">{item.title || item.name}</span>
                                    {item.rating > 0 && <span className="tl-note-stars">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>}
                                    {item.note && <span className="tl-note-text">{item.note}</span>}
                                  </div>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                          {!isLastRow && (() => {
                            const seed = rowIdx * 3 + 7;
                            const r = n => { const v = Math.sin(seed * 9.301 + n * 46.218) * 43758.5453; return v - Math.floor(v); };
                            const f = v => +v.toFixed(1);

                            const sx = reversed ? 175 : -65;  // card center x in connector coords
                            const pk = reversed ? -95 : 195;  // outer peak x

                            // C-curve spine: M sx 0 C pk 0 pk 500 sx 500
                            const bx  = t => sx * ((1-t)**3 + t**3) + 3 * pk * t * (1-t);
                            const dbx = t => 3 * (sx - pk) * (2*t - 1); // tangent x-component (dy/dt = 500)

                            // Single bezier segment following C-curve tangents + tiny jitter
                            const drawSeg = (a0, a1, si) => {
                              const tx0 = dbx(a0.t), tx1 = dbx(a1.t);
                              const len0 = Math.sqrt(tx0**2 + 500**2);
                              const len1 = Math.sqrt(tx1**2 + 500**2);
                              const chord = Math.sqrt((a1.x - a0.x)**2 + (a1.y - a0.y)**2);
                              const h = chord / 2.8;
                              const cp1x = f(a0.x + (tx0/len0)*h + (r(si)   - 0.5) * 6);
                              const cp1y = f(a0.y + (500 /len0)*h + (r(si+1) - 0.5) * 4);
                              const cp2x = f(a1.x - (tx1/len1)*h + (r(si+2) - 0.5) * 6);
                              const cp2y = f(a1.y - (500 /len1)*h + (r(si+3) - 0.5) * 4);
                              return ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${f(a1.x)} ${f(a1.y)}`;
                            };

                            const anchors = [{ x: sx, y: 0, t: 0 }, { x: sx, y: 500, t: 1 }];
                            let d = `M ${f(sx)} 0`;
                            for (let i = 1; i < anchors.length; i++) {
                              d += drawSeg(anchors[i-1], anchors[i], i * 10);
                            }

                            return (
                              <div className={`tl-turn-connector ${reversed ? 'turn-left' : 'turn-right'}`}>
                                {gapLabel && <span className="tl-gap">{gapLabel}</span>}
                                <svg width="110" height="100%" viewBox="0 0 110 500" preserveAspectRatio="none" style={{ flex: 1, display: 'block', overflow: 'visible' }}>
                                  <path d={d} stroke="var(--text-primary)" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
                                </svg>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {timelineView === 'grid' && gridTimeframe === 'monthly' && (() => {
                const year = gridNav.year;
                const month = gridNav.month;
                const firstDay = new Date(year, month, 1);
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const startOffset = (firstDay.getDay() + 6) % 7;
                const cells = [];
                for (let i = 0; i < startOffset; i++) cells.push(null);
                for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                return (
                  <>
                    <div className="month-grid">
                      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                        <div key={d} className="month-grid-header-cell">{d}</div>
                      ))}
                      {cells.map((day, i) => {
                        if (!day) return <div key={`empty-${i}`} />;
                        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const entries = watchedByDate[dateKey] || [];
                        const isSelected = selectedGridDay === dateKey;
                        return (
                          <div
                            key={dateKey}
                            className={`month-day-cell${entries.length > 0 ? ' has-entries' : ' month-day-empty'}${isSelected ? ' selected' : ''}`}
                            onClick={() => entries.length > 0 && setSelectedGridDay(isSelected ? null : dateKey)}
                          >
                            {entries[0]?.poster_path && (
                              <img src={`https://image.tmdb.org/t/p/w342${entries[0].poster_path}`} alt="" loading="lazy" decoding="async" />
                            )}
                            <span className="month-day-num">{day}</span>
                            {entries.length > 1 && <span className="month-day-count">+{entries.length - 1}</span>}
                          </div>
                        );
                      })}
                    </div>
                    {selectedGridDay && watchedByDate[selectedGridDay] && (
                      <div className="grid-day-panel">
                        <div className="grid-day-panel-title">{formatDate(selectedGridDay + 'T00:00:00')}</div>
                        <div className="grid-day-entries">
                          {watchedByDate[selectedGridDay].map((item, idx) => (
                            <div key={item.id || idx} className="timeline-card" style={{ width: 150, flexShrink: 0 }} onClick={() => onItemClick(item)}>
                              {item.poster_path
                                ? <img src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                                : null
                              }
                              <div style={{ height: 130, background: 'var(--border-color)', display: item.poster_path ? 'none' : 'block' }} />
                              <div className="timeline-card-info">
                                <span className="timeline-title">{item.title || item.name}</span>
                                {item.rating > 0 && <span style={{ fontSize: '0.7rem' }}>{'★'.repeat(item.rating)}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {timelineView === 'grid' && gridTimeframe === 'yearly' && (() => {
                const year = gridNav.year;
                const months = Array.from({ length: 12 }, (_, m) => m);
                return (
                  <>
                    <div className="year-grid">
                      {months.map(m => {
                        const daysInMonth = new Date(year, m + 1, 0).getDate();
                        return (
                          <div key={m} className="year-month-col">
                            <div className="year-month-label">
                              {new Date(year, m).toLocaleDateString('en-AU', { month: 'short' })}
                            </div>
                            {Array.from({ length: daysInMonth }, (_, d) => {
                              const day = d + 1;
                              const dateKey = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const count = (watchedByDate[dateKey] || []).length;
                              const cls = count === 0 ? 'empty' : count === 1 ? 'count-1' : count === 2 ? 'count-2' : 'count-3plus';
                              const isSelected = selectedGridDay === dateKey;
                              return (
                                <div
                                  key={dateKey}
                                  className={`year-day-cell ${cls}${isSelected ? ' selected' : ''}`}
                                  title={count > 0 ? `${dateKey}: ${count} entr${count === 1 ? 'y' : 'ies'}` : dateKey}
                                  onClick={() => count > 0 && setSelectedGridDay(isSelected ? null : dateKey)}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    {selectedGridDay && watchedByDate[selectedGridDay] && (
                      <div className="grid-day-panel">
                        <div className="grid-day-panel-title">{formatDate(selectedGridDay + 'T00:00:00')}</div>
                        <div className="grid-day-entries">
                          {watchedByDate[selectedGridDay].map((item, idx) => (
                            <div key={item.id || idx} className="timeline-card" style={{ width: 150, flexShrink: 0 }} onClick={() => onItemClick(item)}>
                              {item.poster_path
                                ? <img src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                                : null
                              }
                              <div style={{ height: 130, background: 'var(--border-color)', display: item.poster_path ? 'none' : 'block' }} />
                              <div className="timeline-card-info">
                                <span className="timeline-title">{item.title || item.name}</span>
                                {item.rating > 0 && <span style={{ fontSize: '0.7rem' }}>{'★'.repeat(item.rating)}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
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
