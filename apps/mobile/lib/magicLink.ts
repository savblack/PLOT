// Cold-start magic links on the iOS scene lifecycle. Expo Router reads
// ExpoLinking.getLinkingURL(), which stays empty when the URL arrives only in
// the scene connection options, so the auth callback screen never mounts.
// React Native's getInitialURL() does see that URL. The root layout and the
// callback screen both call this, and the first one wins.
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

let consumed = false;

export async function consumeMagicLink(url: string | null) {
  if (!url || consumed || !url.includes('token_hash=')) return;
  const parsed = Linking.parse(url);
  const tokenHash = (parsed.queryParams?.token_hash ?? parsed.queryParams?.token) as string | undefined;
  const type = parsed.queryParams?.type as string | undefined;
  if (!tokenHash || type !== 'magiclink') return;
  consumed = true;
  await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
}
