import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import './app.css';
import { tmdb, setTmdbRegion } from './api/tmdb';
import { supabase } from './api/supabase';
import { GENRES, REGIONS, SAMPLE_WATCHED } from './constants.js';
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
                logo: `https://image.tmdb.org/t/p/original${primaryProvider.logo_path}`
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
          enrichWithProviders(trendingMovies.results, 'movie'),
          enrichWithProviders(trendingTV.results, 'tv')
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

  // Enrich sample data by searching TMDB for each title — never guesses IDs
  useEffect(() => {
    if (watched.length > 0) return;
    const enrich = async () => {
      const enriched = await Promise.all(
        SAMPLE_WATCHED.map(async (item) => {
          const query = item.title || item.name;
          const results = await tmdb.search(query);
          const match = results?.results?.find(r => r.media_type === item.media_type);
          if (!match) return item;
          return {
            ...item,
            id: match.id,
            tmdb_id: match.id,
            poster_path: match.poster_path,
          };
        })
      );
      setSampleWatched(enriched);
    };
    enrich();
  }, [watched.length]);

  // For You feed — improves with every item the user logs
  useEffect(() => {
    const loadForYou = async () => {
      const watchedIds = new Set(watched.map(i => i.tmdb_id || i.id));

      // Use top 10 rated real items (with valid IDs) as seeds
      const ratedReal = [...watched]
        .filter(i => i.rating && (i.tmdb_id || i.id))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);

      // If not enough real seeds, resolve a few high-rated sample titles via search
      let finalSeeds = ratedReal;
      if (ratedReal.length < 3) {
        const toResolve = SAMPLE_WATCHED
          .filter(s => s.rating >= 5)
          .slice(0, 5);
        const resolved = await Promise.all(
          toResolve.map(async s => {
            const type = s.media_type || 'movie';
            const res = await tmdb.search(s.title || s.name);
            const match = res?.results?.find(r => r.media_type === type);
            return match ? { ...s, id: match.id, tmdb_id: match.id, media_type: type } : null;
          })
        );
        finalSeeds = [...ratedReal, ...resolved.filter(Boolean)];
      }

      if (finalSeeds.length === 0) {
        // Fallback: discover by genre preferences
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
    await supabase.from('list_items').delete().match({ list_id: listId });
    await supabase.from('lists').delete().match({ id: listId });
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

  const [sampleWatched, setSampleWatched] = useState(SAMPLE_WATCHED);
  const [activeList, setActiveList] = useState(null);
  const [journalTab, setJournalTab] = useState('lists');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showTasteExpanded, setShowTasteExpanded] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('plot-theme') || 'system');
  const [feedLayout, setFeedLayout] = useState(() => localStorage.getItem('plot-feed-layout') || 'bento');
  const [rankBadgeDark, setRankBadgeDark] = useState({});
  const [dateBadgeDark, setDateBadgeDark] = useState({});

  const sampleImageCorner = useCallback((img, itemId, setter) => {
    try {
      const canvas = document.createElement('canvas');
      const size = 60;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const srcX = img.naturalWidth - (size * img.naturalWidth / img.width);
      const srcY = 0;
      const srcW = size * img.naturalWidth / img.width;
      const srcH = size * img.naturalHeight / img.height;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0;
      const pixels = data.length / 4;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; }
      const luminance = (0.299 * (r / pixels) + 0.587 * (g / pixels) + 0.114 * (b / pixels)) / 255;
      if (luminance > 0.55) setter(prev => ({ ...prev, [itemId]: true }));
    } catch (_) {}
  }, []);
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


  const formatDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const toDateKey = (iso) => iso?.slice(0, 10);
  const moodLabel = m => ({
    happy: 'Happy', sad: 'Sad', emotional: 'Emotional', excited: 'Excited',
    fun: 'Fun', tense: 'Tense', scared: 'Scared', unsettled: 'Unsettled',
    weird: 'Weird', cosy: 'Cosy', thoughtful: 'Thoughtful', inspired: 'Inspired',
    intense: 'Intense', stressed: 'Stressed', epic: 'Epic', haunted: 'Haunted',
    nostalgic: 'Nostalgic', melancholy: 'Melancholy', gripped: 'Gripped',
    shocked: 'Shocked', uncomfortable: 'Uncomfortable', meh: 'Meh',
    amazing: 'Amazing', mindblown: 'Mind Blown',
  })[m] || m || '';
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
      seg(ex, ly, 65, i * 7 + 10);
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
    seg(cx, height, 65, 90);
    return d;
  };
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
      <header className="main-header animate-in">
        <div className="top-nav">
          <div className="branding-left" onClick={() => setView('home')}>
            <img src="/plot-logo.svg" alt="Plot" className="logo-img" />
          </div>
          
          <div className="center-group">
            <div className="nav-pills header-nav">
              <button onClick={() => navigateTo('home')} className={view === 'home' ? 'active' : ''}>Feed</button>
              <button onClick={() => navigateTo('new')} className={view === 'new' ? 'active' : ''}>New</button>
              <button onClick={() => navigateTo('upcoming')} className={view === 'upcoming' ? 'active' : ''}>Upcoming</button>
              <button onClick={() => navigateTo('watchlist')} className={view === 'watchlist' ? 'active' : ''}>Journal</button>
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
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : user.email?.[0]?.toUpperCase()
                }
              </button>
              {showProfileMenu && createPortal(
                <>
                  <div className="profile-menu-backdrop" onClick={() => setShowProfileMenu(false)} />
                  <div className="profile-dropdown">
                    <div className="profile-dropdown-header">
                      <div className="avatar-upload-wrapper" onClick={() => avatarInputRef.current?.click()}>
                        <div className="profile-dropdown-avatar">
                          {profile?.avatar_url
                            ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : user.email?.[0]?.toUpperCase()
                          }
                        </div>
                        <div className="avatar-upload-overlay">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ''; }}
                        />
                      </div>
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
                      <div className="settings-row">
                        <span className="settings-label">Region</span>
                        <select
                          className="region-select"
                          value={preferences.region || 'AU'}
                          onChange={e => setPreferences(p => ({ ...p, region: e.target.value }))}
                        >
                          {REGIONS.map(r => (
                            <option key={r.code} value={r.code}>{r.name}</option>
                          ))}
                        </select>
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
                            data-tooltip="Public"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button
                            className={!profile?.is_public ? 'active' : ''}
                            onClick={() => { if (profile?.is_public) toggleProfilePublic(); }}
                            data-tooltip="Private"
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
                    <div className="profile-public-section">
                      <button className="taste-accordion-btn" onClick={() => setShowTasteExpanded(v => !v)}>
                        <span className="settings-label">Taste</span>
                        <span className="taste-accordion-meta">
                          {preferences.genres.length > 0 ? `${preferences.genres.length} selected` : 'None'}
                          <svg className={`taste-chevron ${showTasteExpanded ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </span>
                      </button>
                      {showTasteExpanded && (
                        <div className="taste-genre-list">
                          {GENRES.map(g => {
                            const checked = preferences.genres.includes(g.key);
                            return (
                              <label key={g.key} className="taste-genre-row">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setPreferences(p => ({
                                    ...p,
                                    genres: checked
                                      ? p.genres.filter(k => k !== g.key)
                                      : [...p.genres, g.key],
                                  }))}
                                />
                                <span className={`taste-genre-circle ${checked ? 'active' : ''}`} />
                                {g.label}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="profile-public-section">
                      <div className="settings-row">
                        <span className="settings-label">History</span>
                        <button className="copy-link-btn" onClick={() => { setShowImportModal(true); setShowProfileMenu(false); }}>
                          Import watch history
                        </button>
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
          <FeedView
            feedTab={feedTab} setFeedTab={setFeedTab}
            forYouFeed={forYouFeed} trending={trending}
            mediaFilter={mediaFilter} feedLayout={feedLayout}
            preferences={preferences}
            followingFeed={followingFeed} user={user}
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
            rankBadgeDark={rankBadgeDark}
            getSavedData={getSavedData} onItemClick={setSelectedItem}
          />
        )}

        {view === 'search' && (
          <SearchView searchResults={searchResults} onItemClick={setSelectedItem} />
        )}

        {view === 'watchlist' && (
          <JournalView
            user={user} watched={watched} sampleWatched={sampleWatched} mediaFilter={mediaFilter}
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
            dateBadgeDark={dateBadgeDark}
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
