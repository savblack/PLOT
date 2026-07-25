/**
 * Deep-link handler for Supabase auth callbacks.
 * Supabase magic-link / OAuth redirects to: plot://auth/callback?...
 * This screen catches that URL and lets Supabase parse the tokens.
 * The root _layout auth listener then redirects to /(app).
 */
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';

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

      if (tokenHash && type === 'magiclink') {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      }
      // Note: detectSessionInUrl is false (lib/configureCore.ts) — there is no
      // OAuth flow on mobile today, only magic-link verified above via
      // verifyOtp. If OAuth is added later, this fragment must be parsed
      // manually too since detectSessionInUrl won't auto-consume it.
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
