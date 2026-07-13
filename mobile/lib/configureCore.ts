// Injects the mobile (Expo) environment into the shared core. Import this FIRST
// at the app root (app/_layout.tsx) — before any core data call runs.
// Web does the equivalent in src/main.jsx. Core reads these via getConfig().
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure } from '@plot/core/config.js';

configure({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  tmdbProxyUrl: process.env.EXPO_PUBLIC_TMDB_PROXY_URL ?? '',
  traktClientId: process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID ?? '',
  isDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  // The storage seam: mobile persists the Supabase session via AsyncStorage.
  supabaseClientOptions: {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
});
