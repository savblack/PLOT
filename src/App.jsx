import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './app.css';
import { tmdb, setTmdbRegion } from './api/tmdb';
import { supabase } from './api/supabase';
import { formatDate, toDateKey, moodLabel, tlScribble } from './utils/journal.js';
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
import { useTheme } from './hooks/useTheme';
import { useContentFeed } from './hooks/useContentFeed';
import { useForYouFeed } from './hooks/useForYouFeed';
import { useJournalData } from './hooks/useJournalData';

export default function App() {
  const { username: routeUsername, listId: routeListId, view: routeView } = useParams();
  const navigate = useNavigate();

  // ── Auth & preferences ─────────────────────────────
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [preferences, setPreferences] = useState({ genres: [], region: 'AU' });

  // ── Profile ─────────────────────────────────────────
  const [profile, setProfile] = useState(null);
  const [profileUsernameInput, setProfileUsernameInput] = useState('');
  const [profileUsernameSaving, setProfileUsernameSaving] = useState(false);
  const [profileUsernameError, setProfileUsernameError] = useState('');
  const [copiedLink, setCopiedLink] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const avatarInputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);

  // ── UI state ─────────────────────────────────────────
  const [view, setView] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [feedTab, setFeedTab] = useState('foryou');
  const [newReleasesTab, setNewReleasesTab] = useState('all');
  const [mediaFilter, setMediaFilter] = useState('movie');
  const [publicProfileUsername, setPublicProfileUsername] = useState(null);
  const [publicProfileInitialList, setPublicProfileInitialList] = useState(null);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showTasteExpanded, setShowTasteExpanded] = useState(false);
  const [upcomingTimeFilter, setUpcomingTimeFilter] = useState('month');
  const [timelineView, setTimelineView] = useState('linear');
  const [gridTimeframe, setGridTimeframe] = useState('monthly');
  const [gridNav, setGridNav] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [selectedGridDay, setSelectedGridDay] = useState(null);
  const [journalTab, setJournalTab] = useState('lists');

  // ── Custom hooks ────────────────────────────────────
  const { theme, setTheme, feedLayout, setFeedLayout } = useTheme();

  const { trending, newReleases, newTV, streamingMovies, streamingTV, upcoming, upcomingTV } =
    useContentFeed(preferences.region || 'AU');

  const {
    watched, setWatched,
    userLists, listItems,
    activeList, setActiveList,
    getSavedData, saveToWatched,
    createList, deleteList, renameList,
    toggleListItem, deleteFromJournal, toggleListPublic,
  } = useJournalData(user, () => setShowAuth(true));

  const {
    forYouFeed, followingFeed, followingFeedLoaded, setFollowingFeedLoaded,
    refreshForYou, onDismiss, moodFilter, setMoodFilter, userMoods,
  } = useForYouFeed({ watched, preferences, user, feedTab });

  // ── Auth init ───────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
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

  // ── Load profile ────────────────────────────────────
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

  // ── Route params ────────────────────────────────────
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

  // ── Persist preferences & sync region ──────────────
  useEffect(() => {
    localStorage.setItem('plot-prefs', JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    setTmdbRegion(preferences.region || 'AU');
  }, [preferences.region]);

  // ── Profile actions ─────────────────────────────────
  const toggleProfilePublic = async () => {
    const username = profile?.username || profileUsernameInput.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
    if (!username) { setProfileUsernameError('Set a username first'); return; }
    const next = !(profile?.is_public ?? false);
    const { data, error } = await supabase.from('profiles').upsert({
      id: user.id, username, is_public: next
    }).select().single();
    if (error) {
      setProfileUsernameError(error.message.includes('unique') ? 'Username taken' : 'Error saving');
    } else if (data) {
      setProfile(data);
      setProfileUsernameInput(data.username);
      setProfileUsernameError('');
    }
  };

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
      id: user.id, username: cleaned, is_public: profile?.is_public ?? false
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

  // ── Navigation & search ─────────────────────────────
  const handleSearch = async (query) => {
    const q = typeof query === 'string' ? query : searchQuery;
    if (!q.trim()) return;
    const data = await tmdb.search(q);
    if (data) { setSearchResults(data.results); setView('search'); }
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

  return (
    <div className="app-container">
      <AppHeader
        user={user} profile={profile}
        view={view} navigateTo={navigateTo}
        mediaFilter={mediaFilter} setMediaFilter={setMediaFilter}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} handleSearch={handleSearch} onResultClick={setSelectedItem}
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
            mediaFilter={mediaFilter} setMediaFilter={setMediaFilter} feedLayout={feedLayout}
            preferences={preferences}
            followingFeed={followingFeed} followingLoading={!followingFeedLoaded} user={user}
            getSavedData={getSavedData} onItemClick={setSelectedItem}
            onNavigateToProfile={(uname) => { setPublicProfileUsername(uname); setView('public'); navigate(`/u/${uname}`); }}
            onDismiss={onDismiss}
            refreshForYou={refreshForYou}
            forYouMoodFilter={moodFilter}
            setForYouMoodFilter={setMoodFilter}
            userMoods={userMoods}
          />
        )}

        {view === 'new' && (
          <NewReleasesView
            newReleasesTab={newReleasesTab} setNewReleasesTab={setNewReleasesTab}
            mediaFilter={mediaFilter} setMediaFilter={setMediaFilter} feedLayout={feedLayout}
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
            user={user} watched={watched} mediaFilter={mediaFilter} setMediaFilter={setMediaFilter}
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
            mediaFilter={mediaFilter} setMediaFilter={setMediaFilter} feedLayout={feedLayout}
            upcoming={upcoming} upcomingTV={upcomingTV}
            onItemClick={setSelectedItem}
          />
        )}
      </main>

      {selectedItem && (
        <MediaModal
          key={selectedItem.id}
          item={selectedItem}
          region={preferences.region || 'AU'}
          savedData={getSavedData(selectedItem.id)}
          userLists={userLists}
          listItems={listItems.filter(li => li.tmdb_id === selectedItem.id)}
          onCreateList={createList}
          onToggleList={(listId, isAdding) => toggleListItem(listId, selectedItem, isAdding)}
          onSave={saveToWatched}
          onClose={() => setSelectedItem(null)}
          onItemClick={setSelectedItem}
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
