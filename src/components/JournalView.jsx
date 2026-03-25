import React, { useState, useEffect, useRef } from 'react';
import ImportModal from './ImportModal';

const MOODS = [
  { value: 'happy',         label: 'Happy' },
  { value: 'sad',           label: 'Sad' },
  { value: 'emotional',     label: 'Emotional' },
  { value: 'excited',       label: 'Excited' },
  { value: 'fun',           label: 'Fun' },
  { value: 'tense',         label: 'Tense' },
  { value: 'scared',        label: 'Scared' },
  { value: 'unsettled',     label: 'Unsettled' },
  { value: 'weird',         label: 'Weird' },
  { value: 'cosy',          label: 'Cosy' },
  { value: 'thoughtful',    label: 'Thoughtful' },
  { value: 'inspired',      label: 'Inspired' },
  { value: 'intense',       label: 'Intense' },
  { value: 'stressed',      label: 'Stressed' },
  { value: 'epic',          label: 'Epic' },
  { value: 'haunted',       label: 'Haunted' },
  { value: 'nostalgic',     label: 'Nostalgic' },
  { value: 'melancholy',    label: 'Melancholy' },
  { value: 'gripped',       label: 'Gripped' },
  { value: 'shocked',       label: 'Shocked' },
  { value: 'uncomfortable', label: 'Uncomfortable' },
  { value: 'meh',           label: 'Meh' },
  { value: 'amazing',       label: 'Amazing' },
  { value: 'mindblown',     label: 'Mind Blown' },
];

function ListStack({ list, items, onListClick }) {
  const [hoverIndex, setHoverIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let interval;
    if (isHovered && items.length > 1) {
      interval = setInterval(() => {
        setHoverIndex(prev => (prev + 1) % Math.min(items.length, 5));
      }, 400);
    }
    return () => clearInterval(interval);
  }, [isHovered, items]);

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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setHoverIndex(0); }}
      onClick={() => onListClick(list)}
    >
      <div className="stack-container">
        {items.slice(0, 3).map((item, idx) => {
          const isTop = idx === hoverIndex;
          return (
            <div
              key={item.id}
              className="stack-card"
              style={{
                zIndex: isHovered ? (isTop ? 10 : 5 - idx) : (10 - idx),
                transform: isHovered
                  ? (isTop ? 'translateY(-10px) scale(1.02)' : `translateY(${idx * 2}px) scale(0.95)`)
                  : `rotate(${idx === 0 ? 0 : (idx % 2 === 0 ? 1 : -1) * idx * 4}deg) translateY(${idx * 3}px)`,
                opacity: isHovered ? (isTop ? 1 : 0.4) : 1,
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {item.poster_path
                ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title} />
                : <div className="no-image">{item.title}</div>
              }
            </div>
          );
        })}
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
  user, watched, sampleWatched, mediaFilter,
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

  const activeWatched = watched.length > 0 ? watched : sampleWatched;
  const filteredWatched = activeWatched.filter(item => (item.media_type || (item.title ? 'movie' : 'tv')) === mediaFilter);
  const watchedByDate = filteredWatched.reduce((acc, item) => {
    const key = toDateKey(item.watched_at);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const isVirtualList = activeList && typeof activeList.id === 'string' &&
    (activeList.id.startsWith('status-') || activeList.id.startsWith('rating-') || activeList.id.startsWith('mood-'));

  const activeListItems = activeList
    ? (isVirtualList
        ? watched.filter(w => {
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
            <button className="back-btn" onClick={() => { setActiveList(null); setEditingListName(false); }}>← Back to Journal</button>
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
              {!isVirtualList && (
                <div className="list-edit-menu-wrapper">
                  <button className="new-list-header-btn" onClick={() => setShowListEditMenu(v => !v)}>
                    Edit list
                  </button>
                  {showListEditMenu && (
                    <>
                      <div className="list-edit-backdrop" onClick={() => setShowListEditMenu(false)} />
                      <div className="list-edit-dropdown">
                        <button onClick={() => { setEditListNameValue(activeList.name); setEditingListName(true); setShowListEditMenu(false); }}>
                          Rename
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
            </div>
          </div>
          <div className="bento-grid">
            {activeListItems.map((item, index) => (
              <div
                key={item.id || index}
                className="bento-item glass list-detail-item"
                onClick={() => onItemClick(isVirtualList ? item : { ...item, id: item.tmdb_id })}
              >
                {item.poster_path
                  ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  : <div className="no-image">{item.title || item.name}</div>
                }
                <div className="overlay">
                  <h3>{item.title || item.name}</h3>
                </div>
                {!isVirtualList && (
                  <button
                    className="remove-item-btn"
                    onClick={e => { e.stopPropagation(); toggleListItem(activeList.id, { id: item.tmdb_id }, false); }}
                    title="Remove from list"
                  >×</button>
                )}
              </div>
            ))}
            {activeListItems.length === 0 && (
              <p className="empty-list-msg">Nothing here yet.</p>
            )}
          </div>
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
              {user && userLists.length === 0 && !showJournalNewList && (
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
                    ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
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

                const ROW_SIZE = 3;
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
                                      ? <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt={item.title || item.name}
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
                          {!isLastRow && (
                            <div className={`tl-turn-connector ${reversed ? 'turn-left' : 'turn-right'}`}>
                              {gapLabel && <span className="tl-gap">{gapLabel}</span>}
                              <svg width="80" height="100%" viewBox="0 0 80 260" preserveAspectRatio="xMidYMid meet" style={{ flex: 1, overflow: 'visible' }}>
                                <path d={tlScribble(260, rowIdx * 3 + 7)} stroke="var(--text-primary)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
                              </svg>
                            </div>
                          )}
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
                              <img src={`https://image.tmdb.org/t/p/w342${entries[0].poster_path}`} alt="" />
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
                                ? <img src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt={item.title || item.name} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
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
                                ? <img src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt={item.title || item.name} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
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
    </section>
  );
}
