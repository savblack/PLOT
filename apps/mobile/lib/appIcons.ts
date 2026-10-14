// Launcher icons are native assets, so this mobile-only catalog mirrors the
// variants registered in app.json. No web equivalent exists.
import Constants from 'expo-constants';
import type { ImageSourcePropType } from 'react-native';

type IconOption = { name: string | null; label: string; image: ImageSourcePropType };

export const APP_ICON_OPTIONS: readonly IconOption[] = [
  { name: null, label: 'Charcoal icon', image: require('../assets/icon.png') },
  { name: 'WordmarkCharcoal', label: 'Charcoal wordmark', image: require('../assets/alternate-icons/WordmarkCharcoal.png') },
  { name: 'MarkCream', label: 'Cream icon', image: require('../assets/alternate-icons/MarkCream.png') },
  { name: 'WordmarkCream', label: 'Cream wordmark', image: require('../assets/alternate-icons/WordmarkCream.png') },
  { name: 'MarkPink', label: 'Pink icon', image: require('../assets/alternate-icons/MarkPink.png') },
  { name: 'WordmarkPink', label: 'Pink wordmark', image: require('../assets/alternate-icons/WordmarkPink.png') },
  { name: 'MarkSage', label: 'Sage icon', image: require('../assets/alternate-icons/MarkSage.png') },
  { name: 'WordmarkSage', label: 'Sage wordmark', image: require('../assets/alternate-icons/WordmarkSage.png') },
];

type IconModule = typeof import('expo-alternate-app-icons');
let nativeIcons: Promise<IconModule | null> | null = null;

async function moduleIfAvailable(): Promise<IconModule | null> {
  // Expo Go and old development builds do not contain this native module.
  if (Constants.appOwnership === 'expo') return null;
  nativeIcons ??= import('expo-alternate-app-icons').catch(() => null);
  const module = await nativeIcons;
  return module?.supportsAlternateIcons ? module : null;
}

export async function currentAppIcon(): Promise<string | null | undefined> {
  const module = await moduleIfAvailable();
  return module ? module.getAppIconName() : undefined;
}

export async function applyAppIcon(name: string | null): Promise<boolean> {
  const module = await moduleIfAvailable();
  if (!module) return false;
  await module.setAlternateAppIcon(name);
  return true;
}

export async function resetAppIconWithoutPremium(): Promise<void> {
  const module = await moduleIfAvailable();
  if (module?.getAppIconName()) await module.setAlternateAppIcon(null);
}
