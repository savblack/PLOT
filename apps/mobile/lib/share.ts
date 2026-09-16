// Native transport only. URL construction and copy live in @plot/core.
import { Alert, Platform, Share } from 'react-native';
import { SHARING } from '@plot/core/copy/sharing.js';
import { track } from './analytics';

type ShareOptions = {
  url: string | null;
  title?: string;
  text?: string;
  event: string;
  eventProps?: Record<string, unknown>;
};

export async function shareLink({ url, title, text, event, eventProps = {} }: ShareOptions) {
  if (!url) return false;
  try {
    // iOS accepts a separate URL. Android needs it in the message.
    const result = await Share.share({
      title,
      message: Platform.OS === 'ios' ? (text || '') : [text, url].filter(Boolean).join('\n'),
      ...(Platform.OS === 'ios' ? { url } : {}),
    });
    if (result.action !== Share.sharedAction) return false;
    track(event, { ...eventProps, method: 'share' });
    return true;
  } catch {
    Alert.alert(SHARING.failedTitle, SHARING.failed);
    return false;
  }
}
