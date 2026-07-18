import { useApp } from '../App.jsx';
import { useSuggestedUsers } from '../hooks/useSuggestedUsers.js';
import UserList from './UserList.jsx';

/**
 * "People to follow" — the feed's find-friends block. Shown when the following
 * feed is thin (cold start), so there's always a path to fill it.
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
