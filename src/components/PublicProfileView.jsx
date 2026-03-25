import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import plotLogo from '/plot-logo.svg';

function StarRow({ rating }) {
  if (!rating) return null;
  return (
    <span className="pp-watch-stars">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PublicProfileView({ username, initialListId, onItemClick, onBack, user, onAuthRequired, onFollowChanged }) {
  const [profileData, setProfileData] = useState(null);
  const [publicLists, setPublicLists] = useState([]);
  const [listItems, setListItems] = useState([]);
  const [recentWatches, setRecentWatches] = useState([]);
  const [watchIdx, setWatchIdx] = useState(0);
  const [activeList, setActiveList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name, is_public')
        .eq('username', username)
        .eq('is_public', true)
        .single();

      if (!prof) { setNotFound(true); setLoading(false); return; }
      setProfileData(prof);

      const [listsResult, journalResult, followerResult, followingResult] = await Promise.all([
        supabase.from('lists').select('*').eq('user_id', prof.id).eq('is_public', true),
        supabase.from('journal').select('*').eq('user_id', prof.id).order('watched_at', { ascending: false }).limit(8),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', prof.id),
        user ? supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id).eq('following_id', prof.id) : Promise.resolve({ count: 0 }),
      ]);
      setFollowerCount(followerResult.count ?? 0);
      setIsFollowing((followingResult.count ?? 0) > 0);

      if (listsResult.data?.length) {
        setPublicLists(listsResult.data);
        const { data: items } = await supabase
          .from('list_items')
          .select('*')
          .in('list_id', listsResult.data.map(l => l.id))
          .order('created_at', { ascending: false });
        if (items) setListItems(items);
        if (initialListId) {
          const found = listsResult.data.find(l => l.id === initialListId);
          if (found) setActiveList(found);
        }
      }

      if (journalResult.data) setRecentWatches(journalResult.data);

      setLoading(false);
    };

    load();
  }, [username, initialListId]);

  if (loading) return (
    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
      Loading...
    </div>
  );

  if (notFound) return (
    <div style={{ padding: '4rem', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Profile not found or is private.
      </p>
      <button className="back-btn" onClick={onBack}>← Go back</button>
    </div>
  );

  const activeListItems = activeList ? listItems.filter(li => li.list_id === activeList.id) : [];
  const displayName = profileData.display_name || profileData.username;

  const allPosters = listItems.filter(i => i.poster_path).map(i => i.poster_path);
  const heroPosters = allPosters.slice(0, 4);

  const stripRaw = allPosters.length > 0
    ? Array.from({ length: Math.ceil(40 / allPosters.length) }, () => allPosters).flat().slice(0, 40)
    : [];
  const filmstripItems = [...stripRaw, ...stripRaw];

  const recentItems = listItems.filter(i => i.poster_path).slice(0, 16);

  const handleFollow = async () => {
    if (!user) { onAuthRequired?.(); return; }
    if (followLoading) return;
    setFollowLoading(true);
    const next = !isFollowing;
    setIsFollowing(next);
    setFollowerCount(c => next ? c + 1 : c - 1);
    const { error } = next
      ? await supabase.from('follows').insert({ follower_id: user.id, following_id: profileData.id })
      : await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profileData.id);
    if (error) { setIsFollowing(!next); setFollowerCount(c => next ? c - 1 : c + 1); }
    else onFollowChanged?.();
    setFollowLoading(false);
  };

  const handleBack = () => {
    if (!user) {
      window.location.href = '/';
    } else {
      onBack();
    }
  };

  return (
    <div className="animate-in">
      {activeList ? (
        <>
          <div className="list-detail-header">
            <button className="back-btn" onClick={() => setActiveList(null)}>
              ← {displayName}'s lists
            </button>
            <div className="section-header-row">
              <div>
                <h2 className="section-title" style={{ marginBottom: '0.25rem' }}>{activeList.name}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {activeListItems.length} {activeListItems.length === 1 ? 'item' : 'items'}
                </p>
              </div>
            </div>
          </div>
          <div className="bento-grid">
            {activeListItems.map((item, index) => (
              <div
                key={item.id || index}
                className="bento-item glass"
                onClick={() => onItemClick({ ...item, id: item.tmdb_id })}
              >
                {item.poster_path
                  ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  : <div className="no-image">{item.title || item.name}</div>
                }
                <div className="overlay">
                  <h3>{item.title || item.name}</h3>
                </div>
              </div>
            ))}
            {activeListItems.length === 0 && (
              <p className="empty-list-msg">This list is empty.</p>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Hero banner */}
          <div className="pp-hero">
            {heroPosters.length > 0 ? (
              <div className="pp-hero-strip">
                {heroPosters.map((p, i) => (
                  <img key={i} src={`https://image.tmdb.org/t/p/w342${p}`} alt="" />
                ))}
              </div>
            ) : (
              <div className="pp-hero-fallback" />
            )}
            <div className="pp-hero-overlay" />
            <div className="pp-profile-card">
              <div className="public-profile-avatar pp-avatar-large">
                {displayName[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <h1 className="pp-display-name">{displayName}</h1>
                <p className="public-profile-username">@{profileData.username}</p>
                <p className="pp-stats">
                  {followerCount} {followerCount === 1 ? 'follower' : 'followers'} · {publicLists.length} {publicLists.length === 1 ? 'list' : 'lists'} · {recentWatches.length} watched
                </p>
              </div>
              {user && (
                <button
                  className={`pp-follow-btn ${isFollowing ? 'following' : ''}`}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          </div>

          {/* Film strip marquee */}
          {filmstripItems.length > 0 && (
            <div className="pp-filmstrip">
              <div className="pp-filmstrip-track">
                {filmstripItems.map((p, i) => (
                  <img key={i} src={`https://image.tmdb.org/t/p/w92${p}`} alt="" />
                ))}
              </div>
            </div>
          )}

          {/* Recently Watched — centered carousel */}
          {(() => {
            const watches = recentWatches.filter(w => w.poster_path).slice(0, 8);
            if (watches.length === 0) return null;
            const w = watches[watchIdx];
            return (
              <div className="pp-watches-carousel pp-section">
                <div className="pp-carousel-stage">
                  <button
                    className="pp-carousel-arrow"
                    onClick={() => setWatchIdx(i => Math.max(0, i - 1))}
                    disabled={watchIdx === 0}
                  >‹</button>
                  <div className="pp-carousel-entry" key={watchIdx}>
                    <div className="pp-carousel-side">
                      {w.note && <p className="pp-carousel-note">{w.note}</p>}
                    </div>
                    <div
                      className="pp-carousel-poster-wrap"
                      onClick={() => onItemClick({ ...w, id: w.tmdb_id })}
                    >
                      <img src={`https://image.tmdb.org/t/p/w342${w.poster_path}`} alt={w.title || w.name} />
                    </div>
                    <div className="pp-carousel-side">
                      <h3 className="pp-carousel-title">{w.title || w.name}</h3>
                      {w.rating && <p className="pp-carousel-stars">{'★'.repeat(w.rating)}{'☆'.repeat(5 - w.rating)}</p>}
                      <p className="pp-carousel-date">{formatDate(w.watched_at)}</p>
                      {w.mood && <p className="pp-carousel-mood">{w.mood}</p>}
                    </div>
                  </div>
                  <button
                    className="pp-carousel-arrow"
                    onClick={() => setWatchIdx(i => Math.min(watches.length - 1, i + 1))}
                    disabled={watchIdx === watches.length - 1}
                  >›</button>
                </div>
                <div className="pp-carousel-dots">
                  {watches.map((_, i) => (
                    <button
                      key={i}
                      className={`pp-carousel-dot ${i === watchIdx ? 'active' : ''}`}
                      onClick={() => setWatchIdx(i)}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Recently Added to lists */}
          {recentItems.length > 0 && (
            <div className="pp-section">
              <div className="pp-section-header">
                <h2 className="pp-section-title">Recently Added</h2>
                <span className="pp-section-count">{listItems.length} total</span>
              </div>
              <div className="pp-scroll-row">
                {recentItems.map((item, i) => (
                  <div key={item.id || i} className="pp-scroll-item" onClick={() => onItemClick({ ...item, id: item.tmdb_id })}>
                    <img
                      className="pp-scroll-poster"
                      src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                      alt={item.title || item.name}
                    />
                    <p className="pp-scroll-label">{item.title || item.name}</p>
                    <p className="pp-scroll-meta">{item.media_type === 'tv' ? 'Series' : 'Film'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lists */}
          {publicLists.length > 0 && (
            <div className="pp-section">
              <div className="pp-section-header">
                <h2 className="pp-section-title">Lists</h2>
                <span className="pp-section-count">{publicLists.length}</span>
              </div>
              <div className="pp-lists-grid">
                {publicLists.map(list => {
                  const items = listItems.filter(li => li.list_id === list.id);
                  const filledItems = items.slice(0, 4);
                  const emptyCount = Math.max(0, 4 - filledItems.length);
                  return (
                    <div key={list.id} className="pp-list-mosaic" onClick={() => setActiveList(list)}>
                      <div className="pp-mosaic-grid">
                        {filledItems.map((item, idx) => (
                          item.poster_path
                            ? <img key={idx} src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt="" />
                            : <div key={idx} className="pp-mosaic-empty" />
                        ))}
                        {Array.from({ length: emptyCount }).map((_, idx) => (
                          <div key={`e${idx}`} className="pp-mosaic-empty" />
                        ))}
                      </div>
                      <div className="stack-info">
                        <h3>{list.name}</h3>
                        <p>{items.length} {items.length === 1 ? 'item' : 'items'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {publicLists.length === 0 && recentWatches.length === 0 && (
            <p className="empty-list-msg">No public activity yet.</p>
          )}

          {/* Join CTA for unauthenticated visitors */}
          {!user && (
            <div className="pp-join-cta">
              <p className="pp-join-tagline">Track what you watch. Share what you love.</p>
              <a href="/signup" className="pp-join-link">
                Join <img src={plotLogo} alt="PLOT" className="pp-join-logo-inline" /> →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
