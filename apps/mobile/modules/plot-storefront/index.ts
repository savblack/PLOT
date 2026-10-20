/**
 * The App Store storefront country, or null when it cannot be read: any
 * platform but iOS, a dev build made before this module was added, or StoreKit
 * not answering. Callers treat null as "do not offer a purchase link"
 * (@plot/core/purchaseLinkOut.js fails closed).
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type PlotStorefrontNative = { getCountryCode(): Promise<string | null> };

const native = requireOptionalNativeModule<PlotStorefrontNative>('PlotStorefront');

export async function getStorefrontCountry(): Promise<string | null> {
  if (Platform.OS !== 'ios' || !native) return null;
  try {
    return (await native.getCountryCode()) ?? null;
  } catch {
    return null;
  }
}
