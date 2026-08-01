import { useApp } from '../App.jsx';
import { useFollowRequests } from '../hooks/useFollowRequests.js';
import { COMMON } from '../copy/common.js';

const styles = `
  .req-view { max-width: 560px; margin: 0 auto; padding: 1rem 1rem 3rem; }
  .req-intro { font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); margin: 0 0 1.5rem; }
  .req-row {
    display: flex; align-items: center; gap: 0.85rem;
    padding: 0.85rem 0; border-bottom: 1px solid var(--border);
  }
  .req-avatar {
    width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0; object-fit: cover;
    background: var(--surface-raised); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-serif); font-size: 1.2rem; color: var(--text-muted);
  }
  .req-id { flex: 1; min-width: 0; }
  .req-name { font-weight: 600; font-size: 0.95rem; color: var(--text-primary); }
  .req-handle { font-size: 0.82rem; color: var(--text-muted); }
  .req-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
  .req-btn {
    min-height: 38px; padding: 0.5rem 0.95rem; border-radius: var(--radius-pill);
    font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none;
    transition: opacity 0.15s ease;
  }
  .req-btn:hover { opacity: 0.85; }
  .req-btn--approve { background: var(--text-primary); color: var(--surface); }
  .req-btn--decline { background: transparent; color: var(--text-secondary); border: 0.75px solid var(--border); }
  .req-empty { text-align: center; color: var(--text-muted); font-size: 0.92rem; padding: 3rem 1rem; line-height: 1.6; }
`;

export default function RequestsView() {
  const { user } = useApp();
  const { requests, loading, approve, decline } = useFollowRequests(user?.id);

  return (
    <>
      <style>{styles}</style>
      <div className="req-view">
        <p className="req-intro">People asking to follow your private profile. Approving lets them see your watch count, recent watches and lists.</p>

        {loading ? (
          <p className="req-empty">{COMMON.loading}</p>
        ) : requests.length === 0 ? (
          <p className="req-empty">No pending requests.<br />When someone asks to follow you, they’ll show up here.</p>
        ) : (
          requests.map((r) => (
            <div className="req-row" key={r.follower_id}>
              {r.avatar_url
                ? <img className="req-avatar" src={r.avatar_url} alt="" />
                : <div className="req-avatar">{(r.display_name || r.username || '?').charAt(0).toUpperCase()}</div>}
              <div className="req-id">
                <div className="req-name">{r.display_name || r.username}</div>
                <div className="req-handle">@{r.username}</div>
              </div>
              <div className="req-actions">
                <button type="button" className="req-btn req-btn--approve" onClick={() => approve(r.follower_id)}>Approve</button>
                <button type="button" className="req-btn req-btn--decline" onClick={() => decline(r.follower_id)}>Decline</button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
