/**
 * Deep-link handler for Supabase auth callbacks.
 * Supabase magic-link / OAuth redirects to: plot://auth/callback?...
 * This screen catches that URL and lets Supabase parse the tokens.
 * The root _layout auth listener then redirects to /(app).
 */
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { consumeMagicLink } from '../../lib/magicLink';
import { useTheme } from '../../contexts/ThemeContext';

export default function AuthCallback() {
  const { colors } = useTheme();

  useEffect(() => {
    // detectSessionInUrl is false, so the token has to be verified here.
    Linking.getInitialURL().then(url => { void consumeMagicLink(url); });
    const sub = Linking.addEventListener('url', ({ url }) => { void consumeMagicLink(url); });
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
