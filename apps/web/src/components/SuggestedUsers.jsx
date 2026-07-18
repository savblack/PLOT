import { useApp } from '../App.jsx';
import { useSuggestedUsers } from '../hooks/useSuggestedUsers.js';
import UserList from './UserList.jsx';

/**
 * "People to follow" — the feed's find-friends block. Shown when the following
 * feed is thin (cold start), so there's always a path to fill it.
 */
export default function SuggestedUsers({ heading = 'People to follow' }) {
  const { user } = useApp();
  const { users, loading } = useSuggestedUsers(user?.id);

  if (loading || !users.length) return null;

  return (
    <section style={{ margin: '0 0 1.75rem' }}>
      <h2 style={{
        fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-muted)', margin: '0 0 0.35rem', padding: '0 0.25rem',
      }}>
        {heading}
      </h2>
      <div style={{ padding: '0 0.25rem' }}>
        <UserList users={users} viewerId={user?.id} />
      </div>
    </section>
  );
}
