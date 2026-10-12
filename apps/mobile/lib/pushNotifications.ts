// Native permission and token registration are mobile-only. The preference and
// Premium gate are shared/server-side in @plot/core and Postgres.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
let currentToken: string | null = null;

function allowed(settings: Notifications.NotificationPermissionsStatus) {
  return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function registerPushToken(askPermission: boolean): Promise<'ok' | 'denied' | 'unavailable'> {
  if (!projectId || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('title-alerts', {
      name: 'Title alerts', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!allowed(permission) && askPermission) permission = await Notifications.requestPermissionsAsync();
  if (!allowed(permission)) return 'denied';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) throw error;
  currentToken = token;
  return 'ok';
}

export function listenForTokenChanges() {
  return Notifications.addPushTokenListener(async () => {
    // A token can rotate while the app is open. The current session is checked
    // by register_push_token; there is no service credential in the app.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await registerPushToken(false);
  });
}

export async function unregisterPushToken(userId: string) {
  // Call before signOut while the RLS session still exists.
  if (!currentToken && projectId && allowed(await Notifications.getPermissionsAsync())) {
    currentToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }
  if (!currentToken) return;
  const { error } = await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', currentToken);
  if (error) throw error;
  currentToken = null;
}
