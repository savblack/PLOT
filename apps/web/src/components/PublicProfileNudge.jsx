import { useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { updateProfile } from '@plot/core/profile.js';

const DISMISS_KEY = 'plot_public_nudge_dismissed';

/**
 * Private accounts don't appear in anyone's feed or suggestions, so a thin
 * network stays thin. This prompts the signed-in user to go public with one tap
 * (the same profiles.is_public update the profile editor uses). Dismissible.
 */
export default function PublicProfileNudge() {
  const { user, profile, refreshProfile } = useApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);

  if (!user || !profile || profile.is_public || dismissed) return null;

  const goPublic = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await updateProfile({ userId: user.id, patch: { is_public: true } });
    setBusy(false);
    if (!error) refreshProfile?.();
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 12px)',
      padding: '0.85rem 0.9rem', margin: '0 0 1.25rem', background: 'var(--surface-raised)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Your profile is private
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, var(--text-muted))', lineHeight: 1.45, marginTop: 2 }}>
          Go public so others can find you, follow you, and see what you're watching.
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.7rem' }}>
          <button
            type="button" onClick={goPublic} disabled={busy}
            style={{
              minHeight: 32, padding: '0.35rem 0.9rem', borderRadius: 'var(--radius-pill, 999px)',
              fontSize: '0.82rem', fontWeight: 600, cursor: busy ? 'default' : 'pointer',
              background: 'var(--text-primary)', color: 'var(--surface)', border: 0, opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Updating…' : 'Make my profile public'}
          </button>
          <button
            type="button" onClick={dismiss}
            style={{
              minHeight: 32, padding: '0.35rem 0.7rem', borderRadius: 'var(--radius-pill, 999px)',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              background: 'transparent', color: 'var(--text-muted)', border: '0.75px solid var(--border)',
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
