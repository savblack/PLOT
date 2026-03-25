import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import './app.css';
import { tmdb, setTmdbRegion } from './api/tmdb';
import { supabase } from './api/supabase';
import MediaModal from './components/MediaModal';
import AuthModal from './components/AuthModal';
import PublicProfileView from './components/PublicProfileView';

const SAMPLE_WATCHED = [
  { title: 'Oppenheimer',                     media_type: 'movie', watched_at: '2025-01-04', rating: 5, mood: 'thoughtful', note: 'Three hours felt like one. The Trinity sequence broke me.' },
  { title: 'Dune: Part Two',                  media_type: 'movie', watched_at: '2025-01-18', rating: 4, mood: 'excited', note: 'Zendaya finally got something to do. Worth the wait.' },
  { title: 'Poor Things',                     media_type: 'movie', watched_at: '2025-01-18', rating: 4, mood: 'weird' },
  { title: 'Killers of the Flower Moon',      media_type: 'movie', watched_at: '2025-02-02', rating: 5, mood: 'sad' },
  { title: 'Barbie',                          media_type: 'movie', watched_at: '2025-02-14', rating: 3, mood: 'happy' },
  { title: 'Spider-Man: Across the Spider-Verse', media_type: 'movie', watched_at: '2025-02-14', rating: 5, mood: 'excited' },
  { title: 'Saltburn',                        media_type: 'movie', watched_at: '2025-02-28', rating: 4, mood: 'unsettled', note: 'Did not see that ending coming. Thought about it for days.' },
  { title: 'Past Lives',                      media_type: 'movie', watched_at: '2025-03-08', rating: 5, mood: 'sad', note: 'Quietly devastating. The airport bench scene.' },
  { title: 'The Holdovers',                   media_type: 'movie', watched_at: '2025-03-22', rating: 4, mood: 'cosy' },
  { title: 'Anatomy of a Fall',               media_type: 'movie', watched_at: '2025-04-05', rating: 4, mood: 'tense' },
  { name:  'The Last of Us',                  media_type: 'tv',    watched_at: '2025-04-19', rating: 5, mood: 'emotional' },
  { name:  'The Bear',                        media_type: 'tv',    watched_at: '2025-05-03', rating: 5, mood: 'stressed' },
  { title: 'Society of the Snow',             media_type: 'movie', watched_at: '2025-05-17', rating: 4, mood: 'intense' },
  { title: 'American Fiction',               media_type: 'movie', watched_at: '2025-06-01', rating: 4, mood: 'thoughtful' },
  { name:  'Succession',                      media_type: 'tv',    watched_at: '2025-06-21', rating: 5, mood: 'gripped' },
  { title: 'Priscilla',                       media_type: 'movie', watched_at: '2025-07-04', rating: 3, mood: 'melancholy' },
  { title: 'The Zone of Interest',            media_type: 'movie', watched_at: '2025-08-09', rating: 5, mood: 'haunted' },
  { title: 'May December',                    media_type: 'movie', watched_at: '2025-09-13', rating: 3, mood: 'uncomfortable' },
  { title: 'Migration',                       media_type: 'movie', watched_at: '2025-10-05', rating: 3, mood: 'happy' },
  { name:  'Shōgun',                          media_type: 'tv',    watched_at: '2025-11-02', rating: 5, mood: 'epic' },
  { title: 'Inside Out 2',                    media_type: 'movie', watched_at: '2025-11-29', rating: 4, mood: 'emotional' },
  { title: 'Despicable Me 4',                 media_type: 'movie', watched_at: '2025-12-14', rating: 2, mood: 'meh' },
  { title: 'Mufasa: The Lion King',           media_type: 'movie', watched_at: '2025-12-26', rating: 3, mood: 'nostalgic' },
  { title: 'Anora',                           media_type: 'movie', watched_at: '2026-01-11', rating: 5, mood: 'shocked' },
  { title: 'Conclave',                        media_type: 'movie', watched_at: '2026-01-25', rating: 4, mood: 'tense' },
  { title: 'A Complete Unknown',              media_type: 'movie', watched_at: '2026-02-08', rating: 4, mood: 'inspired' },
  { title: 'Terrifier 3',                     media_type: 'movie', watched_at: '2026-02-22', rating: 3, mood: 'scared' },
  { name:  'Severance',                       media_type: 'tv',    watched_at: '2026-03-07', rating: 5, mood: 'unsettled' },
];

const GENRES = [
  { key: 'action',      label: 'Action',      movieId: 28,    tvId: 10759, desc: 'Fast-paced and intense.'     },
  { key: 'comedy',      label: 'Comedy',      movieId: 35,    tvId: 35,    desc: 'Laugh-out-loud fun.'         },
  { key: 'drama',       label: 'Drama',       movieId: 18,    tvId: 18,    desc: 'Gripping and emotional.'     },
  { key: 'thriller',    label: 'Thriller',    movieId: 53,    tvId: 53,    desc: 'Suspense and tension.'       },
  { key: 'horror',      label: 'Horror',      movieId: 27,    tvId: 27,    desc: 'Scary and unsettling.'       },
  { key: 'scifi',       label: 'Sci-Fi',      movieId: 878,   tvId: 10765, desc: 'Futuristic and speculative.' },
  { key: 'romance',     label: 'Romance',     movieId: 10749, tvId: 10749, desc: 'Love stories and connection.'},
  { key: 'animation',   label: 'Animation',   movieId: 16,    tvId: 16,    desc: 'Animated worlds.'            },
  { key: 'crime',       label: 'Crime',       movieId: 80,    tvId: 80,    desc: 'Heists, detectives and more.'},
  { key: 'fantasy',     label: 'Fantasy',     movieId: 14,    tvId: 10765, desc: 'Magic and other worlds.'     },
  { key: 'mystery',     label: 'Mystery',     movieId: 9648,  tvId: 9648,  desc: 'Whodunits and big reveals.'  },
  { key: 'documentary', label: 'Documentary', movieId: 99,    tvId: 99,    desc: 'Real stories, real world.'   },
];

const REGIONS = [
  { code: 'AU', name: 'Australia' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'ZA', name: 'South Africa' },
];

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
  const [personalized, setPersonalized] = useState([]);
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
        if (data) { setProfile(data); setProfileUsernameInput(data.username || ''); }
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

      // Use top 10 rated items as seeds; fall back to most recently logged
      const seeds = [...watched]
        .filter(i => i.rating)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);
      const finalSeeds = seeds.length > 0 ? seeds : watched.slice(0, 5);

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
  const [showTasteExpanded, setShowTasteExpanded] = useState(false);
  const [pendingGenres, setPendingGenres] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('plot-theme') || 'system');
  const [feedLayout, setFeedLayout] = useState(() => localStorage.getItem('plot-feed-layout') || 'bento');
  const [rankBadgeDark, setRankBadgeDark] = useState({});
  const [sampleWatched, setSampleWatched] = useState(SAMPLE_WATCHED);
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
  const activeWatched = watched.length > 0 ? watched : sampleWatched;
  const filteredWatched = activeWatched.filter(item => (item.media_type || (item.title ? 'movie' : 'tv')) === mediaFilter);
  const watchedByDate = filteredWatched.reduce((acc, item) => {
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
    const base = window.location.origin;
    const url = type === 'profile'
      ? `${base}/u/${profile.username}`
      : `${base}/u/${profile.username}/list/${id}`;
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
            </div>
            <div className="journal-tab-nav">
              <button className={`journal-tab-btn ${feedTab === 'foryou' ? 'active' : ''}`} onClick={() => setFeedTab('foryou')}>For You</button>
              <button className={`journal-tab-btn ${feedTab === 'trending' ? 'active' : ''}`} onClick={() => setFeedTab('trending')}>Trending</button>
            </div>
            {feedTab === 'foryou' && forYouFeed.length === 0 && preferences.genres.length === 0 ? (
              <div className="genre-onboarding">
                <div className="genre-onboarding-copy">
                  <h3 className="genre-onboarding-title">What floats your boat?</h3>
                  <p className="genre-onboarding-sub">Tell us what you're into and we'll find something worth watching.</p>
                  {pendingGenres.length > 0 && (
                    <button
                      className="genre-save-btn"
                      onClick={() => setPreferences(p => ({ ...p, genres: pendingGenres }))}
                    >
                      Save — {pendingGenres.length} {pendingGenres.length === 1 ? 'genre' : 'genres'} selected
                    </button>
                  )}
                </div>
                <div className="genre-toggle-grid">
                  {GENRES.map(g => {
                    const selected = pendingGenres.includes(g.key);
                    return (
                      <button
                        key={g.key}
                        className={`genre-toggle-card ${selected ? 'active' : ''}`}
                        onClick={() => setPendingGenres(prev =>
                          selected ? prev.filter(k => k !== g.key) : [...prev, g.key]
                        )}
                      >
                        <div className="genre-toggle-body">
                          <span className="genre-toggle-name">{g.label}</span>
                          <span className="genre-toggle-desc">{g.desc}</span>
                        </div>
                        <div className="genre-toggle-check">{selected ? '✓' : ''}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bento-grid">
                {(feedTab === 'trending' ? trending : forYouFeed).filter(item => (item.media_type || (item.title ? 'movie' : 'tv')) === mediaFilter).map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className={`bento-item glass ${feedLayout === 'bento' && index % 5 === 0 ? 'large' : ''}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    {item.poster_path
                      ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                      : <div className="no-image">{item.title || item.name}</div>
                    }
                    <div className="overlay">
                      <h3>{item.title || item.name}</h3>
                      {getSavedData(item.id) && <span className="watched-dot"></span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {view === 'new' && (
          <section>
            <div className="section-header-row">
              <h2 className="section-title">New Releases</h2>
            </div>
            <div className="journal-tab-nav">
              <button className={`journal-tab-btn ${newReleasesTab === 'all' ? 'active' : ''}`} onClick={() => setNewReleasesTab('all')}>All</button>
              <button className={`journal-tab-btn ${newReleasesTab === 'popular' ? 'active' : ''}`} onClick={() => setNewReleasesTab('popular')}>Popular</button>
              <button className={`journal-tab-btn ${newReleasesTab === 'streaming' ? 'active' : ''}`} onClick={() => setNewReleasesTab('streaming')}>Now Streaming</button>
            </div>
            <div className="bento-grid">
              {(() => {
                const streamingSource = mediaFilter === 'movie' ? streamingMovies : streamingTV;
                const combined = (newReleasesTab === 'streaming' ? streamingSource : (mediaFilter === 'movie' ? newReleases : newTV))
                  .slice()
                  .sort((a, b) => b.popularity - a.popularity);

                const filtered =
                  newReleasesTab === 'popular'   ? combined.filter(i => i.vote_average >= 7.0) :
                  combined;

                return filtered.map((item, index) => (
                  <div
                    key={item.id}
                    className={`bento-item glass ${feedLayout === 'bento' && index === 0 ? 'large' : ''}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    {item.poster_path
                      ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                      : <div className="no-image">{item.title || item.name}</div>
                    }
                    {newReleasesTab === 'streaming' && item.provider && (
                      <div className="provider-badge">
                        <img className="provider-logo" src={item.provider.logo} alt={item.provider.name} />
                      </div>
                    )}
                    {newReleasesTab === 'popular' && (
                      <div className={`rank-badge${rankBadgeDark[item.id] ? ' rank-badge--dark' : ''}`}>#{index + 1}</div>
                    )}
                    <div className="overlay">
                      <h3>{item.title || item.name}</h3>
                      {getSavedData(item.id) && <span className="watched-dot"></span>}
                    </div>
                  </div>
                ));
              })()}
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
                    {filteredWatched.length === 0 && (
                      <p className="empty-list-msg">Nothing logged yet. Open any movie or show and hit Save.</p>
                    )}
                    {filteredWatched.map((item, index) => (
                      <div
                        key={item.id || index}
                        className="bento-item glass"
                        onClick={() => setSelectedItem(item)}
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
                      />
                    ))}
                  </div>
                )}

                {journalTab === 'mood' && (
                  <div className="lists-grid">
                    {[
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
                    ].map(m => (
                      <ListStack
                        key={m.value}
                        list={{ id: `mood-${m.value}`, name: m.label }}
                        items={filteredWatched.filter(w => w.mood === m.value)}
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
                      <p className="empty-list-msg" style={{ textAlign: 'center', padding: '2rem 0' }}>
                        Nothing logged yet. Start by opening any movie or show.
                      </p>
                    )}

                    {timelineView === 'linear' && (() => {
                      const sorted = [...filteredWatched]
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
                      const renderCard = (item, k, idx = 0) => {
                        const infoRight = idx % 2 === 0;
                        const infoNote = (
                          <div className="tl-note tl-info-note">
                            <span className="tl-note-title">{item.title || item.name}</span>
                            {item.rating > 0 && <span className="tl-note-stars">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>}
                            <span className="tl-note-date">{formatDate(item.watched_at)}</span>
                            {item.mood && <span className="tl-note-mood">{moodLabel(item.mood)}</span>}
                          </div>
                        );
                        const userNote = item.note ? (
                          <div className="tl-note tl-user-note" style={{ lineHeight: '1.1' }}>
                            <span className="tl-note-text" style={{ display: 'block', lineHeight: '1.1' }}>{item.note}</span>
                          </div>
                        ) : <div className="tl-note tl-note-empty" />;
                        return (
                          <div key={k} className="tl-entry" onClick={() => setSelectedItem(item)}>
                            {infoRight ? userNote : infoNote}
                            <div className="tl-poster">
                              {item.poster_path
                                ? <img
                                    src={`https://image.tmdb.org/t/p/w300${item.poster_path}`}
                                    alt={item.title || item.name}
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                                  />
                                : null
                              }
                              <div className="tl-no-poster" style={{ display: item.poster_path ? 'none' : 'block' }} />
                            </div>
                            {infoRight ? infoNote : userNote}
                          </div>
                        );
                      };
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
                                      {[...extras].reverse().map((extra, ei) => renderCard(extra, `${group.key}-${ei}`, dayIdx))}
                                      <div className="tl-anchor-col">
                                        {renderCard(anchor, group.key, dayIdx)}
                                        {connector}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {renderCard(anchor, group.key, dayIdx)}
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
                                  <div key={item.id || idx} className="timeline-card" style={{ width: 150, flexShrink: 0 }} onClick={() => setSelectedItem(item)}>
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
                                  <div key={item.id || idx} className="timeline-card" style={{ width: 150, flexShrink: 0 }} onClick={() => setSelectedItem(item)}>
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
          </section>
        )}

        {view === 'public' && publicProfileUsername && (
          <section>
            <PublicProfileView
              username={publicProfileUsername}
              initialListId={publicProfileInitialList}
              onItemClick={setSelectedItem}
              onBack={() => {
                setPublicProfileUsername(null);
                setPublicProfileInitialList(null);
                navigate('/app');
              }}
            />
          </section>
        )}

        {view === 'upcoming' && (
          <section className="upcoming">
            <div className="section-header-row">
              <h2 className="section-title">Upcoming</h2>
            </div>
            <div className="journal-tab-nav">
              {[['week','This Week'],['next-week','Next Week'],['month','This Month'],['next-month','Next Month']].map(([val, label]) => (
                <button key={val} className={`journal-tab-btn ${upcomingTimeFilter === val ? 'active' : ''}`} onClick={() => setUpcomingTimeFilter(val)}>{label}</button>
              ))}
            </div>
            <div className="bento-grid">
              {(() => {
                const filterByTimeRange = (items, filter) => {
                  const now = new Date(); now.setHours(0, 0, 0, 0);
                  let start = now, end;
                  if (filter === 'week')       { end = new Date(now); end.setDate(now.getDate() + 7); }
                  if (filter === 'next-week')  { start = new Date(now); start.setDate(now.getDate() + 7); end = new Date(start); end.setDate(start.getDate() + 7); }
                  if (filter === 'month')      { end = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
                  if (filter === 'next-month') { start = new Date(now.getFullYear(), now.getMonth() + 1, 1); end = new Date(now.getFullYear(), now.getMonth() + 2, 0); }
                  return items.filter(item => { const d = new Date(item.release_date || item.first_air_date); return d >= start && d <= end; });
                };
                return filterByTimeRange(mediaFilter === 'movie' ? upcoming : upcomingTV, upcomingTimeFilter).map((item, index) => (
                <div key={item.id} className={`bento-item glass ${feedLayout === 'bento' && index % 5 === 0 ? 'large' : ''}`} onClick={() => setSelectedItem(item)}>
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                    : <div className="no-image">{item.title || item.name}</div>
                  }
                  <div className="overlay">
                    <span className={`rating-tag date-tag${dateBadgeDark[item.id] ? ' date-tag--dark' : ''}`}>
                      {new Date(item.release_date || item.first_air_date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                    <h3>{item.title || item.name}</h3>
                  </div>
                </div>
              ));
              })()}
            </div>
          </section>
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

      <nav className="bottom-tab-bar">
        <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>Feed</button>
        <button onClick={() => setView('new')} className={view === 'new' ? 'active' : ''}>New</button>
        <button onClick={() => setView('upcoming')} className={view === 'upcoming' ? 'active' : ''}>Upcoming</button>
        <button onClick={() => setView('watchlist')} className={view === 'watchlist' ? 'active' : ''}>Journal</button>
      </nav>

    </div>
  );
}
