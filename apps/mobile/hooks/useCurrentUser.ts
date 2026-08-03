import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { setUserTimezone } from '@plot/core/date.js';

interface Profile {
  id: string;
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_public?: boolean;
  region?: string;
  timezone?: string;
  streaming_providers?: Array<{ id: number; name: string; logo_path?: string | null }>;
  guide_channels?: Array<{ id: number; name: string; logo_path?: string | null }>;
  calendar_token?: string | null;
  is_premium?: boolean;
  log_rewatches?: boolean;
}

export function useCurrentUser() {
  const [userId,  setUserId]  = useState<string | null>(null);
  const [user,    setUser]    = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = async (uid: string, isMounted: () => boolean) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (!isMounted() || !data) return;
    setProfile(data);
    // Every date helper in @plot/core/date.js reads this. Applied on the
    // initial load and on every refreshProfile() so a timezone change made
    // anywhere takes effect app-wide. Null falls back to the device timezone.
    setUserTimezone(data.timezone || null);
  };

  useEffect(() => {
    let mounted = true;
    const applySession = (session: any) => {
      if (!mounted) return;
      if (session?.user) {
        setUserId(session.user.id);
        setUser(session.user);
        loadProfile(session.user.id, () => mounted);
      } else {
        setUserId(null);
        setUser(null);
        setProfile(null);
      }
    };
    supabase.auth.getSession().then(({ data: { session } }) => applySession(session));
    // Track login/logout too — the hook now lives in the root AppDataProvider,
    // which mounts once and never remounts across auth transitions.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const refreshProfile = () => {
    if (userId) loadProfile(userId, () => true);
  };

  return { userId, user, profile, refreshProfile };
}
