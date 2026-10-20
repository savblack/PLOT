/**
 * Deep-link handler for Supabase auth callbacks.
 * Supabase email links and OAuth redirect to: plot://auth/callback?...
 * This screen catches that URL and lets Supabase verify the token.
 * The root _layout auth listener then redirects to /(app).
 */
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { consumeMagicLink } from '../../lib/magicLink';
import { useTheme } from '../../contexts/ThemeContext';

// The email types whose links come back into the app (see
// app/(auth)/index.tsx AUTH_APP_CALLBACK). Recovery stays on the web.
const APP_EMAIL_TYPES: ReadonlyArray<EmailOtpType> = ['magiclink', 'signup', 'email', 'invite'];

export default function AuthCallback() {
  const { colors } = useTheme();

  useEffect(() => {
    // Handle the URL that launched this screen
    const handleUrl = async (url: string) => {
      const parsed = Linking.parse(url);
      // Supabase's default email templates redirect with `token_hash` (the
      // PKCE/OTP-verify convention); accept the older `token` name too in
      // case a custom template still uses it.
      const tokenHash = (parsed.queryParams?.token_hash ?? parsed.queryParams?.token) as string | undefined;
      const type = parsed.queryParams?.type as string | undefined;

      // The root layout may already have verified this link on cold start.
      if (type === 'magiclink') { await consumeMagicLink(url); return; }
      if (tokenHash && type && APP_EMAIL_TYPES.includes(type as EmailOtpType)) {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
        return;
      }
      // OAuth (Google) returns the session in the URL fragment. The sign-in
      // screen normally consumes it from openAuthSessionAsync's result, but a
      // redirect that reaches the app as a plain deep link lands here instead.
      // detectSessionInUrl is off (lib/configureCore.ts), so parse it by hand.
      const hash = url.split('#')[1];
      if (hash) {
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
      }
    };

    // Get the URL that opened the app (cold start)
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); });

    // Also listen for foreground deep links
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
