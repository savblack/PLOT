import DigestNudge from '../components/DigestNudge.jsx';
import { MockAppProvider } from '../testing/MockAppProvider.jsx';
import { mockAppContextValue, mockProfile } from '../testing/mockAppContext.js';

// The prompt reads the watchlist length to decide whether to show at all.
const withSaves = (count) => ({
  ...mockAppContextValue.watchlist,
  items: Array.from({ length: count }, (_, i) => ({ tmdb_id: i + 1, media_type: 'movie' })),
});

/*
 * Three of the four states below render nothing at all — that is the whole point
 * of them, and an empty canvas is indistinguishable from a broken story. So each
 * case is framed: a label, a dashed box holding whatever the component actually
 * returns, and the reason underneath. An empty dashed box is the pass condition.
 */
const Case = ({ title, why, profile, saves }) => (
  <div style={{ marginBottom: '1.75rem', maxWidth: 620 }}>
    <div style={{
      fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--text-muted)', marginBottom: '0.5rem',
    }}>
      {title}
    </div>
    <div style={{
      border: '1px dashed var(--border)', borderRadius: 12, padding: '0.75rem',
      minHeight: 56, display: 'flex', alignItems: 'center',
    }}>
      <div style={{ width: '100%' }}>
        <MockAppProvider value={{ profile: { ...mockProfile, ...profile }, watchlist: withSaves(saves) }}>
          <DigestNudge />
        </MockAppProvider>
      </div>
    </div>
    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.45 }}>
      {why}
    </div>
  </div>
);

export default {
  title: 'Components/DigestNudge',
  component: DigestNudge,
};

// The only state a user ever sees: a few saves in, never asked before.
export const Eligible = {
  render: () => (
    <Case
      title="Eligible"
      why="Three saves in, never asked before. The only state a user actually sees."
      profile={{ marketing_emails: false }}
      saves={3}
    />
  ),
};

// Every state at once — the useful view for reviewing when this does and does
// not appear, since three of the four are deliberately empty.
export const AllStates = () => (
  <div>
    <Case
      title="Eligible"
      why="Three saves in, never asked before. The only state a user actually sees."
      profile={{ marketing_emails: false }}
      saves={3}
    />
    <Case
      title="Too few saves — renders nothing"
      why="Two saves. The ask waits until someone has used PLOT enough to have an opinion about it, so nothing renders."
      profile={{ marketing_emails: false }}
      saves={2}
    />
    <Case
      title="Already opted in — renders nothing"
      why="marketing_emails is already true, so there is nothing to ask for."
      profile={{ marketing_emails: true }}
      saves={12}
    />
    <Case
      title="Dismissed — renders nothing"
      why="digest_prompt_dismissed_at is set. One no is final, and because it lives on the profile rather than in localStorage it holds on every device."
      profile={{ marketing_emails: false, digest_prompt_dismissed_at: '2026-07-01T00:00:00Z' }}
      saves={12}
    />
  </div>
);
