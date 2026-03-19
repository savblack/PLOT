import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { tmdb } from './api/tmdb';
import { supabase } from './api/supabase';
import MediaModal from './components/MediaModal';
import AuthModal from './components/AuthModal';
import PublicProfileView from './components/PublicProfileView';

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
  const [suggested, setSuggested] = useState([]);
  const [mediaFilter, setMediaFilter] = useState('movie'); // movie, tv
  const [userLists, setUserLists] = useState([]);
  const [listItems, setListItems] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profileUsernameInput, setProfileUsernameInput] = useState('');
  const [profileUsernameSaving, setProfileUsernameSaving] = useState(false);
  const [profileUsernameError, setProfileUsernameError] = useState('');
  const [copiedLink, setCopiedLink] = useState(null);
  const [publicProfileUsername, setPublicProfileUsername] = useState(null);
  const [publicProfileInitialList, setPublicProfileInitialList] = useState(null);

  // Check user session and load local fallback
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);

      if (!session) {
        const local = localStorage.getItem('plot-watched');
        if (local) setWatched(JSON.parse(local));
      }

      const params = new URLSearchParams(window.location.search);
      const pUser = params.get('p');
      const pList = params.get('list');
      if (pUser) {
        setPublicProfileUsername(pUser);
        if (pList) setPublicProfileInitialList(pList);
        setView('public');
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

  // Load user profile
  useEffect(() => {
    if (user) {
      const loadProfile = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) { setProfile(data); setProfileUsernameInput(data.username || ''); }
      };
      loadProfile();
    } else {
      setProfile(null);
    }
  }, [user]);

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

  const deleteList = async (listId) => {
    await supabase.from('list_items').delete().match({ list_id: listId });
    await supabase.from('lists').delete().match({ id: listId });
    setUserLists(prev => prev.filter(l => l.id !== listId));
    setListItems(prev => prev.filter(li => li.list_id !== listId));
    setActiveList(null);
  };

  const renameList = async (listId, newName) => {
    if (!newName.trim()) { setEditingListName(false); return; }
    const { error } = await supabase.from('lists').update({ name: newName.trim() }).match({ id: listId });
    if (!error) {
      setUserLists(prev => prev.map(l => l.id === listId ? { ...l, name: newName.trim() } : l));
      setActiveList(prev => ({ ...prev, name: newName.trim() }));
    }
    setEditingListName(false);
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
  const [journalTab, setJournalTab] = useState('lists');
  const [editingListName, setEditingListName] = useState(false);
  const [editListNameValue, setEditListNameValue] = useState('');
  const [showListEditMenu, setShowListEditMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('plot-theme') || 'system');
  const [feedLayout, setFeedLayout] = useState(() => localStorage.getItem('plot-feed-layout') || 'bento');
  const [timelineView, setTimelineView] = useState('linear'); // 'linear' | 'grid'
  const [gridTimeframe, setGridTimeframe] = useState('monthly'); // 'monthly' | 'yearly'
  const [gridNav, setGridNav] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [selectedGridDay, setSelectedGridDay] = useState(null);
  const timelineScrollRef = useRef(null);

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

  useEffect(() => {
    if (journalTab === 'timeline' && timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = timelineScrollRef.current.scrollWidth;
    }
  }, [journalTab, watched]);

  const formatDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const toDateKey = (iso) => iso?.slice(0, 10);
  const moodLabel = m => ({ happy: 'Happy', emotional: 'Emotional', fun: 'Fun', tense: 'Tense', amazing: 'Amazing', mindblown: 'Mind Blown' })[m] || '';
  const tlScribble = (height, seed) => {
    const r = n => { const v = Math.sin(seed * 9.301 + n * 46.218) * 43758.5453; return v - Math.floor(v); };
    const cx = 40; // centre of 80px-wide SVG
    const k = 0.5523; // cubic bezier circle approximation constant
    const numLoops = r(99) > 0.55 ? 0 : height > 100 ? (r(1) > 0.35 ? 2 : 1) : 1;
    const loops = Array.from({ length: numLoops }, (_, i) => ({
      y: ((i + 1) / (numLoops + 1) + (r(i + 5) - 0.5) * 0.12) * height,
      x: cx + (r(i + 20) - 0.5) * 18,
      lr: 9 + r(i + 30) * 6,
      dir: r(i + 40) > 0.5 ? 1 : -1,
    }));
    let px = cx, py = 0;
    let d = `M ${px} ${py}`;
    const seg = (tx, ty, slack, si) => {
      const dy = ty - py;
      d += ` C ${(px + (r(si) - 0.5) * slack).toFixed(1)} ${(py + dy * 0.35).toFixed(1)} ${(tx + (r(si + 1) - 0.5) * slack * 0.6).toFixed(1)} ${(ty - dy * 0.2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
      px = tx; py = ty;
    };
    loops.forEach(({ x: lx, y: ly, lr, dir }, i) => {
      const ex = lx + dir * lr;
      seg(ex, ly, 38, i * 7 + 10);
      if (dir === 1) {
        d += ` C ${lx+lr} ${ly-k*lr} ${lx+k*lr} ${ly-lr} ${lx} ${ly-lr}`;
        d += ` C ${lx-k*lr} ${ly-lr} ${lx-lr} ${ly-k*lr} ${lx-lr} ${ly}`;
        d += ` C ${lx-lr} ${ly+k*lr} ${lx-k*lr} ${ly+lr} ${lx} ${ly+lr}`;
        d += ` C ${lx+k*lr} ${ly+lr} ${lx+lr} ${ly+k*lr} ${lx+lr} ${ly}`;
      } else {
        d += ` C ${lx-lr} ${ly-k*lr} ${lx-k*lr} ${ly-lr} ${lx} ${ly-lr}`;
        d += ` C ${lx+k*lr} ${ly-lr} ${lx+lr} ${ly-k*lr} ${lx+lr} ${ly}`;
        d += ` C ${lx+lr} ${ly+k*lr} ${lx+k*lr} ${ly+lr} ${lx} ${ly+lr}`;
        d += ` C ${lx-k*lr} ${ly+lr} ${lx-lr} ${ly+k*lr} ${lx-lr} ${ly}`;
      }
      px = ex; py = ly;
    });
    seg(cx, height, 38, 90);
    return d;
  };
  const watchedByDate = watched.reduce((acc, item) => {
    const key = toDateKey(item.watched_at);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const toggleProfilePublic = async () => {
    const username = profile?.username || profileUsernameInput.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
    if (!username) { setProfileUsernameError('Set a username first'); return; }
    const next = !(profile?.is_public ?? false);
    const { data, error } = await supabase.from('profiles').upsert({
      id: user.id,
      username,
      is_public: next
    }).select().single();
    if (error) {
      setProfileUsernameError(error.message.includes('unique') ? 'Username taken' : 'Error saving');
    } else if (data) {
      setProfile(data);
      setProfileUsernameInput(data.username);
      setProfileUsernameError('');
    }
  };

  const toggleListPublic = async (listId) => {
    const list = userLists.find(l => l.id === listId);
    if (!list) return;
    const next = !list.is_public;
    const { error } = await supabase.from('lists').update({ is_public: next }).eq('id', listId);
    if (!error) {
      setUserLists(prev => prev.map(l => l.id === listId ? { ...l, is_public: next } : l));
      if (activeList?.id === listId) setActiveList(prev => ({ ...prev, is_public: next }));
    }
  };

  const saveUsername = async () => {
    if (!user) return;
    const cleaned = profileUsernameInput.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
    if (!cleaned || cleaned === profile?.username) return;
    setProfileUsernameSaving(true);
    setProfileUsernameError('');
    const { data, error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: cleaned,
      is_public: profile?.is_public ?? false
    }).select().single();
    if (error) {
      setProfileUsernameError(error.message.includes('unique') ? 'Username taken' : 'Error saving');
      setProfileUsernameInput(profile?.username || '');
    } else if (data) {
      setProfile(data);
      setProfileUsernameError('');
    }
    setProfileUsernameSaving(false);
  };

  const copyLink = (type, id) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = type === 'profile'
      ? `${base}?p=${profile.username}`
      : `${base}?p=${profile.username}&list=${id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(type === 'profile' ? 'profile' : id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

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
            {list.is_public && <span className="list-public-badge">Public</span>}
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
          {list.is_public && <span className="list-public-badge">Public</span>}
        </div>
      </div>
    );
  };

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
                    <div className="profile-public-section">
                      <div className="settings-row">
                        <span className="settings-label">Username</span>
                        <div className="username-input-row">
                          <span className="username-at">@</span>
                          <input
                            className="username-input"
                            value={profileUsernameInput}
                            placeholder="set username"
                            onChange={e => setProfileUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveUsername();
                              if (e.key === 'Escape') setProfileUsernameInput(profile?.username || '');
                            }}
                            onBlur={saveUsername}
                            maxLength={30}
                          />
                          {profileUsernameSaving && <span className="username-saving">...</span>}
                        </div>
                      </div>
                      {profileUsernameError && <p className="username-error">{profileUsernameError}</p>}
                      <div className="settings-row">
                        <span className="settings-label">Visibility</span>
                        <div className="settings-toggle">
                          <button
                            className={profile?.is_public ? 'active' : ''}
                            onClick={() => { if (!profile?.is_public) toggleProfilePublic(); }}
                            title="Public"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button
                            className={!profile?.is_public ? 'active' : ''}
                            onClick={() => { if (profile?.is_public) toggleProfilePublic(); }}
                            title="Private"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          </button>
                        </div>
                      </div>
                      {profile?.is_public && profile?.username && (
                        <div className="settings-row">
                          <button className="copy-link-btn" onClick={() => copyLink('profile')}>
                            {copiedLink === 'profile' ? 'Copied!' : 'Copy profile link'}
                          </button>
                        </div>
                      )}
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
                      onClick={() => setSelectedItem(isVirtualList ? item : { ...item, id: item.tmdb_id })}
                    >
                      <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
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
                  {['lists', 'all', 'status', 'ratings', 'mood', 'timeline'].map(tab => (
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
                      <p className="empty-list-msg">No lists yet. Hit <strong>+ New List</strong> to create one.</p>
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
                        />
                      ))}
                    </div>
                  </>
                )}

                {journalTab === 'all' && (
                  <div className="bento-grid">
                    {watched.length === 0 && (
                      <p className="empty-list-msg">Nothing logged yet. Open any movie or show and hit Save.</p>
                    )}
                    {watched.map((item, index) => (
                      <div
                        key={item.id || index}
                        className="bento-item glass"
                        onClick={() => setSelectedItem(item)}
                      >
                        <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
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
                        items={watched.filter(w => w.watchStatus === status)}
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
                        items={watched.filter(w => w.rating === star)}
                      />
                    ))}
                  </div>
                )}

                {journalTab === 'mood' && (
                  <div className="lists-grid">
                    {[
                      { value: 'happy',     emoji: '😊' },
                      { value: 'emotional', emoji: '🥲' },
                      { value: 'fun',       emoji: '😂' },
                      { value: 'tense',     emoji: '😬' },
                      { value: 'amazing',   emoji: '🤩' },
                      { value: 'mindblown', emoji: '🤯' },
                    ].map(m => (
                      <ListStack
                        key={m.value}
                        list={{ id: `mood-${m.value}`, name: m.emoji }}
                        items={watched.filter(w => w.mood === m.value)}
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

                    {watched.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                        <p className="empty-list-msg">Nothing logged yet.</p>
                        <button
                          className="new-list-header-btn"
                          style={{ marginTop: '0.75rem' }}
                          onClick={() => {
                            const seed = [
                              // Sep 3 — solo
                              { id: 'seed-1', tmdb_id: 550, title: 'Fight Club', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', media_type: 'movie', watched_at: '2025-09-03T18:00:00Z', rating: 5, mood: 'mindblown', watchStatus: 'Watched', notes: 'First rule: you do not talk about Fight Club.' },
                              // Oct 12 — solo
                              { id: 'seed-2', tmdb_id: 238, title: 'The Godfather', poster_path: '/3bhkrj58Vtu7enYsLeMLoNWsgfG.jpg', media_type: 'movie', watched_at: '2025-10-12T20:00:00Z', rating: 5, mood: 'tense', watchStatus: 'Watched', notes: 'An offer I could not refuse.' },
                              // Nov 1 — 3 in one day
                              { id: 'seed-3', tmdb_id: 157336, title: 'Interstellar', poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', media_type: 'movie', watched_at: '2025-11-01T12:00:00Z', rating: 4, mood: 'emotional', watchStatus: 'Watched', notes: 'The ending hit different.' },
                              { id: 'seed-3b', tmdb_id: 27205, title: 'Inception', poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', media_type: 'movie', watched_at: '2025-11-01T15:30:00Z', rating: 5, mood: 'mindblown', watchStatus: 'Watched', notes: null },
                              { id: 'seed-3c', tmdb_id: 816692, title: 'Everything Everywhere All at Once', poster_path: '/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg', media_type: 'movie', watched_at: '2025-11-01T21:00:00Z', rating: 5, mood: 'mindblown', watchStatus: 'Watched', notes: 'Watched three films in one day, no regrets.' },
                              // Nov 20 — solo
                              { id: 'seed-4', tmdb_id: 1396, name: 'Breaking Bad', poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', media_type: 'tv', watched_at: '2025-11-20T19:00:00Z', rating: 5, mood: 'tense', watchStatus: 'Binged', notes: 'I am the one who knocks.' },
                              // Dec 5 — solo
                              { id: 'seed-5', tmdb_id: 19404, title: 'Dilwale Dulhania Le Jayenge', poster_path: '/2CAL2433ZeIihfX1Hb2139CX0pW.jpg', media_type: 'movie', watched_at: '2025-12-05T17:00:00Z', rating: 3, mood: 'happy', watchStatus: 'Watched', notes: null },
                              // Dec 25 — 2 in one day
                              { id: 'seed-6', tmdb_id: 278, title: 'The Shawshank Redemption', poster_path: '/9cqNxx0GxF0bAY0gFZhKPDfejAp.jpg', media_type: 'movie', watched_at: '2025-12-25T14:00:00Z', rating: 5, mood: 'emotional', watchStatus: 'Watched', notes: 'Hope is a good thing.' },
                              { id: 'seed-6b', tmdb_id: 240, title: 'The Godfather Part II', poster_path: '/hek3koDUyRQk7FIhPXsa6mT2Zc3.jpg', media_type: 'movie', watched_at: '2025-12-25T20:00:00Z', rating: 5, mood: 'tense', watchStatus: 'Watched', notes: 'Christmas with the Corleones.' },
                              // Jan 8 — solo
                              { id: 'seed-7', tmdb_id: 424, title: "Schindler's List", poster_path: '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', media_type: 'movie', watched_at: '2026-01-08T18:30:00Z', rating: 5, mood: 'emotional', watchStatus: 'Watched', notes: null },
                              // Jan 22 — solo
                              { id: 'seed-8', tmdb_id: 680, title: 'Pulp Fiction', poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', media_type: 'movie', watched_at: '2026-01-22T21:00:00Z', rating: 4, mood: 'fun', watchStatus: 'Watched', notes: 'Royale with cheese.' },
                              // Feb 14 — 5 in one day (movie marathon)
                              { id: 'seed-9', tmdb_id: 13, title: 'Forrest Gump', poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', media_type: 'movie', watched_at: '2026-02-14T10:00:00Z', rating: 4, mood: 'happy', watchStatus: 'Watched', notes: 'Life is like a box of chocolates.' },
                              { id: 'seed-10', tmdb_id: 11, title: 'Star Wars', poster_path: '/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg', media_type: 'movie', watched_at: '2026-02-14T13:00:00Z', rating: 4, mood: 'amazing', watchStatus: 'Watched', notes: null },
                              { id: 'seed-10b', tmdb_id: 120, title: 'The Lord of the Rings: The Fellowship of the Ring', poster_path: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', media_type: 'movie', watched_at: '2026-02-14T16:00:00Z', rating: 5, mood: 'amazing', watchStatus: 'Watched', notes: null },
                              { id: 'seed-10c', tmdb_id: 121, title: 'The Lord of the Rings: The Two Towers', poster_path: '/5VTN0pR8gcqV3EPUHHfMGnJYspL.jpg', media_type: 'movie', watched_at: '2026-02-14T19:30:00Z', rating: 5, mood: 'tense', watchStatus: 'Watched', notes: null },
                              { id: 'seed-10d', tmdb_id: 122, title: 'The Return of the King', poster_path: '/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg', media_type: 'movie', watched_at: '2026-02-14T23:00:00Z', rating: 5, mood: 'emotional', watchStatus: 'Watched', notes: 'Extended editions. Worth every minute.' },
                              // Mar 1 — solo
                              { id: 'seed-11', tmdb_id: 598, title: 'City of God', poster_path: '/k7eYdWvhYQyRQoU2TB2A2Xu2grZ.jpg', media_type: 'movie', watched_at: '2026-03-01T20:00:00Z', rating: 5, mood: 'tense', watchStatus: 'Watched', notes: 'Brutal and brilliant.' },
                              // Mar 10 — 2 in one day
                              { id: 'seed-12', tmdb_id: 37854, name: 'One Piece', poster_path: '/cMD9Ygz11zjJzAovURpO75Qg7rT.jpg', media_type: 'tv', watched_at: '2026-03-10T15:00:00Z', rating: 4, mood: 'fun', watchStatus: "Didn't Finish", notes: 'Still going...' },
                              { id: 'seed-12b', tmdb_id: 76341, title: 'Mad Max: Fury Road', poster_path: '/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg', media_type: 'movie', watched_at: '2026-03-10T21:00:00Z', rating: 4, mood: 'amazing', watchStatus: 'Watched', notes: 'What a lovely day.' },
                              // Mar 19 — solo
                              { id: 'seed-13', tmdb_id: 496243, title: 'Parasite', poster_path: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', media_type: 'movie', watched_at: '2026-03-19T21:00:00Z', rating: 5, mood: 'tense', watchStatus: 'Watched', notes: 'Did not see that ending coming.' },
                            ];
                            setWatched(seed);
                            localStorage.setItem('plot-watched', JSON.stringify(seed));
                          }}
                        >
                          Load sample data
                        </button>
                      </div>
                    )}

                    {timelineView === 'linear' && (() => {
                      const sorted = [...watched]
                        .filter(item => item.watched_at)
                        .sort((a, b) => new Date(a.watched_at) - new Date(b.watched_at));
                      const dayGroups = sorted.reduce((groups, item) => {
                        const key = toDateKey(item.watched_at);
                        if (!groups.length || groups[groups.length - 1].key !== key) {
                          groups.push({ key, items: [item] });
                        } else {
                          groups[groups.length - 1].items.push(item);
                        }
                        return groups;
                      }, []);
                      const renderCard = (item, k) => (
                        <div key={k} className="tl-entry" onClick={() => setSelectedItem(item)}>
                          <div className="tl-poster">
                            {item.poster_path
                              ? <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt={item.title || item.name} />
                              : <div className="tl-no-poster" />
                            }
                          </div>
                          <div className="tl-info">
                            <span className="tl-title">{item.title || item.name}</span>
                            {item.rating > 0 && <span className="tl-stars">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>}
                          </div>
                          <div className="tl-bottom">
                            <span className="tl-date">{formatDate(item.watched_at)}</span>
                            {item.mood && <span className="tl-mood">{moodLabel(item.mood)}</span>}
                          </div>
                        </div>
                      );
                      return (
                        <div className="tl-vertical">
                          {dayGroups.map((group, dayIdx) => {
                            const anchor = group.items[group.items.length - 1];
                            const extras = group.items.slice(0, -1);
                            const nextGroup = dayGroups[dayIdx + 1];
                            const days = nextGroup ? Math.round((new Date(nextGroup.items[nextGroup.items.length - 1].watched_at) - new Date(anchor.watched_at)) / 86400000) : 0;
                            const scribbleH = nextGroup ? Math.min(Math.max(160 + days * 1.5, 180), 400) : 0;
                            const gapLabel = days >= 365 ? `${Math.round(days / 365)}y` : days >= 30 ? `${Math.round(days / 30)}mo` : days > 6 ? `${days}d` : null;
                            const connector = nextGroup && (
                              <div className="tl-connector">
                                {gapLabel ? (
                                  <>
                                    <svg width="80" height={scribbleH / 2} viewBox={`0 0 80 ${scribbleH / 2}`} style={{ overflow: 'visible' }}>
                                      <path d={tlScribble(scribbleH / 2, dayIdx)} stroke="var(--text-primary)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />
                                    </svg>
                                    <span className="tl-gap">{gapLabel}</span>
                                    <svg width="80" height={scribbleH / 2} viewBox={`0 0 80 ${scribbleH / 2}`} style={{ overflow: 'visible' }}>
                                      <path d={tlScribble(scribbleH / 2, dayIdx + 51)} stroke="var(--text-primary)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />
                                    </svg>
                                  </>
                                ) : (
                                  <svg width="80" height={scribbleH} viewBox={`0 0 80 ${scribbleH}`} style={{ overflow: 'visible' }}>
                                    <path d={tlScribble(scribbleH, dayIdx)} stroke="var(--text-primary)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />
                                  </svg>
                                )}
                              </div>
                            );
                            return (
                              <div key={group.key} className="tl-entry-group">
                                {extras.length > 0 ? (
                                  <div className="tl-day-scroll">
                                    <div className="tl-day-inner">
                                      {[...extras].reverse().map((extra, ei) => renderCard(extra, `${group.key}-${ei}`))}
                                      <div className="tl-anchor-col">
                                        {renderCard(anchor, group.key)}
                                        {connector}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {renderCard(anchor, group.key)}
                                    {connector}
                                  </>
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
                      // Monday-first: Mon=0 ... Sun=6
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
                                    <img src={`https://image.tmdb.org/t/p/w92${entries[0].poster_path}`} alt="" />
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
                                  <div key={item.id || idx} className="timeline-card" style={{ width: 150, flexShrink: 0 }} onClick={() => setSelectedItem(item)}>
                                    {item.poster_path
                                      ? <img src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt={item.title || item.name} />
                                      : <div style={{ height: 130, background: 'var(--border-color)' }} />
                                    }
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
                                  <div key={item.id || idx} className="timeline-card" style={{ width: 150, flexShrink: 0 }} onClick={() => setSelectedItem(item)}>
                                    {item.poster_path
                                      ? <img src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt={item.title || item.name} />
                                      : <div style={{ height: 130, background: 'var(--border-color)' }} />
                                    }
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
          </section>
        )}

        {view === 'public' && publicProfileUsername && (
          <section>
            <PublicProfileView
              username={publicProfileUsername}
              initialListId={publicProfileInitialList}
              onItemClick={setSelectedItem}
              onBack={() => {
                setView('home');
                setPublicProfileUsername(null);
                setPublicProfileInitialList(null);
                window.history.pushState({}, '', window.location.pathname);
              }}
            />
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
              {(mediaFilter === 'movie' ? upcoming : upcomingTV).map((item, index) => (
                <div key={item.id} className={`bento-item glass ${feedLayout === 'bento' && index % 5 === 0 ? 'large' : ''}`} onClick={() => setSelectedItem(item)}>
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
          padding: 1.5rem 4rem;
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

        [data-theme="dark"] .back-btn:hover { color: #f0f0f0; }

        .list-detail-title-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .editable-title {
          cursor: pointer;
        }
        .editable-title:hover { opacity: 0.7; }

        .list-rename-input {
          font-family: var(--font-serif);
          font-size: 2rem;
          font-weight: 600;
          border: none;
          border-bottom: 2px solid #333;
          outline: none;
          background: none;
          color: var(--text-primary);
          width: 300px;
        }

        [data-theme="dark"] .list-rename-input {
          border-bottom-color: #ccc;
        }

        .list-edit-menu-wrapper {
          position: relative;
        }

        .list-edit-btn {
          background: none;
          border: 1px solid #ddd;
          color: var(--text-secondary);
          font-size: 0.78rem;
          font-family: var(--font-sans);
          padding: 0.3rem 0.9rem;
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: var(--transition);
          white-space: nowrap;
        }

        .list-edit-btn:hover { border-color: #aaa; color: var(--text-primary); }

        [data-theme="dark"] .list-edit-btn { border-color: #444; color: #666; }
        [data-theme="dark"] .list-edit-btn:hover { border-color: #777; color: #ccc; }

        .list-edit-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10;
        }

        .list-edit-dropdown {
          position: absolute;
          top: calc(100% + 0.4rem);
          left: 0;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.1);
          overflow: hidden;
          z-index: 11;
          min-width: 140px;
          padding: 0.3rem;
        }

        .list-edit-dropdown button {
          display: block;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          padding: 0.55rem 0.9rem;
          font-size: 0.85rem;
          font-family: var(--font-sans);
          color: var(--text-primary);
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.12s;
        }

        .list-edit-dropdown button:hover { background: #f5f5f5; }
        .list-edit-dropdown button.danger { color: #e55; }
        .list-edit-dropdown button.danger:hover { background: #fff0f0; }

        [data-theme="dark"] .list-edit-dropdown { background: #1e1e1e; border-color: #333; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        [data-theme="dark"] .list-edit-dropdown button { color: #ccc; }
        [data-theme="dark"] .list-edit-dropdown button:hover { background: #2a2a2a; }
        [data-theme="dark"] .list-edit-dropdown button.danger:hover { background: #2a1515; }

        .list-detail-item {
          position: relative;
        }

        .remove-item-btn {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(0,0,0,0.6);
          color: white;
          border: none;
          font-size: 1.1rem;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.15s;
          z-index: 10;
        }

        .list-detail-item:hover .remove-item-btn { opacity: 1; }

        .empty-list-msg {
          color: var(--text-secondary);
          font-size: 0.9rem;
          grid-column: 1 / -1;
          margin-bottom: 1rem;
        }

        .journal-signin-prompt {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding: 1rem 1.2rem;
          background: #f9f9f9;
          border-radius: var(--radius-md);
          border: 1px solid #eee;
        }

        .journal-signin-prompt p {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin: 0;
          flex: 1;
        }

        [data-theme="dark"] .journal-signin-prompt {
          background: #1e1e1e;
          border-color: #2a2a2a;
        }

        .empty-small {
          color: var(--text-secondary);
          font-size: 0.9rem;
          grid-column: 1 / -1;
        }

        .journal-tab-nav {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #eee;
          margin-bottom: 2rem;
        }

        .journal-tab-btn {
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 0.5rem 1.1rem 0.6rem;
          font-size: 0.8rem;
          font-family: var(--font-sans);
          font-weight: 500;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
          cursor: pointer;
          margin-bottom: -1px;
          transition: color 0.15s, border-color 0.15s;
        }

        .journal-tab-btn:hover { color: var(--text-primary); }
        .journal-tab-btn.active { color: var(--text-primary); border-bottom-color: currentColor; }

        [data-theme="dark"] .journal-tab-nav { border-bottom-color: #2a2a2a; }
        [data-theme="dark"] .journal-tab-btn { color: #666; }
        [data-theme="dark"] .journal-tab-btn:hover { color: #ccc; }
        [data-theme="dark"] .journal-tab-btn.active { color: #f0f0f0; }

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
          .app-container { padding: 1rem 1.5rem; }
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

        /* Timeline tab */
        .timeline-tab { padding: 0.5rem 0; }
        .timeline-grid-header { display: flex; align-items: center; gap: 1rem; justify-content: flex-end; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .timeline-grid-nav { display: flex; align-items: center; gap: 0.75rem; margin-right: auto; }
        .timeline-grid-nav button { background: none; border: 1px solid var(--border-color); border-radius: var(--radius-pill, 999px); padding: 0.3rem 0.8rem; cursor: pointer; color: var(--text-primary); font-size: 1rem; line-height: 1; }
        .timeline-view-toggle { display: flex; gap: 0.25rem; background: var(--bg-color); border-radius: var(--radius-pill, 999px); padding: 0.2rem; border: 1px solid var(--border-color); }
        .timeline-view-toggle button { padding: 0.3rem 0.9rem; border-radius: var(--radius-pill, 999px); border: none; cursor: pointer; background: none; color: var(--text-secondary); font-size: 0.8rem; }
        .timeline-view-toggle button.active { background: var(--surface-color); color: var(--text-primary); font-weight: 600; }

        /* Vertical timeline */
        .tl-vertical { display: flex; flex-direction: column; align-items: center; padding: 2rem 1rem 4rem; }
        .tl-entry-group { display: flex; flex-direction: column; align-items: center; width: 100%; }
        .tl-anchor-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
        .tl-day-scroll { overflow-x: auto; direction: rtl; width: 100%; }
        .tl-day-inner { direction: ltr; display: flex; flex-direction: row; gap: 1.5rem; min-width: fit-content; padding-bottom: 0.5rem; align-items: flex-start; padding-right: calc(50% - 130px); padding-left: calc(50% - 130px); }
        .tl-entry { position: relative; width: 260px; cursor: pointer; z-index: 1; }
        .tl-entry:hover .tl-poster { transform: scale(1.02); }
        .tl-mood { font-size: 0.68rem; font-style: italic; color: var(--text-secondary); white-space: nowrap; opacity: 0.8; }
        .tl-poster { border-radius: var(--radius-md, 12px); overflow: hidden; transition: transform 0.2s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.18); }
        .tl-poster img { width: 100%; display: block; aspect-ratio: 2/3; object-fit: cover; }
        .tl-no-poster { width: 100%; aspect-ratio: 2/3; background: var(--border-color); border-radius: var(--radius-md, 12px); }
        .tl-info { display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.55rem; gap: 0.4rem; padding: 0 0.1rem; position: relative; z-index: 1; }
        .tl-title { font-family: 'Playfair Display', serif; font-size: 0.85rem; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; }
        .tl-stars { font-size: 0.65rem; flex-shrink: 0; opacity: 0.9; }
        .tl-bottom { display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.2rem; padding: 0 0.1rem; position: relative; z-index: 1; }
        .tl-date { font-size: 0.65rem; color: var(--text-secondary); }
        .tl-connector { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; margin-top: -54px; position: relative; z-index: 0; }
        .tl-gap { font-size: 0.62rem; color: var(--text-secondary); opacity: 0.55; letter-spacing: 0.08em; padding: 0.15rem 0.5rem; }

        /* Monthly grid */
        .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.35rem; }
        .month-grid-header-cell { text-align: center; font-size: 0.7rem; color: var(--text-secondary); font-weight: 600; padding-bottom: 0.5rem; }
        .month-day-cell { aspect-ratio: 1; border-radius: 8px; overflow: hidden; position: relative; cursor: pointer; background: var(--bg-color); border: 1px solid var(--border-color); }
        .month-day-cell.has-entries { border-color: var(--accent-primary, #7c5cfc); }
        .month-day-cell.selected { outline: 2px solid var(--accent-primary, #7c5cfc); }
        .month-day-cell img { width: 100%; height: 100%; object-fit: cover; opacity: 0.85; display: block; }
        .month-day-num { position: absolute; top: 3px; left: 5px; font-size: 0.65rem; font-weight: 700; color: var(--text-primary); text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
        .month-day-count { position: absolute; bottom: 3px; right: 4px; font-size: 0.6rem; background: var(--accent-primary, #7c5cfc); color: #fff; border-radius: 999px; padding: 0 4px; font-weight: 700; }
        .month-day-empty { cursor: default; }

        /* Yearly grid */
        .year-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 0.5rem; overflow-x: auto; }
        .year-month-col { display: flex; flex-direction: column; gap: 0.2rem; }
        .year-month-label { font-size: 0.65rem; color: var(--text-secondary); text-align: center; margin-bottom: 0.3rem; font-weight: 600; }
        .year-day-cell { aspect-ratio: 1; border-radius: 3px; border: 1px solid var(--border-color); cursor: pointer; transition: opacity 0.15s; }
        .year-day-cell:hover { opacity: 0.7; }
        .year-day-cell.empty { background: var(--bg-color); cursor: default; }
        .year-day-cell.count-1 { background: color-mix(in srgb, var(--accent-primary, #7c5cfc) 30%, transparent); border-color: var(--accent-primary, #7c5cfc); }
        .year-day-cell.count-2 { background: color-mix(in srgb, var(--accent-primary, #7c5cfc) 60%, transparent); border-color: var(--accent-primary, #7c5cfc); }
        .year-day-cell.count-3plus { background: var(--accent-primary, #7c5cfc); border-color: var(--accent-primary, #7c5cfc); }
        .year-day-cell.selected { outline: 2px solid var(--accent-primary, #7c5cfc); }

        /* Expanded day panel */
        .grid-day-panel { margin-top: 1.5rem; padding: 1rem; background: var(--surface-color); border-radius: var(--radius-md, 12px); border: 1px solid var(--border-color); }
        .grid-day-panel-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-secondary); }
        .grid-day-entries { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 0.5rem; }

        /* Profile public settings */
        .profile-public-section {
          border-top: 1px solid rgba(0,0,0,0.06);
          border-bottom: 1px solid rgba(0,0,0,0.06);
          padding: 0.5rem 0;
        }
        .username-input-row {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .username-at { font-size: 0.82rem; color: #bbb; }
        .username-input {
          background: none;
          border: none;
          outline: none;
          font-size: 0.82rem;
          font-family: var(--font-sans);
          color: var(--text-primary);
          width: 100px;
          border-bottom: 1px solid transparent;
          padding: 2px 0;
          transition: border-color 0.15s;
        }
        .username-input:focus { border-bottom-color: #aaa; }
        .username-input::placeholder { color: #ccc; }
        .username-saving { font-size: 0.7rem; color: #aaa; margin-left: 4px; }
        .username-error {
          padding: 0 1.25rem 0.4rem;
          font-size: 0.72rem;
          color: #c00;
          margin: 0;
          display: block;
        }
        .copy-link-btn {
          background: none;
          border: none;
          font-size: 0.78rem;
          font-family: var(--font-sans);
          color: var(--text-secondary);
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
        .copy-link-btn:hover { color: var(--text-primary); }
        .list-public-badge {
          font-size: 0.65rem;
          color: #16a34a;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
          font-weight: 500;
          display: inline-block;
          margin-top: 0.3rem;
        }

        /* Public profile view */
        .public-profile-header {
          display: flex;
          align-items: center;
          gap: 1.2rem;
          margin-bottom: 2.5rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid var(--border-color);
        }
        .public-profile-avatar {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #1a1a1a;
          color: white;
          font-size: 1.5rem;
          font-weight: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sans);
          flex-shrink: 0;
        }
        .public-profile-username {
          font-size: 0.82rem;
          color: var(--text-secondary);
          margin: 0.2rem 0 0;
        }

        [data-theme="dark"] .profile-public-section { border-color: rgba(255,255,255,0.06); }
        [data-theme="dark"] .username-input { color: #f0f0f0; }
        [data-theme="dark"] .username-input:focus { border-bottom-color: #666; }
        [data-theme="dark"] .username-input::placeholder { color: #555; }
        [data-theme="dark"] .username-at { color: #555; }
        [data-theme="dark"] .public-profile-avatar { background: #f0f0f0; color: #1a1a1a; }
        [data-theme="dark"] .list-public-badge { background: #052e16; border-color: #166534; color: #4ade80; }
      `}</style>
    </div>
  );
}
