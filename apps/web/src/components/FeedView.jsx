import { useEffect, useRef } from 'react';
import { useApp } from '../App.jsx';
import { useFeed } from '../hooks/useFeed.js';
import FeedPost from './FeedPost.jsx';

export default function FeedView() {
  const { user } = useApp();
  const { items, source, loading, loadingMore, hasMore, loadMore } = useFeed(user?.id);
  const sentinelRef = useRef(null);

  // Infinite scroll: fetch the next page when the sentinel nears the viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '600px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0.5rem 1rem 4rem' }}>
      {source === 'global' && !loading && items.length > 0 && (
        <p style={{
          fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-muted)', padding: '0.5rem 0.25rem 0.85rem', margin: 0,
        }}>
          Popular right now
        </p>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem', lineHeight: 1.6 }}>
          Your feed is empty.<br />Follow people to see what they're watching.
        </p>
      ) : (
        <>
          {items.map(post => <FeedPost key={post.id} post={post} />)}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {loadingMore && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 1rem' }}>Loading…</p>
          )}
          {!hasMore && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 1rem', fontSize: '0.82rem' }}>
              You're all caught up.
            </p>
          )}
        </>
      )}
    </div>
  );
}
