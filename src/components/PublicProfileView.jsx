import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../api/supabase';
import ShareButton from './ShareButton';
import EmptyState from './EmptyState';
import { usePostHog } from '@posthog/react';

function StarRow({ rating }) {
  if (!rating) return null;
  return (
    <span className="pp-watch-stars">
      ★ {rating}/10
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PublicProfileView({ username, initialListId, onItemClick, onBack, user, onAuthRequired, onFollowChanged }) {
  const posthog = usePostHog();
  const [profileData, setProfileData] = useState(null);
  const [publicLists, setPublicLists] = useState([]);
  const [listItems, setListItems] = useState([]);
  const [recentWatches, setRecentWatches] = useState([]);
  const [watchIdx, setWatchIdx] = useState(0);
  const [activeList, setActiveList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState(false);
  const [watchedCount, setWatchedCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name, is_public, avatar_url, is_supporter')
        .eq('username', username)
        .single();

      if (!prof) { setNotFound(true); setLoading(false); return; }
      if (!prof.is_public) { setProfileData(prof); setIsPrivate(true); setLoading(false); return; }
      setProfileData(prof);

      const [listsResult, journalResult, followerResult, followingResult, watchCountResult] = await Promise.all([
        supabase.from('lists').select('*').eq('user_id', prof.id).eq('is_public', true),
        supabase.from('journal').select('*').eq('user_id', prof.id).order('watched_at', { ascending: false }).limit(8),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', prof.id),
        user ? supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id).eq('following_id', prof.id) : Promise.resolve({ count: 0 }),
        supabase.from('journal').select('*', { count: 'exact', head: true }).eq('user_id', prof.id),
      ]);
      setFollowerCount(followerResult.count ?? 0);
      setIsFollowing((followingResult.count ?? 0) > 0);
      setWatchedCount(watchCountResult.count ?? 0);

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
        Profile not found.
      </p>
      <button className="back-btn" onClick={onBack}>← Go back</button>
    </div>
  );

  const activeListItems = activeList ? listItems.filter(li => li.list_id === activeList.id) : [];
  const displayName = profileData.display_name || profileData.username;

  const HERO_GRADIENTS = [
    'linear-gradient(135deg, #f0c8d8 0%, #c8d8f0 100%)', // dusk: rose → sky blue
    'linear-gradient(135deg, #e8c8f0 0%, #f0e0c0 100%)', // dawnlight: lavender → cream
    'linear-gradient(135deg, #c8f0e0 0%, #f0f0c0 100%)', // garden: mint → soft yellow
    'linear-gradient(135deg, #f0d0b8 0%, #d8b8f0 100%)', // sorbet: peach → lilac
    'linear-gradient(135deg, #b8e0f0 0%, #f0b8d8 100%)', // horizon: ice blue → soft pink
  ];

  const heroGradient = (() => {
    let hash = 0;
    const s = profileData.username;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return HERO_GRADIENTS[hash % HERO_GRADIENTS.length];
  })();

  const allPosters = listItems.filter(i => i.poster_path).map(i => i.poster_path);

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
    if (error) {
      setIsFollowing(!next);
      setFollowerCount(c => next ? c - 1 : c + 1);
      setFollowError(true);
      setTimeout(() => setFollowError(false), 3000);
    } else {
      posthog?.capture(next ? 'user_followed' : 'user_unfollowed', { followed_username: profileData.username });
      onFollowChanged?.();
    }
    setFollowLoading(false);
  };

  const handleBack = () => {
    if (!user) {
      window.location.href = '/';
    } else {
      onBack();
    }
  };

  // PRIVATE PROFILE VIEW
  // Option A (lock card, clean) is active. To preview Option B (ghost grid + blur), swap the comments below.
  if (isPrivate) return (
    <div className="animate-in">
      <div className="pp-hero">
        <div className="pp-hero-overlay" />
        <div className="pp-profile-card">
          {profileData.avatar_url && (
            <div className="public-profile-avatar pp-avatar-large">
              <img src={profileData.avatar_url} alt={displayName} className="pp-avatar-img" />
            </div>
          )}
          <div className="pp-profile-card-body">
            <h1 className="pp-display-name">{displayName}</h1>
            <p className="public-profile-username">@{profileData.username}</p>
            <p className="pp-stats">Private profile</p>
          </div>
          <div className="pp-hero-actions">
            {user && (
              <button
                className={`pp-follow-btn ${isFollowing ? 'following' : ''}`}
                onClick={handleFollow}
                disabled={followLoading}
              >
                {isFollowing ? 'Requested' : 'Follow'}
              </button>
            )}
            <ShareButton
              shareData={{
                title: displayName,
                text: `Check out ${displayName}'s watchlist on Plot`,
                url: `${window.location.origin}/u/${profileData.username}`,
              }}
              variant="modal"
              label="Share Profile"
            />
          </div>
        </div>
      </div>

      <div className="pp-private-card">
        {isFollowing ? (
          <>
            <div className="pp-private-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <p className="pp-private-title">Follow request sent</p>
            <p className="pp-private-sub">You'll be able to see {displayName}'s content once they approve your request.</p>
            <button className="pp-private-withdraw" onClick={handleFollow}>Withdraw request</button>
          </>
        ) : (
          <>
            <div className="pp-private-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <p className="pp-private-title">This account is private</p>
            <p className="pp-private-sub">Follow {displayName} to see their lists and activity.</p>
            {user
              ? <button className="pp-private-request" onClick={handleFollow} disabled={followLoading}>Request to follow</button>
              : <a href="/signup" className="pp-private-request">Join Plot to follow</a>
            }
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="animate-in" style={!user ? { paddingBottom: '180px' } : undefined}>
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
              <ShareButton
                shareData={{
                  title: activeList.name,
                  text: `${activeList.name} — a list by ${displayName} on Plot`,
                  url: `${window.location.origin}/u/${profileData.username}/list/${activeList.id}`,
                }}
                variant="modal"
                label="Share List"
              />
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
            {activeListItems.length === 0 && (
              <EmptyState
                variant="grid"
                eyebrow="List · empty"
                title="Nothing here yet."
                description="This list hasn't been filled in."
              />
            )}
          </div>
        </>
      ) : (
        <>
          {/* Hero banner */}
          <div className="pp-hero">
            <div className="pp-hero-overlay" />
            <div className="pp-profile-card">
              {profileData.avatar_url && (
                <div className="public-profile-avatar pp-avatar-large">
                  <img src={profileData.avatar_url} alt={displayName} className="pp-avatar-img" />
                </div>
              )}
              <div className="pp-profile-card-body">
                <h1 className="pp-display-name">
                  {displayName}
                  {profileData.is_pro && (
                    <span className="pro-badge" title="Pro">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </span>
                  )}
                  {profileData.is_supporter && (
                    <span className="supporter-badge" title="Supporter">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </span>
                  )}
                </h1>
                <p className="public-profile-username">@{profileData.username}</p>
                <p className="pp-stats">
                  {followerCount} {followerCount === 1 ? 'follower' : 'followers'} · {publicLists.length} {publicLists.length === 1 ? 'list' : 'lists'} · {watchedCount} watched
                </p>
              </div>
              <div className="pp-hero-actions">
                {user && (
                  <button
                    className={`pp-follow-btn ${isFollowing ? 'following' : ''}`}
                    onClick={handleFollow}
                    disabled={followLoading}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
                {followError && (
                  <span style={{ fontSize: '0.8rem', color: '#c00', marginLeft: '0.5rem' }}>
                    Action failed. Please try again.
                  </span>
                )}
                <ShareButton
                  shareData={{
                    title: displayName,
                    text: `Check out ${displayName}'s watchlist on Plot`,
                    url: `${window.location.origin}/u/${profileData.username}`,
                  }}
                  variant="modal"
                  label="Share Profile"
                />
              </div>
            </div>
          </div>

          {/* Film strip marquee */}
          {filmstripItems.length > 0 && (
            <div className="pp-filmstrip">
              <div className="pp-filmstrip-track">
                {filmstripItems.map((p, i) => (
                  <img key={i} src={`https://image.tmdb.org/t/p/w92${p}`} alt="" loading="lazy" decoding="async" />
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
                <div className="pp-section-header">
                  <h2 className="pp-section-title">Recently Watched</h2>
                  <span className="pp-section-count">{watches.length}</span>
                </div>
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
                      <img src={`https://image.tmdb.org/t/p/w342${w.poster_path}`} alt={w.title || w.name} loading="lazy" decoding="async" />
                    </div>
                    <div className="pp-carousel-side">
                      <h3 className="pp-carousel-title">{w.title || w.name}</h3>
                      {w.rating && <p className="pp-carousel-stars">★ {w.rating}/10</p>}
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
                            ? <img key={idx} src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt="" loading="lazy" decoding="async" />
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
                      loading="lazy" decoding="async"
                    />
                    <p className="pp-scroll-label">{item.title || item.name}</p>
                    <p className="pp-scroll-meta">{item.media_type === 'tv' ? 'Series' : 'Film'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {publicLists.length === 0 && recentWatches.length === 0 && (
            <EmptyState
              eyebrow="Profile · quiet"
              title="Nothing public yet."
              description={`${displayName.split(' ')[0]} hasn't shared any lists or activity.`}
            />
          )}

          {!user && createPortal(
            <div className="pp-cta-a" style={{ background: heroGradient }}>
              <div className="pp-cta-a-inner">
                <p className="pp-cta-a-eyebrow">You're perusing {displayName.split(' ')[0]}'s picks</p>
                <h2 className="pp-cta-a-headline">Track what you watch.<br/>Share what you love.</h2>
                <div className="pp-cta-a-actions">
                  <a href="/signup" className="pp-cta-a-btn">Create account</a>
                  <a href="/" className="pp-cta-a-secondary">Learn more</a>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
