import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useAppData } from '../contexts/AppDataContext';
import { usePushAlerts } from '@plot/core/usePushAlerts.js';
import { listenForTokenChanges, registerPushToken } from '../lib/pushNotifications';

type PushTarget = { notificationId: string; tmdbId: number; mediaType: 'movie' | 'tv'; userId: string };

function targetOf(response: Notifications.NotificationResponse | null | undefined): PushTarget | null {
  const data = response?.notification.request.content.data;
  if (!data || typeof data.notificationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.notificationId)) return null;
  if (typeof data.tmdbId !== 'number' || !Number.isSafeInteger(data.tmdbId) || data.tmdbId <= 0) return null;
  if (data.mediaType !== 'movie' && data.mediaType !== 'tv') return null;
  if (typeof data.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.userId)) return null;
  return { notificationId: data.notificationId, tmdbId: data.tmdbId, mediaType: data.mediaType, userId: data.userId };
}

/** Mounted after auth is known; keeps cold-start taps until onboarding finishes. */
export default function PushHost({ signedIn, onboardingComplete }: { signedIn: boolean; onboardingComplete: boolean | null }) {
  const { userId } = useAppData();
  const router = useRouter();
  const push = usePushAlerts(userId);
  const [pending, setPending] = useState<PushTarget | null>(null);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then(response => {
      const target = targetOf(response);
      if (target) setPending(target);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const target = targetOf(response);
      if (target) setPending(target);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!signedIn || onboardingComplete !== true || !pending || !userId) return;
    if (pending.userId !== userId) { setPending(null); return; }
    router.push(`/(app)/notifications?open=${encodeURIComponent(pending.notificationId)}&title=${pending.tmdbId}&kind=${pending.mediaType}` as Href);
    setPending(null);
    void Notifications.clearLastNotificationResponseAsync();
  }, [signedIn, onboardingComplete, pending, router, userId]);

  useEffect(() => {
    if (!signedIn || !userId || push.loading || !push.enabled) return;
    // The OS prompt only happens on an explicit tap in Settings or the title
    // panel. On cold start this silently refreshes a previously granted token.
    void registerPushToken(false).catch(() => {});
    const sub = listenForTokenChanges();
    return () => sub.remove();
  }, [signedIn, userId, push.loading, push.enabled]);

  return null;
}
