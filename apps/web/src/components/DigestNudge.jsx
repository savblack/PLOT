import { useEffect, useRef, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { supabase } from '../api/supabase.js';
import { track, EVENTS } from '../lib/analytics.js';
import { DIGEST_NUDGE } from '../copy/digestNudge.js';

// Enough saved titles to know whether PLOT is for them. Asking on day one, at
// signup, gets a reflexive no.
const MIN_SAVED = 3;

/**
 * The one place PLOT asks for marketing email consent unprompted.
 *
 * Shown on the watchlist once someone has saved a few things, to anyone who has
 * neither opted in nor said no before — which covers both new accounts reaching
 * their third save and every account that predates the Settings toggle. The
 * dismissal is stored on the profile rather than in localStorage so the ask
 * happens once per person, not once per device.
 *
 * Consent is only ever the button below: nothing here pre-ticks, and the email
 * itself is what an unsubscribe link points back at.
 */
export default function DigestNudge() {
  const { user, profile, refreshProfile, watchlist } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [justOptedIn, setJustOptedIn] = useState(false);
  const viewed = useRef(false);

  const savedCount = watchlist?.items?.length ?? 0;
  const eligible = !!user
    && !!profile
    && !profile.marketing_emails
    && !profile.digest_prompt_dismissed_at
    && savedCount >= MIN_SAVED;

  useEffect(() => {
    if (!eligible || viewed.current) return;
    viewed.current = true;
    track(EVENTS.DIGEST_PROMPT_VIEWED, { saved_count: savedCount });
  }, [eligible, savedCount]);

  // Survives the profile refresh that makes the prompt ineligible, so the tap
  // gets an acknowledgement instead of the card just vanishing.
  if (justOptedIn) {
    return (
      <Card>
        <div style={TITLE}>{DIGEST_NUDGE.confirmedTitle}</div>
        <div style={BODY}>{DIGEST_NUDGE.confirmedBody}</div>
      </Card>
    );
  }

  if (!eligible) return null;

  const optIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ marketing_emails: true })
      .eq('id', user.id);
    setBusy(false);
    if (updateError) { setError(true); return; }
    track(EVENTS.MARKETING_EMAILS_OPTED_IN, { source: 'digest_prompt', saved_count: savedCount });
    setJustOptedIn(true);
    refreshProfile?.();
  };

  // Recorded as a decision, so this account is never asked again.
  const dismiss = async () => {
    if (busy) return;
    setBusy(true);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ digest_prompt_dismissed_at: new Date().toISOString() })
      .eq('id', user.id);
    setBusy(false);
    if (updateError) { setError(true); return; }
    track(EVENTS.DIGEST_PROMPT_DISMISSED, { saved_count: savedCount });
    refreshProfile?.();
  };

  return (
    <Card>
      <div style={TITLE}>{DIGEST_NUDGE.title}</div>
      <div style={BODY}>{DIGEST_NUDGE.body}</div>
      {error && (
        <div style={{ ...BODY, color: 'var(--danger)' }}>{DIGEST_NUDGE.failed}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={optIn} disabled={busy} style={{ ...BUTTON, ...PRIMARY, opacity: busy ? 0.6 : 1 }}>
          {busy ? DIGEST_NUDGE.optingIn : DIGEST_NUDGE.optIn}
        </button>
        <button type="button" onClick={dismiss} disabled={busy} style={{ ...BUTTON, ...SECONDARY }}>
          {DIGEST_NUDGE.dismiss}
        </button>
      </div>
    </Card>
  );
}

/* ── Presentation ── flat surface + hairline, matching PublicProfileNudge ── */

const TITLE = { fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' };
const BODY = {
  fontSize: '0.82rem', color: 'var(--text-secondary, var(--text-muted))',
  lineHeight: 1.45, marginTop: 2,
};
const BUTTON = {
  minHeight: 32, padding: '0.35rem 0.9rem', borderRadius: 'var(--radius-pill, 999px)',
  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
};
const PRIMARY = { background: 'var(--text-primary)', color: 'var(--surface)', border: 0 };
const SECONDARY = {
  background: 'transparent', color: 'var(--text-muted)', border: '0.75px solid var(--border)',
};

function Card({ children }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 12px)',
      padding: '0.85rem 0.9rem', margin: '0 0 1.25rem', background: 'var(--surface-raised)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
