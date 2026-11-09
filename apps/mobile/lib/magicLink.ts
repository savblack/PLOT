// Cold-start magic links on the iOS scene lifecycle. Expo Router reads
// ExpoLinking.getLinkingURL(), which stays empty when the URL arrives only in
// the scene connection options, so the auth callback screen never mounts.
// React Native's getInitialURL() does see that URL. The root layout and the
// callback screen both call this, and the first one wins.
//
// plot://auth/callback also never reaches app/(auth)/callback.tsx while the
// app is running: expo-router reads it as /auth/callback, which no route
// matches, so +not-found sends it home. Handling it here is what makes these
// links sign in at all.
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { reportBypassSignupConfirmed } from './bypassSignupReport';

let consumedUrl: string | null = null;

export async function consumeMagicLink(url: string | null) {
  if (!url || consumedUrl === url) return;
  if (!url.includes('token_hash=')) {
    await consumeSessionFragment(url);
    return;
  }
  const parsed = Linking.parse(url);
  const tokenHash = (parsed.queryParams?.token_hash ?? parsed.queryParams?.token) as string | undefined;
  const type = parsed.queryParams?.type as string | undefined;
  if (!tokenHash || type !== 'magiclink') return;
  consumedUrl = url;
  await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
}

// signup-bypass links come from the Admin API's generateLink, so GoTrue
// verifies them itself and redirects with the session in the fragment
// (plot://auth/callback#access_token=…&refresh_token=…) instead of a
// token_hash. detectSessionInUrl is off (lib/configureCore.ts).
async function consumeSessionFragment(url: string) {
  if (!url.includes('auth/callback')) return;
  const hash = url.split('#')[1];
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return;
  consumedUrl = url;
  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return;
  await reportBypassSignupConfirmed(data.user);
}
