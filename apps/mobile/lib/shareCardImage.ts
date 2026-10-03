// Capture and hand off a share card. The PNG is the native card (1200×800 or
// 1080×1920), the same tree the sheet previews. iOS attaches the file through
// the system share sheet. Saving uses the photo library. Neither call is made
// until the button is pressed, so a binary that predates these native modules
// still opens History.
import { Platform, Share, type View } from 'react-native';
import type { RefObject } from 'react';

export async function captureShareCard(ref: RefObject<View | null>): Promise<string> {
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
}

/** True when the person completed the system share sheet, not when they dismissed it. */
export async function shareCardFile(uri: string, caption: string): Promise<boolean> {
  const result = await Share.share(
    Platform.OS === 'ios'
      ? { url: uri, message: caption }
      : { message: caption, title: 'plot' },
  );
  return result.action === Share.sharedAction;
}

export async function saveCardToPhotos(uri: string): Promise<void> {
  const MediaLibrary = await import('expo-media-library');
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('photos');
  await MediaLibrary.Asset.create(uri);
}
