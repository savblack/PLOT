import { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
// The bulk of the app's CSS (~4800 lines: every authenticated view — Discover,
// Settings, Calendar, etc.) lives here instead of the global stylesheet, so
// visitors who never reach the app shell (/login, /terms, /save, ...) don't pay
// for it. Pure/context helpers that other code needs (TMDB image helpers,
// AppContext/useApp, date-display helpers) live in their own modules under
// ./utils and ./hooks so code outside the shell can use them without pulling
// in this chunk.
import './styles/app.css';
import { supabase } from './api/supabase.js';
import { setTmdbRegion } from './api/tmdb.js';
import { setUserTimezone } from './utils/date.js';
import AppShell from './components/AppShell.jsx';
import MediaPanel from './components/MediaPanel.jsx';
import { useTheme } from './hooks/useTheme.js';
import { useWatchlist }    from './hooks/useWatchlist.js';
import { usePendingSave }  from './hooks/usePendingSave.js';
import { usePendingReferral } from './hooks/usePendingReferral.js';
import { useWatching }     from './hooks/useWatching.js';
import { useReminders }    from './hooks/useReminders.js';
import { useTopLists }     from './hooks/useTopLists.js';
import { useFavorites }    from './hooks/useFavorites.js';
import { useCustomLists }  from './hooks/useCustomLists.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { pathForView, viewFromPath } from './navigation.js';
import { readStorage, writeStorage } from './utils/storage.js';
import { readCachedSession, writeCachedSession, clearCachedSession } from './utils/sessionCache.js';
import { track, EVENTS, setPersonProps } from './lib/analytics.js';
import { personPropsFromProfile } from '@plot/core/analyticsEvents.js';
import { updateProfile } from '@plot/core/profile.js';
import { AppContext, useApp } from './hooks/useApp.js';

export { useApp };

/* ── Timezone mismatch banner ─────────── */
const TZ_DISMISS_KEY = 'plot_tz_dismissed';
const TZ_NUDGE_DAYS  = 7;

function TimezoneBanner({ deviceTz, onUpdate, onDismiss }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--tab-bar-height, 56px) + 0.75rem)',
      left: '0.75rem',
      right: '0.75rem',
      background: 'var(--surface-raised)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '0.85rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      zIndex: 900,
    }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
        Looks like you're in <span style={{ fontWeight: 600 }}>{deviceTz}</span>. Want to update your timezone so new releases drop at the right time?
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={onUpdate}>
          Update to {deviceTz}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}

/* ── Save-to-watchlist confirmation toast ───── */
function SaveToast({ toast, onClose }) {
  const isError = toast.status === 'error';
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(92vw, 420px)',
        background: 'var(--surface-raised)',
        border: `1px solid ${isError ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.35)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '0.7rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        zIndex: 1200,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ color: isError ? '#f87171' : '#4ade80', fontSize: '1rem', flexShrink: 0 }}>
        {isError ? '✕' : '✓'}
      </span>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {toast.message}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════
   App Component (layout shell)
═══════════════════════════════════════ */
export default function App() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { theme, setTheme } = useTheme();

  const [user,    setUser]    = useState(() => {
    const cached = readCachedSession();
    return cached ? { id: cached.userId } : null;
  });
  const [profile, setProfile] = useState(() => readCachedSession()?.profile ?? null);
  const [loading, setLoading] = useState(() => !readCachedSession());

  // Media panel state
  const [panelItem,    setPanelItem]    = useState(null);
  const [panelClosing, setPanelClosing] = useState(false);

  const [tzCheckTime, setTzCheckTime] = useState(() => Date.now());

  // Confirmation toast for "save to watchlist" deep links
  const [saveToast, setSaveToast] = useState(null);

  /* ── Profile loader ── */
  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, region, timezone, onboarding_complete, guide_channels, streaming_providers, genres, include_kids_content, watchlist_availability_alerts, marketing_emails, digest_prompt_dismissed_at, calendar_token, username, display_name, is_public, is_premium, is_supporter, last_kofi_tip_at, avatar_url, bio, links')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data);
    if (data?.region) setTmdbRegion(data.region);
    setUserTimezone(data?.timezone || null);
    // Keep all badges on the PostHog person so any event can be segmented by
    // them — paying and tipping are different behaviours worth telling apart.
    if (data) setPersonProps(personPropsFromProfile(data));
    setLoading(false);
    if (data) writeCachedSession(userId, data);
    else clearCachedSession();
  }, []);

  /* ── Auth ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setLoading(false); clearCachedSession(); }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); clearCachedSession(); }
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  /* ── Timezone mismatch check ── */
  const tzBanner = useMemo(() => {
    if (!profile?.timezone) return null; // no saved tz yet — onboarding will set it
    let deviceTz = 'UTC';
    try { deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* unsupported */ }
    if (deviceTz === profile.timezone) return null; // matches — no nudge needed

    // Check dismissal
    try {
      const raw = readStorage(TZ_DISMISS_KEY);
      if (raw) {
        const { at, deviceTz: dismissedFor } = JSON.parse(raw);
        const daysSince = (tzCheckTime - at) / 86400000;
        if (dismissedFor === deviceTz && daysSince < TZ_NUDGE_DAYS) return null;
      }
    } catch { /* corrupt storage — ignore */ }

    return { deviceTz };
  }, [profile, tzCheckTime]);

  const handleTzUpdate = useCallback(async () => {
    if (!tzBanner || !user) return;
    await updateProfile({ userId: user.id, patch: { timezone: tzBanner.deviceTz } });
    loadProfile(user.id);
  }, [tzBanner, user, loadProfile]);

  const handleTzDismiss = useCallback(() => {
    if (!tzBanner) return;
    const dismissedAt = Date.now();
    writeStorage(TZ_DISMISS_KEY, JSON.stringify({ at: dismissedAt, deviceTz: tzBanner.deviceTz }));
    setTzCheckTime(dismissedAt);
  }, [tzBanner]);

  /* ── Media Panel ── */
  const openPanel = useCallback((id, type, source) => {
    setPanelItem({ id, type });
    setPanelClosing(false);
    // Canonical "opened a title" action — every surface (rails, search, feed,
    // deep links) routes through here, so one call covers them all.
    track(EVENTS.TITLE_VIEWED, { tmdb_id: id, media_type: type, source });
  }, []);

  const closePanel = useCallback(() => {
    setPanelClosing(true);
    setTimeout(() => { setPanelItem(null); setPanelClosing(false); }, 280);
  }, []);

  /* ── Navigation ── */
  const navigateTo = useCallback((view) => navigate(pathForView(view)), [navigate]);

  const currentView = viewFromPath(location.pathname);

  /* ── Global data hooks ── */
  const watchlist    = useWatchlist(user?.id);
  const watching     = useWatching(user?.id);
  const reminders    = useReminders(user?.id);
  const topLists     = useTopLists(user?.id);
  const favorites    = useFavorites(user?.id, { watching, watchlist });
  const customLists  = useCustomLists(user?.id);

  /* ── Pending "save to watchlist" deep link (newsletter / chart page) ── */
  const handleSaveResult = useCallback((result) => {
    setSaveToast(result);
  }, []);
  usePendingSave({ user, watchlist, openPanel, onResult: handleSaveResult });
  usePendingReferral({ user });

  // Auto-dismiss the save confirmation toast
  useEffect(() => {
    if (!saveToast) return;
    const t = setTimeout(() => setSaveToast(null), 4500);
    return () => clearTimeout(t);
  }, [saveToast]);

  const refreshProfile = useCallback(() => {
    if (user?.id) loadProfile(user.id);
  }, [user, loadProfile]);

  if (loading) {
    return (
      <div className="app-boot-loader">
        <PlotLoader />
      </div>
    );
  }

  const ctx = {
    user,
    profile,
    theme,
    setTheme,
    openPanel,
    closePanel,
    navigateTo,
    watchlist,
    watching,
    reminders,
    topLists,
    favorites,
    customLists,
    refreshProfile,
  };

  return (
    <AppContext.Provider value={ctx}>
      <AppShell currentView={currentView} navigateTo={navigateTo} profile={profile} user={user}>
        <Outlet />
      </AppShell>

      {panelItem && (
        <MediaPanel
          itemId={panelItem.id}
          itemType={panelItem.type}
          closing={panelClosing}
          onClose={closePanel}
        />
      )}

      {saveToast && (
        <SaveToast toast={saveToast} onClose={() => setSaveToast(null)} />
      )}

      {tzBanner && (
        <TimezoneBanner
          deviceTz={tzBanner.deviceTz}
          onUpdate={handleTzUpdate}
          onDismiss={handleTzDismiss}
        />
      )}
    </AppContext.Provider>
  );
}
