import { useApp } from '../hooks/useApp.js';
import { useSuggestedUsers } from '../hooks/useSuggestedUsers.js';
import UserList from './UserList.jsx';

/**
 * "People to follow" — a find-friends block backed by the `suggested_users` RPC.
 *
 * ⚠️ INTENTIONALLY UNREFERENCED RIGHT NOW. Its only render site was FeedView,
 * deleted with the social feed (#499). It is kept, not deleted, because #524
 * rehomes it into the search empty state on both apps: with no feed, nothing
 * else surfaces anyone, and mobile has no user search at all yet.
 *
 * Do not sweep this as dead code. That is exactly how the live checkout page
 * was deleted in the 2026-08-08 orphan cleanup.
 */
export default function SuggestedUsers({ heading = 'People To Follow' }) {
  const { user } = useApp();
  const { users, loading } = useSuggestedUsers(user?.id);

  if (loading || !users.length) return null;

  return (
    <section style={{ margin: '0 0 1.75rem' }}>
      <h2 style={{
        fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.1,
        color: 'var(--text-primary)', margin: '0 0 0.6rem', padding: '0 0.25rem',
      }}>
        {heading}
      </h2>
      <div style={{ padding: '0 0.25rem' }}>
        <UserList users={users} viewerId={user?.id} />
      </div>
    </section>
  );
}
