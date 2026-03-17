import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { tmdb } from './api/tmdb';
import { supabase } from './api/supabase';
import MediaModal from './components/MediaModal';
import AuthModal from './components/AuthModal';

export default function App() {
  const [watched, setWatched] = useState([]);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [view, setView] = useState('home'); // home, search, watchlist, suggested
  const [selectedItem, setSelectedItem] = useState(null);
  const [personalized, setPersonalized] = useState([]);
  const [newReleases, setNewReleases] = useState([]);
  const [newTV, setNewTV] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingTV, setUpcomingTV] = useState([]);
  const [blendedFeed, setBlendedFeed] = useState([]);
  const [mediaFilter, setMediaFilter] = useState('movie'); // movie, tv
  const [userLists, setUserLists] = useState([]);
  const [listItems, setListItems] = useState([]);

  // Check user session and load local fallback
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);

      if (!session) {
        const local = localStorage.getItem('plot-watched');
        if (local) setWatched(JSON.parse(local));
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(prev => {
        const next = session?.user || null;
        if (prev?.id === next?.id) return prev;
        return next;
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync with Supabase when user is logged in
  useEffect(() => {
    if (user) {
      const fetchJournal = async () => {
        const { data, error } = await supabase
          .from('journal')
          .select('*')
          .order('watched_at', { ascending: false });
        if (data) setWatched(data.map(i => ({ ...i, id: i.tmdb_id })));
      };
      
      const fetchLists = async () => {
        const { data: lists } = await supabase.from('lists').select('*');
        if (lists) setUserLists(lists);
        
        const { data: items } = await supabase.from('list_items').select('*').order('created_at', { ascending: false });
        if (items) setListItems(items);
      };

      fetchJournal();
      fetchLists();
    }
  }, [user]);

  useEffect(() => {
    const loadData = async () => {
      const [trendingMovies, nowPlayingData, upcomingData, tvOnAir, trendingTV] = await Promise.all([
        tmdb.getTrending('movie'),
        tmdb.getNowPlaying(),
        tmdb.getUpcoming(),
        tmdb.getTVOnTheAir(),
        tmdb.getTVTrending()
      ]);

      const enrichWithProviders = async (items, type) => {
        return Promise.all(items.map(async (item) => {
          try {
            const providers = await tmdb.getWatchProviders(item.id, type);
            const au = providers.results?.AU;
            const primaryProvider = au?.flatrate?.[0]; 
            return {
              ...item,
              media_type: type,
              provider: primaryProvider ? {
                name: primaryProvider.provider_name,
                logo: `https://image.tmdb.org/t/p/original${primaryProvider.logo_path}`
              } : null
            };
          } catch (e) {
            return { ...item, media_type: type };
          }
        }));
      };

      if (trendingMovies && trendingTV) {
        const [enrichedMovies, enrichedTV] = await Promise.all([
          enrichWithProviders(trendingMovies.results, 'movie'),
          enrichWithProviders(trendingTV.results, 'tv')
        ]);
        // Combine and shuffle for a diverse feed
        setTrending([...enrichedMovies, ...enrichedTV].sort(() => Math.random() - 0.5).slice(0, 40));
      }
      
      if (nowPlayingData) {
        const enriched = await enrichWithProviders(nowPlayingData.results.slice(0, 15), 'movie');
        setNewReleases(enriched);
      }
      
      if (upcomingData) setUpcoming(upcomingData.results.slice(0, 15));
      
      if (tvOnAir) {
        const enriched = await enrichWithProviders(tvOnAir.results.slice(0, 15), 'tv');
        setNewTV(enriched);
      }
      
      if (trendingTV) setUpcomingTV(trendingTV.results.slice(0, 15));
    };
    loadData();
  }, []);

  // Personalized recommendations for the Feed
  useEffect(() => {
    const loadPersonalized = async () => {
      const highRated = watched.filter(i => i.rating >= 4).slice(0, 3);
      if (highRated.length > 0) {
        const allRecs = await Promise.all(
          highRated.map(item => tmdb.getRecommendations(item.media_type, item.tmdb_id))
        );
        const results = allRecs.flatMap(r => r?.results || []).filter(r => !getSavedData(r.id));
        setPersonalized([...new Set(results)].slice(0, 10));
      }
    };
    loadPersonalized();
  }, [watched]);

  // Blend Trending + Personalized for the Feed
  useEffect(() => {
    const blend = [];
    if (personalized.length > 0) {
      // Interleave personalized into trending
      let pIdx = 0;
      trending.forEach((item, index) => {
        blend.push(item);
        if ((index + 1) % 2 === 0 && pIdx < personalized.length) {
          const pItem = personalized[pIdx];
          blend.push({ 
            ...pItem, 
            isPersonalized: true,
            media_type: pItem.title ? 'movie' : 'tv'
          });
          pIdx++;
        }
      });
    } else {
      setBlendedFeed(trending);
    }
    if (blend.length > 0) setBlendedFeed(blend);
  }, [trending, personalized]);

  useEffect(() => {
    if (view === 'suggested') {
      const loadSuggested = async () => {
        const highRated = watched.filter(i => i.rating >= 4).slice(0, 3);
        if (highRated.length === 0) {
          const upcoming = await tmdb.getUpcoming();
          setSuggested(upcoming?.results.slice(0, 10) || []);
          return;
        }

        const allRecs = await Promise.all(
          highRated.map(item => tmdb.getRecommendations(item.type, item.id))
        );
        const results = allRecs.flatMap(r => r?.results || []).filter(r => !getSavedData(r.id));
        setSuggested([...new Set(results)].slice(0, 15));
      };
      loadSuggested();
    }
  }, [view, watched]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const data = await tmdb.search(searchQuery);
    if (data) {
      setSearchResults(data.results);
      setView('search');
    }
  };

  const saveToWatched = async (item) => {
    if (user) {
      const entry = {
        user_id: user.id,
        ...item
      };

      const { error } = await supabase
        .from('journal')
        .upsert(entry, { onConflict: 'user_id, tmdb_id' });

      if (error) {
        console.error('Supabase Sync Error:', error);
      } else {
        // Optimistic update
        setWatched(prev => {
          const idToFind = item.id || item.tmdb_id;
          const existing = prev.findIndex(i => i.id === idToFind || i.tmdb_id === idToFind);
          const updatedItem = { ...item, id: idToFind };
          if (existing > -1) {
            const update = [...prev];
            update[existing] = updatedItem;
            return update;
          }
          return [updatedItem, ...prev];
        });
      }
    } else {
      // Local fallback
      const updated = [...watched];
      const existing = updated.findIndex(i => i.id === item.id);
      if (existing > -1) {
        updated[existing] = item;
      } else {
        updated.unshift(item);
      }
      setWatched(updated);
      localStorage.setItem('plot-watched', JSON.stringify(updated));
    }
  };

  const logout = () => {
    supabase.auth.signOut();
    setWatched([]);
  };

  const getSavedData = (id) => watched.find(i => i.id === id);

  const createList = async (name) => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    const { data, error } = await supabase
      .from('lists')
      .insert({ name, user_id: user.id })
      .select()
      .single();
    if (error) console.error('createList error:', error);
    if (data) setUserLists(prev => [...prev, data]);
    return data;
  };

  const toggleListItem = async (listId, item, isAdding) => {
    if (!user) return;
    if (isAdding) {
      const { data } = await supabase
        .from('list_items')
        .insert({
          list_id: listId,
          user_id: user.id,
          tmdb_id: item.id,
          media_type: item.media_type || (item.title ? 'movie' : 'tv'),
          title: item.title || item.name,
          poster_path: item.poster_path
        })
        .select()
        .single();
      if (data) setListItems(prev => [data, ...prev]);
    } else {
      const { error } = await supabase
        .from('list_items')
        .delete()
        .match({ list_id: listId, tmdb_id: item.id });
      if (!error) setListItems(prev => prev.filter(i => !(i.list_id === listId && i.tmdb_id === item.id)));
    }
  };

  const [activeList, setActiveList] = useState(null);
  const [showJournalNewList, setShowJournalNewList] = useState(false);
  const [journalNewListName, setJournalNewListName] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('plot-theme') || 'system');
  const [feedLayout, setFeedLayout] = useState(() => localStorage.getItem('plot-feed-layout') || 'bento');

  useEffect(() => {
    localStorage.setItem('plot-theme', theme);
    const root = document.documentElement;
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      const handler = e => root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('plot-feed-layout', feedLayout);
  }, [feedLayout]);

  const ListStack = ({ list, items }) => {
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
        <div className="list-stack empty" onClick={() => setActiveList(list)}>
          <div className="stack-container">
            <div className="stack-card empty">
              <span>Empty List</span>
            </div>
          </div>
          <div className="stack-info">
            <h3>{list.name}</h3>
            <p>0 items</p>
          </div>
        </div>
      );
    }

    return (
      <div 
        className="list-stack" 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setHoverIndex(0);
        }}
        onClick={() => setActiveList(list)}
      >
        <div className="stack-container">
          {items.slice(0, 3).map((item, idx) => {
            const isTop = idx === hoverIndex;
            const depth = isHovered ? (isTop ? 0 : 1) : idx;
            
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
                <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title} />
              </div>
            );
          })}
        </div>
        <div className="stack-info">
          <h3>{list.name}</h3>
          <p>{items.length} {items.length === 1 ? 'item' : 'items'}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="main-header animate-in">
        <div className="top-nav">
          <div className="branding-left" onClick={() => setView('home')}>
            <h1 className="logo-font-small">PLOT</h1>
          </div>
          
          <div className="center-group">
            <div className="nav-pills header-nav">
              <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>Feed</button>
              <button onClick={() => setView('new')} className={view === 'new' ? 'active' : ''}>New</button>
              <button onClick={() => setView('upcoming')} className={view === 'upcoming' ? 'active' : ''}>Upcoming</button>
              <button onClick={() => setView('watchlist')} className={view === 'watchlist' ? 'active' : ''}>Journal</button>
            </div>

            <div className="filter-toggle">
              <button 
                className={mediaFilter === 'movie' ? 'active' : ''} 
                onClick={() => setMediaFilter('movie')}
              >
                Movies
              </button>
              <button 
                className={mediaFilter === 'tv' ? 'active' : ''} 
                onClick={() => setMediaFilter('tv')}
              >
                TV
              </button>
            </div>
          </div>

          <div className="header-right">
            <button className="mobile-search-btn" onClick={() => setShowMobileSearch(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
            <div className="search-pill search-small">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <form onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>
          {user ? (
            <div className="profile-menu-wrapper">
              <button className="profile-avatar-btn" onClick={() => setShowProfileMenu(v => !v)}>
                {user.email?.[0]?.toUpperCase()}
              </button>
              {showProfileMenu && createPortal(
                <>
                  <div className="profile-menu-backdrop" onClick={() => setShowProfileMenu(false)} />
                  <div className="profile-dropdown">
                    <div className="profile-dropdown-header">
                      <div className="profile-dropdown-avatar">{user.email?.[0]?.toUpperCase()}</div>
                      <p className="profile-dropdown-email">{user.email}</p>
                    </div>
                    <div className="profile-dropdown-settings">
                      <div className="settings-row">
                        <span className="settings-label">Theme</span>
                        <div className="settings-toggle">
                          <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title="Light">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                          </button>
                          <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title="Dark">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                          </button>
                          <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title="System">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/></svg>
                          </button>
                        </div>
                      </div>
                      <div className="settings-row">
                        <span className="settings-label">View</span>
                        <div className="settings-toggle">
                          <button className={feedLayout === 'bento' ? 'active' : ''} onClick={() => setFeedLayout('bento')} title="Bento">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="11" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="18" width="7" height="3" rx="1"/></svg>
                          </button>
                          <button className={feedLayout === 'grid' ? 'active' : ''} onClick={() => setFeedLayout('grid')} title="Grid">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="9" rx="1"/><rect x="14" y="15" width="7" height="9" rx="1"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <button className="profile-dropdown-item danger" onClick={() => { logout(); setShowProfileMenu(false); }}>
                      Sign Out
                    </button>
                  </div>
                </>,
                document.body
              )}
            </div>
          ) : (
            <button className="auth-header-btn" onClick={() => setShowAuth(true)}>Sign In</button>
          )}
        </div>
      </div>
    </header>

    {showMobileSearch && (
      <div className="mobile-search-overlay">
        <form onSubmit={(e) => { handleSearch(e); setShowMobileSearch(false); }}>
          <input
            type="text"
            placeholder="Search movies & TV..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </form>
        <button className="mobile-search-cancel" onClick={() => setShowMobileSearch(false)}>Cancel</button>
      </div>
    )}

      <main className="content-grid animate-in">
        {view === 'home' && (
          <section>
            <div className="section-header-row">
              <h2 className="section-title">Feed</h2>
              <div className="mobile-filter-row">
                <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
                <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
              </div>
            </div>
            <div className="bento-grid">
              {blendedFeed
                .filter(item => {
                  const type = item.media_type || (item.title ? 'movie' : 'tv');
                  return type === mediaFilter;
                })
                .map((item, index) => (
                <div 
                  key={`${item.id}-${index}`} 
                  className={`bento-item glass ${feedLayout === 'bento' && index % 5 === 0 ? 'large' : ''}`}
                  onClick={() => setSelectedItem(item)}
                >
                  <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  <div className="overlay">
                    {item.isPersonalized && <span className="rec-tag">Recommended for you</span>}
                    <h3>{item.title || item.name}</h3>
                    {getSavedData(item.id) && <span className="watched-dot"></span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === 'new' && (
          <section>
            <div className="section-header-row">
              <h2 className="section-title">New Releases</h2>
              <div className="mobile-filter-row">
                <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
                <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
              </div>
            </div>
            <div className="bento-grid">
              {(mediaFilter === 'movie' ? newReleases : newTV).map((item, index) => (
                <div 
                  key={item.id} 
                  className={`bento-item glass ${feedLayout === 'bento' && index === 0 ? 'large' : ''}`}
                  onClick={() => setSelectedItem(item)}
                >
                  <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
                    {getSavedData(item.id) && <span className="watched-dot"></span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === 'search' && (
          <section className="results">
            <h2 className="section-title">Discovery</h2>
            <div className="bento-grid">
              {searchResults.map(item => (
                <div key={item.id} className="bento-item glass" onClick={() => setSelectedItem(item)}>
                  {item.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  ) : <div className="no-image">{item.title || item.name}</div>}
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === 'watchlist' && (
          <section className="watchlist">
            {activeList ? (
              <div className="list-detail-view animate-in">
                <div className="list-detail-header">
                  <button className="back-btn" onClick={() => setActiveList(null)}>← Back to Journal</button>
                  <h2 className="section-title">{activeList.name}</h2>
                </div>
                <div className="bento-grid">
                  {listItems.filter(li => li.list_id === activeList.id).map(item => (
                    <div key={item.id} className="bento-item glass" onClick={() => setSelectedItem({ ...item, id: item.tmdb_id })}>
                      <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title} />
                      <div className="overlay">
                        <h3>{item.title}</h3>
                      </div>
                    </div>
                  ))}
                  {listItems.filter(li => li.list_id === activeList.id).length === 0 && (
                    <p className="empty">This list is empty. Add some movies or TV shows!</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="journal-section">
                <div className="section-header-row">
                  <h2 className="section-title">Your Lists</h2>
                  {!showJournalNewList && (
                    <button className="new-list-header-btn" onClick={() => setShowJournalNewList(true)}>
                      + New List
                    </button>
                  )}
                </div>
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
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {view === 'upcoming' && (
          <section className="upcoming">
            <div className="section-header-row">
              <h2 className="section-title">Upcoming</h2>
              <div className="mobile-filter-row">
                <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
                <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
              </div>
            </div>
            <div className="bento-grid">
              {(mediaFilter === 'movie' ? upcoming : upcomingTV).map(item => (
                <div key={item.id} className="bento-item glass" onClick={() => setSelectedItem(item)}>
                  <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  <div className="overlay">
                    <span className="rating-tag date-tag">
                      {new Date(item.release_date || item.first_air_date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                    <h3>{item.title || item.name}</h3>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {selectedItem && (
        <MediaModal 
          item={selectedItem} 
          savedData={getSavedData(selectedItem.id)}
          userLists={userLists}
          listItems={listItems.filter(li => li.tmdb_id === selectedItem.id)}
          onCreateList={createList}
          onToggleList={(listId, isAdding) => toggleListItem(listId, selectedItem, isAdding)}
          onSave={saveToWatched}
          onClose={() => setSelectedItem(null)} 
        />
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthSuccess={(u) => setUser(u)}
        />
      )}

      <nav className="bottom-tab-bar">
        <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>Feed</button>
        <button onClick={() => setView('new')} className={view === 'new' ? 'active' : ''}>New</button>
        <button onClick={() => setView('upcoming')} className={view === 'upcoming' ? 'active' : ''}>Upcoming</button>
        <button onClick={() => setView('watchlist')} className={view === 'watchlist' ? 'active' : ''}>Journal</button>
      </nav>

      <style>{`
        .app-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1.5rem;
        }

        .main-header {
          margin-bottom: 2rem;
        }

        .top-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          margin-bottom: 2rem;
          position: relative;
        }

        .center-group {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.8rem;
          white-space: nowrap;
        }

        .branding-left {
          cursor: pointer;
        }

        .logo-font-small {
          font-family: var(--font-serif);
          font-size: 1.8rem;
          font-weight: 500;
          margin: 0;
          letter-spacing: -0.05em;
          text-transform: uppercase;
        }

        .header-right {
          display: flex;
          align-items: center;
        }

        .filter-toggle {
          display: flex;
          background: #efefef;
          padding: 0.3rem;
          border-radius: var(--radius-pill);
          gap: 0.2rem;
          border: none !important;
        }

        .filter-toggle button {
          background: none;
          border: none;
          padding: 0.5rem 1.2rem;
          border-radius: var(--radius-pill);
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
          color: var(--text-secondary);
          transition: var(--transition);
        }

        .filter-toggle button.active {
          background: white;
          color: black;
          box-shadow: none !important;
          border: none !important;
        }

        .search-pill.search-small {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-pill);
          width: 200px;
          background: #efefef;
          border: none;
        }

        .search-pill.search-small input {
          background: none;
          border: none;
          outline: none;
          width: 100%;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .search-icon { color: #888; }

        .auth-header-btn {
          background: none;
          border: 1px solid #ddd;
          padding: 0.5rem 1.2rem;
          border-radius: var(--radius-pill);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-secondary);
          margin-left: 0.8rem;
          transition: var(--transition);
        }

        .auth-header-btn:hover {
          border-color: #000;
          color: #000;
        }

        .header-nav {
          background: #efefef;
          padding: 0.3rem;
          border-radius: var(--radius-pill);
          display: flex;
          gap: 0.2rem;
          border: none !important;
        }

        .header-nav button {
          background: none;
          border: none;
          padding: 0.5rem 1.5rem;
          border-radius: var(--radius-pill);
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
          color: var(--text-secondary);
          transition: var(--transition);
        }

        .header-nav button.active {
          background: white;
          color: var(--text-primary);
          box-shadow: none !important;
          border: none !important;
        }


        .section-title {
          font-family: var(--font-serif);
          font-size: 1.5rem;
          margin-bottom: 2rem;
          text-align: left;
          font-weight: 400;
          color: #000;
        }

        .bento-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          grid-auto-rows: 400px;
          gap: 1.5rem;
          grid-auto-flow: dense;
        }

        .bento-item {
          position: relative;
          border-radius: var(--radius-lg);
          overflow: hidden;
          cursor: pointer;
          border: none;
          transition: var(--transition);
          z-index: 0;
        }

        .bento-item.large {
          grid-column: span 2;
          grid-row: span 2;
        }

        .bento-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: var(--transition);
        }

        .provider-overlay {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          overflow: hidden;
          z-index: 5;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          background: white;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .provider-overlay img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .bento-item:hover {
          transform: scale(0.98);
        }

        .bento-item:hover img {
          transform: scale(1.05);
        }

        .overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 2rem;
          background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
          color: white;
          opacity: 0;
        }

        .bento-item:hover .overlay {
          opacity: 1;
        }

        .overlay {
          transition: opacity 0.2s ease-in-out !important;
        }

        .overlay h3 {
          font-family: var(--font-serif);
          font-size: 1.4rem;
          margin: 0;
        }

        .rating-tag {
          background: white;
          color: black;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-md);
          font-size: 0.8rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          display: inline-block;
        }

        .date-tag {
          background: rgba(255, 255, 255, 0.4) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          color: white;
          transition: none !important;
        }

        .watched-dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 2rem;
          right: 2rem;
          box-shadow: 0 0 10px rgba(255,255,255,0.5);
        }

        .subtitle {
          text-align: left;
          color: var(--text-secondary);
          margin-top: -1.5rem;
          margin-bottom: 3rem;
        }

        .rec-tag {
          font-size: 0.75rem;
          background: black;
          color: white;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-md);
          margin-bottom: 0.5rem;
          display: inline-block;
        }

        .section-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .section-header-row .section-title {
          margin-bottom: 0;
        }

        .section-header-row .mobile-filter-row {
          margin-bottom: 0;
        }

        /* Mobile-only elements: hidden by default */
        .mobile-search-btn {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
          color: var(--text-primary);
          align-items: center;
        }

        .mobile-filter-row {
          display: none;
          background: #efefef;
          padding: 0.3rem;
          border-radius: var(--radius-pill);
          gap: 0.2rem;
          margin-bottom: 1.5rem;
        }

        .mobile-filter-row button {
          background: none;
          border: none;
          padding: 0.5rem 1.2rem;
          border-radius: var(--radius-pill);
          cursor: pointer;
          font-weight: 500;
          font-size: 0.9rem;
          color: var(--text-secondary);
          transition: var(--transition);
        }

        .mobile-filter-row button.active {
          background: white;
          color: black;
        }

        .mobile-search-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: white;
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.8rem;
          z-index: 200;
          box-shadow: 0 2px 20px rgba(0,0,0,0.1);
        }

        .mobile-search-overlay form { flex: 1; }

        .mobile-search-overlay input {
          width: 100%;
          background: #f0f0f0;
          border: none;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-pill);
          font-size: 1rem;
          outline: none;
          font-family: inherit;
        }

        .mobile-search-cancel {
          background: none;
          border: none;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .bottom-tab-bar {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid rgba(0,0,0,0.08);
          padding: 0.5rem 0;
          padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
          z-index: 100;
          justify-content: space-around;
        }

        .bottom-tab-bar button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.6rem 1rem;
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-weight: 500;
          font-family: var(--font-sans);
          transition: color 0.2s ease;
        }

        .bottom-tab-bar button.active { color: black; }

        /* Custom Lists & Stacks */
        .lists-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 2.5rem;
          margin-top: 1.5rem;
        }

        .list-stack {
          cursor: pointer;
        }

        .stack-container {
          position: relative;
          height: 300px;
          width: 100%;
          margin-bottom: 1rem;
        }

        .stack-card {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: var(--radius-md);
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }

        .stack-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .stack-card.empty {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f0f0f0;
          border: 2px dashed #ddd;
          color: #999;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .stack-info h3 {
          font-family: var(--font-serif);
          font-size: 1.2rem;
          margin-bottom: 0.2rem;
        }

        .stack-info p {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .list-detail-header {
          margin-bottom: 3rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .back-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 0.9rem;
          cursor: pointer;
          align-self: flex-start;
          padding: 0;
        }

        .back-btn:hover { color: black; }

        .empty-small {
          color: var(--text-secondary);
          font-size: 0.9rem;
          grid-column: 1 / -1;
        }

        .new-list-header-btn {
          background: none;
          border: 1px solid #ccc;
          color: var(--text-secondary);
          padding: 0.4rem 1rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          cursor: pointer;
          font-family: var(--font-sans);
          transition: var(--transition);
        }
        .new-list-header-btn:hover {
          border-color: #999;
          color: var(--text-primary);
        }

        .new-list-bar {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .new-list-bar input {
          flex: 1;
          background: var(--bg-secondary);
          border: 1px solid #ddd;
          padding: 0.6rem 1rem;
          border-radius: var(--radius-pill);
          font-size: 0.85rem;
          outline: none;
          font-family: var(--font-sans);
        }
        .new-list-bar input:focus { border-color: #aaa; }
        .new-list-bar button {
          background: #444;
          color: #f0f0f0;
          border: none;
          padding: 0.6rem 1.1rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          cursor: pointer;
          font-family: var(--font-sans);
        }
        .new-list-bar .cancel-btn {
          background: none;
          color: var(--text-secondary);
          border: 1px solid #ddd;
        }
        .new-list-bar .cancel-btn:hover { border-color: #aaa; }

        /* Profile menu */
        .profile-menu-wrapper {
          position: relative;
          margin-left: 0.8rem;
        }

        .profile-avatar-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #1a1a1a;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans);
          transition: opacity 0.2s ease;
        }

        .profile-avatar-btn:hover { opacity: 0.8; }

        .profile-menu-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9998;
        }

        .profile-dropdown {
          position: fixed;
          top: 70px;
          right: 1.5rem;
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: 0 8px 40px rgba(0,0,0,0.12);
          border: 1px solid rgba(0,0,0,0.06);
          min-width: 220px;
          z-index: 9999;
          overflow: hidden;
          animation: fadeIn 0.15s ease;
        }

        .profile-dropdown-header {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          background: #f8f8f8;
        }

        .profile-dropdown-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #1a1a1a;
          color: white;
          font-size: 1.3rem;
          font-weight: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans);
        }

        .profile-dropdown-email {
          font-size: 0.8rem;
          color: var(--text-secondary);
          text-align: center;
          word-break: break-all;
        }

        .profile-dropdown-item {
          width: 100%;
          background: none;
          border: none;
          padding: 0.9rem 1.5rem;
          text-align: left;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          color: var(--text-primary);
          font-family: var(--font-sans);
          transition: background 0.15s ease;
          display: block;
        }

        .profile-dropdown-item:hover { background: #f8f8f8; }
        .profile-dropdown-item.danger { color: #c00; }

        .profile-dropdown-settings {
          padding: 0.5rem 0;
          border-bottom: 1px solid rgba(0,0,0,0.06);
        }

        .settings-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.65rem 1.25rem;
        }

        .settings-label {
          font-size: 0.82rem;
          color: var(--text-secondary);
          font-family: var(--font-sans);
          font-weight: 500;
          letter-spacing: 0.01em;
        }

        .settings-toggle {
          display: flex;
          gap: 2px;
          background: #ebebeb;
          border-radius: 999px;
          padding: 3px;
        }

        [data-theme="dark"] .profile-dropdown {
          background: #1c1c1c;
          border-color: rgba(255,255,255,0.08);
          box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        }

        [data-theme="dark"] .profile-dropdown-header {
          background: #141414;
        }

        [data-theme="dark"] .profile-dropdown-avatar {
          background: #f0f0f0;
          color: #1a1a1a;
        }

        [data-theme="dark"] .profile-dropdown-email {
          color: #888;
        }

        [data-theme="dark"] .profile-dropdown-settings {
          border-bottom-color: rgba(255,255,255,0.06);
        }

        [data-theme="dark"] .settings-label {
          color: #777;
        }

        [data-theme="dark"] .settings-toggle {
          background: #2a2a2a;
        }

        [data-theme="dark"] .settings-toggle button.active {
          background: #3a3a3a;
          color: #f0f0f0;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }

        [data-theme="dark"] .settings-toggle button:hover {
          color: #ccc;
        }

        [data-theme="dark"] .profile-dropdown-item {
          color: #f0f0f0;
        }

        [data-theme="dark"] .profile-dropdown-item:hover {
          background: #2a2a2a;
        }

        [data-theme="dark"] .header-nav {
          background: #222;
        }
        [data-theme="dark"] .header-nav button.active {
          background: #383838;
          color: #f0f0f0;
        }

        [data-theme="dark"] .filter-toggle {
          background: #222;
        }
        [data-theme="dark"] .filter-toggle button.active {
          background: #383838;
          color: #f0f0f0;
        }

        [data-theme="dark"] .search-pill.search-small {
          background: #222;
        }
        [data-theme="dark"] .search-pill.search-small input::placeholder {
          color: #666;
        }

        [data-theme="dark"] .mobile-filter-row {
          background: #222;
        }
        [data-theme="dark"] .mobile-filter-row button.active {
          background: #383838;
          color: #f0f0f0;
        }

        [data-theme="dark"] .mobile-search-overlay {
          background: #1c1c1c;
        }

        [data-theme="dark"] .auth-header-btn {
          border-color: #333;
        }

        [data-theme="dark"] .section-title {
          color: #f0f0f0;
        }

        [data-theme="dark"] .new-list-header-btn {
          border-color: #444;
        }
        [data-theme="dark"] .new-list-bar input {
          background: #2a2a2a;
          border-color: #444;
          color: #f0f0f0;
        }
        [data-theme="dark"] .new-list-bar .cancel-btn {
          border-color: #444;
        }

        .settings-toggle button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 26px;
          border: none;
          border-radius: 999px;
          background: transparent;
          color: #999;
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
        }

        .settings-toggle button:hover {
          color: #555;
        }

        .settings-toggle button.active {
          background: white;
          color: #1a1a1a;
          box-shadow: 0 1px 4px rgba(0,0,0,0.12);
        }

        @media (max-width: 1024px) {
          .center-group { display: none; }
          .search-pill.search-small { display: none; }
          .mobile-search-btn { display: flex; }
          .mobile-filter-row { display: flex; }
          .bottom-tab-bar { display: flex; }
          .content-grid { padding-bottom: 80px; }
          .header-right { gap: 0.2rem; }
          .auth-header-btn { margin-left: 0; }
          .profile-menu-wrapper { margin-left: 0; }
        }

        @media (max-width: 768px) {
          .search-pill { width: 100%; }
          .logo-font { font-size: 2.5rem; }
          .bento-item.large { grid-column: span 1; grid-row: span 1; }
          .mobile-filter-row { display: flex; }
          .app-container { padding: 1rem; }
          .top-nav { padding: 0.6rem 0; margin-bottom: 1rem; }
          .section-title { font-size: 1.3rem; }
          .bento-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            grid-auto-rows: 240px;
            gap: 0.75rem;
          }
          .lists-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }
          .list-stack { padding: 0.4rem; }
          .stack-container { height: auto; aspect-ratio: 2/3; }
        }

        @media (max-width: 480px) {
          .bento-grid {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            grid-auto-rows: 200px;
          }
          .lists-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
          }
          .list-stack { padding: 0.4rem; }
          .stack-container { height: auto; aspect-ratio: 2/3; }
        }
      `}</style>
    </div>
  );
}
