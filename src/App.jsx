import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './app.css';
import { tmdb, setTmdbRegion } from './api/tmdb';
import { supabase } from './api/supabase';
import { GENRES } from './constants.js';
import { formatDate, toDateKey, moodLabel, tlScribble } from './utils/journal.js';
import { sampleImageCorner } from './utils/imageUtils.js';
import MediaModal from './components/MediaModal';
import AuthModal from './components/AuthModal';
import PublicProfileView from './components/PublicProfileView';
import FeedView from './components/FeedView';
import NewReleasesView from './components/NewReleasesView';
import SearchView from './components/SearchView';
import UpcomingView from './components/UpcomingView';
import JournalView from './components/JournalView';
import ImportModal from './components/ImportModal';
import AvatarCropModal from './components/AvatarCropModal';
import AppHeader from './components/AppHeader';


export default function App() {
  const { username: routeUsername, listId: routeListId, view: routeView } = useParams();
  const navigate = useNavigate();

  const [watched, setWatched] = useState([]);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [view, setView] = useState('home');
  const [selectedItem, setSelectedItem] = useState(null);
  const [forYouFeed, setForYouFeed] = useState([]);
  const [feedTab, setFeedTab] = useState('foryou');
  const [newReleasesTab, setNewReleasesTab] = useState('all');
  const [preferences, setPreferences] = useState({ genres: [], region: 'AU' });
  const [newReleases, setNewReleases] = useState([]);
  const [newTV, setNewTV] = useState([]);
  const [streamingMovies, setStreamingMovies] = useState([]);
  const [streamingTV, setStreamingTV] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingTV, setUpcomingTV] = useState([]);
  const [mediaFilter, setMediaFilter] = useState('movie'); // movie, tv
  const [userLists, setUserLists] = useState([]);
  const [listItems, setListItems] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profileUsernameInput, setProfileUsernameInput] = useState('');
  const [profileUsernameSaving, setProfileUsernameSaving] = useState(false);
  const [profileUsernameError, setProfileUsernameError] = useState('');
  const [copiedLink, setCopiedLink] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [publicProfileUsername, setPublicProfileUsername] = useState(null);
  const [publicProfileInitialList, setPublicProfileInitialList] = useState(null);
  const [followingFeed, setFollowingFeed] = useState([]);
  const [followingFeedLoaded, setFollowingFeedLoaded] = useState(false);


  // Check user session and load local fallback
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);

      if (!session) {
        const local = localStorage.getItem('plot-watched');
        if (local) setWatched(JSON.parse(local));
      }

      const savedPrefs = localStorage.getItem('plot-prefs');
      if (savedPrefs) setPreferences(JSON.parse(savedPrefs));

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
        if (data) {
          setProfile(data);
          setProfileUsernameInput(data.username || '');
          if (data.genres?.length) setPreferences(p => ({ ...p, genres: data.genres }));
          if (data.region) { setPreferences(p => ({ ...p, region: data.region })); setTmdbRegion(data.region); }
        }
      };
      loadProfile();
    } else {
      setProfile(null);
    }
  }, [user]);

  // Route params drive the view state
  useEffect(() => {
    if (routeUsername) {
      setPublicProfileUsername(routeUsername);
      if (routeListId) setPublicProfileInitialList(routeListId);
      setView('public');
    } else if (routeView) {
      setView(routeView);
    } else {
      setView('home');
    }
  }, [routeUsername, routeListId, routeView]);

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

  // Load following feed lazily when tab is first activated
  useEffect(() => {
    if (feedTab !== 'following' || !user || followingFeedLoaded) return;
    const fetchFollowingFeed = async () => {
      const { data: followRows } = await supabase
        .from('follows').select('following_id').eq('follower_id', user.id);
      const ids = followRows?.map(r => r.following_id) ?? [];
      if (!ids.length) { setFollowingFeed([]); setFollowingFeedLoaded(true); return; }
      const [{ data: entries }, { data: profiles }] = await Promise.all([
        supabase.from('journal').select('*').in('user_id', ids).order('watched_at', { ascending: false }).limit(60),
        supabase.from('profiles').select('id, username, display_name').in('id', ids),
      ]);
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
      setFollowingFeed((entries ?? []).map(e => ({ ...e, profile: profileMap[e.user_id] ?? null })));
      setFollowingFeedLoaded(true);
    };
    fetchFollowingFeed();
  }, [feedTab, user, followingFeedLoaded]);

  useEffect(() => {
    const loadData = async () => {
      const [trendingMovies, nowPlayingData, upcomingData, tvOnAir, trendingTV, upcomingTVData] = await Promise.all([
        tmdb.getTrending('movie'),
        tmdb.getNowPlaying(),
        tmdb.getUpcoming(),
        tmdb.getTVOnTheAir(),
        tmdb.getTVTrending(),
        tmdb.getUpcomingTV(),
      ]);

      const enrichWithProviders = async (items, type) => {
        return Promise.all(items.map(async (item) => {
          try {
            const providers = await tmdb.getWatchProviders(item.id, type);
            const regionData = providers.results?.[preferences.region || 'AU'];
            const primaryProvider = regionData?.flatrate?.[0];
            return {
              ...item,
              media_type: type,
              provider: primaryProvider ? {
                name: primaryProvider.provider_name,
                logo: `https://image.tmdb.org/t/p/w92${primaryProvider.logo_path}`
              } : null
            };
          } catch (e) {
            return { ...item, media_type: type };
          }
        }));
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isReleased = (item) => { const d = item.release_date || item.first_air_date; return d ? new Date(d) <= today : false; };
      const isFuture   = (item) => { const d = item.release_date || item.first_air_date; return d ? new Date(d) >  today : false; };
      const byDateAsc  = (a, b) => new Date(a.release_date || a.first_air_date) - new Date(b.release_date || b.first_air_date);

      if (trendingMovies && trendingTV) {
        const [enrichedMovies, enrichedTV] = await Promise.all([
          enrichWithProviders(trendingMovies.results ?? [], 'movie'),
          enrichWithProviders(trendingTV.results ?? [], 'tv')
        ]);
        // Combine, deduplicate, and shuffle for a diverse feed
        const seen = new Set();
        const deduped = [...enrichedMovies, ...enrichedTV].filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        setTrending(deduped.sort(() => Math.random() - 0.5).slice(0, 120));
      }

      if (nowPlayingData) {
        const enriched = await enrichWithProviders(nowPlayingData.results.filter(isReleased).slice(0, 40), 'movie');
        setNewReleases(enriched);
      }

      if (upcomingData) setUpcoming(upcomingData.results.filter(isFuture).sort(byDateAsc).slice(0, 40));

      if (tvOnAir) {
        const enriched = await enrichWithProviders(tvOnAir.results.filter(isReleased).slice(0, 40), 'tv');
        setNewTV(enriched);
      }

      if (upcomingTVData) setUpcomingTV(upcomingTVData.results.filter(isFuture).sort(byDateAsc).slice(0, 40));

      const [streamingMovieData, streamingTVData] = await Promise.all([
        tmdb.getStreamingMovies(),
        tmdb.getStreamingTV(),
      ]);
      if (streamingMovieData) {
        const enriched = await enrichWithProviders(streamingMovieData.results.slice(0, 60), 'movie');
        setStreamingMovies(enriched);
      }
      if (streamingTVData) {
        const enriched = await enrichWithProviders(streamingTVData.results.slice(0, 60), 'tv');
        setStreamingTV(enriched);
      }
    };
    loadData();
  }, [preferences.region]);

  // Persist preferences to localStorage
  useEffect(() => {
    localStorage.setItem('plot-prefs', JSON.stringify(preferences));
  }, [preferences]);

  // Sync region to TMDB module
  useEffect(() => {
    setTmdbRegion(preferences.region || 'AU');
  }, [preferences.region]);

  // For You feed — improves with every item the user logs
  useEffect(() => {
    const loadForYou = async () => {
      const watchedIds = new Set(watched.map(i => i.tmdb_id || i.id));

      // Use top 10 rated items as seeds; fall back to most recently logged
      const seeds = [...watched]
        .filter(i => i.rating)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);
      const finalSeeds = seeds.length > 0 ? seeds : watched.slice(0, 5);

      if (finalSeeds.length === 0) {
        if (preferences.genres.length === 0) return;
        const movieIds = preferences.genres.map(k => GENRES.find(g => g.key === k)?.movieId).filter(Boolean);
        const tvIds    = preferences.genres.map(k => GENRES.find(g => g.key === k)?.tvId).filter(Boolean);
        const [movieData, tvData] = await Promise.all([
          tmdb.discoverByGenres('movie', movieIds),
          tmdb.discoverByGenres('tv', tvIds),
        ]);
        const combined = [
          ...(movieData?.results || []).map(i => ({ ...i, media_type: 'movie' })),
          ...(tvData?.results   || []).map(i => ({ ...i, media_type: 'tv' })),
        ].sort((a, b) => b.popularity - a.popularity).slice(0, 60);
        if (combined.length > 0) setForYouFeed(combined);
        return;
      }

      const allRecs = await Promise.all(
        finalSeeds.map(item =>
          tmdb.getRecommendations(
            item.media_type || (item.title ? 'movie' : 'tv'),
            item.tmdb_id || item.id
          )
        )
      );

      const seen = new Set();
      const results = allRecs
        .flatMap(r => r?.results || [])
        .filter(r => {
          if (watchedIds.has(r.id) || seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        })
        .sort((a, b) =>
          (b.vote_average * Math.log(b.vote_count + 1)) -
          (a.vote_average * Math.log(a.vote_count + 1))
        )
        .slice(0, 40);

      if (results.length > 0) setForYouFeed(results);
    };
    loadForYou();
  }, [watched, preferences.genres]);

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
        user_id:     user.id,
        tmdb_id:     item.tmdb_id || item.id,
        media_type:  item.media_type || (item.title ? 'movie' : 'tv'),
        title:       item.title || item.name || null,
        poster_path: item.poster_path || null,
        rating:      item.rating || null,
        note:        item.note || null,
        mood:        item.mood || null,
        watchStatus: item.watchStatus || null,
        watched_at:  item.watched_at || null,
        updatedAt:   item.updatedAt || null,
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

  const navigateTo = (nextView) => {
    if (nextView === 'home')      setFeedTab('foryou');
    if (nextView === 'new')       setNewReleasesTab('all');
    if (nextView === 'upcoming')  setUpcomingTimeFilter('week');
    if (nextView === 'watchlist') setJournalTab('lists');
    setView(nextView);
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
    const { error: itemsError } = await supabase.from('list_items').delete().match({ list_id: listId });
    if (itemsError) { console.error('deleteList items error:', itemsError); alert('Failed to delete list. Please try again.'); return; }
    const { error: listError } = await supabase.from('lists').delete().match({ id: listId });
    if (listError) { console.error('deleteList error:', listError); alert('Failed to delete list. Please try again.'); return; }
    setUserLists(prev => prev.filter(l => l.id !== listId));
    setListItems(prev => prev.filter(li => li.list_id !== listId));
    setActiveList(null);
  };

  const renameList = async (listId, newName) => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('lists').update({ name: newName.trim() }).match({ id: listId });
    if (!error) {
      setUserLists(prev => prev.map(l => l.id === listId ? { ...l, name: newName.trim() } : l));
      setActiveList(prev => ({ ...prev, name: newName.trim() }));
    }
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
  const [journalTab, setJournalTab] = useState('lists');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showTasteExpanded, setShowTasteExpanded] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('plot-theme') || 'system');
  const [feedLayout, setFeedLayout] = useState(() => localStorage.getItem('plot-feed-layout') || 'bento');

  const [upcomingTimeFilter, setUpcomingTimeFilter] = useState('month');
  const [timelineView, setTimelineView] = useState('linear'); // 'linear' | 'grid'
  const [gridTimeframe, setGridTimeframe] = useState('monthly'); // 'monthly' | 'yearly'
  const [gridNav, setGridNav] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [selectedGridDay, setSelectedGridDay] = useState(null);

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

  const deleteFromJournal = async (tmdbIds) => {
    if (!user) return;
    const { error: journalError } = await supabase.from('journal').delete().in('tmdb_id', tmdbIds);
    if (journalError) { console.error('deleteFromJournal error:', journalError); alert('Failed to delete entry. Please try again.'); return; }
    await supabase.from('list_items').delete().in('tmdb_id', tmdbIds).eq('user_id', user.id);
    setWatched(prev => prev.filter(w => !tmdbIds.includes(w.tmdb_id || w.id)));
    setListItems(prev => prev.filter(li => !tmdbIds.includes(li.tmdb_id)));
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

  const avatarInputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);

  const uploadAvatar = async (blob) => {
    if (!user || !blob) return;
    const path = `${user.id}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (uploadError) return;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    const { data } = await supabase.from('profiles').upsert({
      id: user.id,
      username: profile?.username || '',
      is_public: profile?.is_public ?? false,
      avatar_url: url,
    }).select().single();
    if (data) setProfile(data);
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
    if (!profile) return;
    const base = window.location.origin;
    const url = type === 'profile'
      ? `${base}/u/${profile.username}`
      : `${base}/u/${profile.username}/list/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(type === 'profile' ? 'profile' : id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  return (
    <div className="app-container">
      <AppHeader
        user={user} profile={profile}
        view={view} navigateTo={navigateTo}
        mediaFilter={mediaFilter} setMediaFilter={setMediaFilter}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} handleSearch={handleSearch}
        showProfileMenu={showProfileMenu} setShowProfileMenu={setShowProfileMenu}
        showMobileSearch={showMobileSearch} setShowMobileSearch={setShowMobileSearch}
        theme={theme} setTheme={setTheme}
        feedLayout={feedLayout} setFeedLayout={setFeedLayout}
        preferences={preferences} setPreferences={setPreferences}
        profileUsernameInput={profileUsernameInput} setProfileUsernameInput={setProfileUsernameInput}
        profileUsernameSaving={profileUsernameSaving} profileUsernameError={profileUsernameError}
        saveUsername={saveUsername} toggleProfilePublic={toggleProfilePublic}
        copyLink={copyLink} copiedLink={copiedLink}
        showTasteExpanded={showTasteExpanded} setShowTasteExpanded={setShowTasteExpanded}
        setShowImportModal={setShowImportModal}
        logout={logout} setShowAuth={setShowAuth}
        avatarInputRef={avatarInputRef} setCropFile={setCropFile}
      />

      <main className="content-grid animate-in">
        {view === 'home' && (
          <FeedView
            feedTab={feedTab} setFeedTab={setFeedTab}
            forYouFeed={forYouFeed} trending={trending}
            mediaFilter={mediaFilter} feedLayout={feedLayout}
            preferences={preferences}
            followingFeed={followingFeed} followingLoading={!followingFeedLoaded} user={user}
            getSavedData={getSavedData} onItemClick={setSelectedItem}
            onNavigateToProfile={(uname) => { setPublicProfileUsername(uname); setView('public'); navigate(`/u/${uname}`); }}
          />
        )}

        {view === 'new' && (
          <NewReleasesView
            newReleasesTab={newReleasesTab} setNewReleasesTab={setNewReleasesTab}
            mediaFilter={mediaFilter} feedLayout={feedLayout}
            newReleases={newReleases} newTV={newTV}
            streamingMovies={streamingMovies} streamingTV={streamingTV}
            getSavedData={getSavedData} onItemClick={setSelectedItem}
          />
        )}

        {view === 'search' && (
          <SearchView searchResults={searchResults} onItemClick={setSelectedItem} />
        )}

        {view === 'watchlist' && (
          <JournalView
            user={user} watched={watched} mediaFilter={mediaFilter}
            userLists={userLists} listItems={listItems} activeList={activeList} setActiveList={setActiveList}
            journalTab={journalTab} setJournalTab={setJournalTab}
            profile={profile}
            createList={createList} deleteList={deleteList} renameList={renameList}
            toggleListItem={toggleListItem} toggleListPublic={toggleListPublic}
            copyLink={copyLink} copiedLink={copiedLink}
            timelineView={timelineView} setTimelineView={setTimelineView}
            gridTimeframe={gridTimeframe} setGridTimeframe={setGridTimeframe}
            gridNav={gridNav} setGridNav={setGridNav}
            selectedGridDay={selectedGridDay} setSelectedGridDay={setSelectedGridDay}
            onItemClick={setSelectedItem}
            formatDate={formatDate} toDateKey={toDateKey} moodLabel={moodLabel} tlScribble={tlScribble}
            setShowAuth={setShowAuth}
            deleteFromJournal={deleteFromJournal}
          />
        )}

        {view === 'public' && publicProfileUsername && (
          <section>
            <PublicProfileView
              username={publicProfileUsername}
              initialListId={publicProfileInitialList}
              onItemClick={setSelectedItem}
              user={user}
              onAuthRequired={() => setShowAuth(true)}
              onFollowChanged={() => setFollowingFeedLoaded(false)}
              onBack={() => {
                setPublicProfileUsername(null);
                setPublicProfileInitialList(null);
                navigate('/app');
              }}
            />
          </section>
        )}

        {view === 'upcoming' && (
          <UpcomingView
            upcomingTimeFilter={upcomingTimeFilter} setUpcomingTimeFilter={setUpcomingTimeFilter}
            mediaFilter={mediaFilter} feedLayout={feedLayout}
            upcoming={upcoming} upcomingTV={upcomingTV}
            onItemClick={setSelectedItem}
          />
        )}
      </main>

      {selectedItem && (
        <MediaModal
          item={selectedItem}
          region={preferences.region || 'AU'}
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

      {showImportModal && (
        <ImportModal
          user={user}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={blob => { uploadAvatar(blob); setCropFile(null); }}
          onCancel={() => setCropFile(null)}
        />
      )}

      <nav className="bottom-tab-bar">
        <button onClick={() => navigateTo('home')} className={view === 'home' ? 'active' : ''}>Feed</button>
        <button onClick={() => navigateTo('new')} className={view === 'new' ? 'active' : ''}>New</button>
        <button onClick={() => navigateTo('upcoming')} className={view === 'upcoming' ? 'active' : ''}>Upcoming</button>
        <button onClick={() => navigateTo('watchlist')} className={view === 'watchlist' ? 'active' : ''}>Journal</button>
      </nav>

    </div>
  );
}
