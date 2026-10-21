// The browser mirror cannot bundle expo-modules-core (its TypeScript
// declarations are not importable by Vite). The only caller is
// modules/plot-storefront, which reads the App Store storefront; a browser has
// no native module, so it reads as missing and the storefront comes back null
// (the same fail-closed answer a non-iOS device gives).
export function requireOptionalNativeModule() {
  return null;
}
